using System.Security.Claims;
using FormulaD.Mes.Api;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseWindowsService();

// --- Журнал событий ---------------------------------------------------------
// Общий для всех операций записи, заводится один раз до них (docs/DEVELOPMENT_PLAN.md,
// Этап 1), а не пристраивается к каждой новой пишущей функции отдельно.
var eventLog = new InMemoryEventLog();
builder.Services.AddSingleton<IEventLog>(eventLog);

// --- Источник данных -------------------------------------------------------
// Demo по умолчанию. Sql допускается только к отдельному TEST-экземпляру с
// read-only учётной записью (см. SqlOptions): любая неполная или похожая на PROD
// настройка — контролируемая ошибка запуска, без fallback на Demo и без fallback на PROD.
var dataSource = builder.Configuration["DataSource"] ?? "Demo";
switch (dataSource.ToLowerInvariant())
{
    case "demo":
        var fixturePath = builder.Configuration["Demo:FixturePath"]
                          ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "production-plan.demo.json");
        var demoReader = new DemoProductionPlanReader(fixturePath, eventLog);
        builder.Services.AddSingleton<IProductionPlanReader>(demoReader);
        // Правка порядка и переходы по статусам существуют только у демо-источника.
        builder.Services.AddSingleton<IPlanOrderEditor>(demoReader);
        builder.Services.AddSingleton<IPlanTransitions>(demoReader);
        builder.Services.AddSingleton<IJobCardPrinter>(demoReader);
        builder.Services.AddSingleton<IPlanPublisher>(demoReader);

        // NCP — тоже только демо: точная схема dbo.tblNCP не обследована (см. Ncp.cs).
        var ncpPath = builder.Configuration["Demo:NcpFixturePath"]
                     ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "ncp.demo.json");
        var componentsPath = builder.Configuration["Demo:ComponentsFixturePath"]
                            ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "components.demo.json");
        var ncpStore = new DemoNcpStore(ncpPath, componentsPath, demoReader, eventLog);
        builder.Services.AddSingleton<INcpReader>(ncpStore);
        builder.Services.AddSingleton<INcpWriter>(ncpStore);

        // Отметки проверки компонентов по станциям (Этап 5) — тоже только демо.
        builder.Services.AddSingleton<IStationChecks>(new DemoStationChecks(demoReader, ncpStore, eventLog));

        // Импорт плана (Этап 8) — справочники модели/цвета/комплектации свои, не связаны с NCP.
        var modelsPath = builder.Configuration["Demo:ModelsFixturePath"]
                        ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "models.demo.json");
        var colorsPath = builder.Configuration["Demo:ColorsFixturePath"]
                        ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "colors.demo.json");
        var specificationsPath = builder.Configuration["Demo:SpecificationsFixturePath"]
                                ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "specifications.demo.json");
        builder.Services.AddSingleton<IPlanImport>(
            new DemoPlanImport(modelsPath, colorsPath, specificationsPath, demoReader, demoReader, eventLog));

        // Входной контроль (Этап 9) — свои справочники поставщиков/нормативов, своя (мутируемая)
        // копия каталога компонентов, не связана со справочником NCP/станций (см. IncomingInspection.cs).
        var suppliersPath = builder.Configuration["Demo:SuppliersFixturePath"]
                           ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "suppliers.demo.json");
        var quotasPath = builder.Configuration["Demo:InspectionQuotasFixturePath"]
                        ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "inspection-quotas.demo.json");
        var incomingInspection = new DemoIncomingInspectionStore(suppliersPath, quotasPath, componentsPath, eventLog);
        builder.Services.AddSingleton<IIncomingInspectionReader>(incomingInspection);
        builder.Services.AddSingleton<IIncomingInspectionWriter>(incomingInspection);
        break;

    case "sql":
        var sqlOptions = SqlOptions.Create(builder.Configuration);
        builder.Services.AddSingleton(sqlOptions);
        builder.Services.AddSingleton<IProductionPlanReader>(sp => new SqlProductionPlanReader(sp.GetRequiredService<SqlOptions>()));
        break;

    default:
        throw new InvalidOperationException(
            $"DataSource='{dataSource}' не поддерживается. Допустимо 'Demo' или 'Sql' (только TEST-экземпляр).");
}

// --- Dev-аутентификация ----------------------------------------------------
// Включается только явно, только в Development и только при заданном секрете
// (user-secrets / env). Пароля по умолчанию нет и быть не может.
var devAuth = new DevAuthOptions(
    Enabled: builder.Configuration.GetValue("DevAuth:Enabled", false) && builder.Environment.IsDevelopment(),
    Username: builder.Configuration["DevAuth:Username"],
    Password: builder.Configuration["DevAuth:Password"]);
builder.Services.AddSingleton(devAuth);

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "formulad.mes.session";
        options.Cookie.HttpOnly = true;
        // ponytail: SameSite=Strict + проверка Origin на login вместо отдельных antiforgery-токенов;
        // добавить antiforgery, если появятся cross-site сценарии или не-loopback вход.
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;
        options.SlidingExpiration = true;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        // API не редиректит на страницу входа — возвращаем коды.
        options.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
        options.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
    });
builder.Services.AddAuthorization();
builder.Services.AddProblemDetails();

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddOpenApi();
}

var app = builder.Build();

// Имя источника безопасно: хост, база и учётка в логи не попадают.
app.Logger.LogInformation("Источник данных: {DataSource}", dataSource);

if (!devAuth.CanLogIn)
{
    app.Logger.LogWarning(
        "Dev-аутентификация выключена (DevAuth:Enabled={Enabled}, секрет задан={HasSecret}). " +
        "Защищённые эндпоинты будут возвращать 401.", devAuth.Enabled, devAuth.HasCredentials);
}

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

var api = app.MapGroup("/api/v1");

// Liveness: без аутентификации и без любых сведений о конфигурации/БД/хосте.
api.MapGet("/health/live", () => Results.Ok(new { status = "ok" })).AllowAnonymous();

var plan = api.MapGroup("/production-plan").RequireAuthorization();

plan.MapGet("/statuses", async (IProductionPlanReader reader, CancellationToken ct) =>
    Results.Ok(await reader.GetStatusesAsync(ct)));

plan.MapGet("", async (
    IProductionPlanReader reader,
    CancellationToken ct,
    string? vin = null,
    string? status = null,
    int? statusId = null,
    int page = 1,
    int pageSize = 25) =>
{
    if (vin is { Length: > 50 })
    {
        return Problem("Некорректный VIN", "Длина VIN не может превышать 50 символов.");
    }
    if (page < 1)
    {
        return Problem("Некорректная страница", "Номер страницы должен быть не меньше 1.");
    }
    if (pageSize is < 1 or > 100)
    {
        return Problem("Некорректный размер страницы", "pageSize должен быть в диапазоне 1..100.");
    }

    var result = await reader.GetPageAsync(new ProductionPlanQuery(vin, status, statusId, page, pageSize), ct);
    return Results.Ok(result);
});

plan.MapGet("/{vin}", async (string vin, IProductionPlanReader reader, CancellationToken ct) =>
{
    if (vin.Length is 0 or > 50)
    {
        return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
    }
    var item = await reader.GetByVinAsync(vin, ct);
    return item is null
        ? Results.Problem(title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.", statusCode: StatusCodes.Status404NotFound)
        : Results.Ok(item);
});

// Единственная операция записи во всём API и только над демо-данными в памяти:
// в SQL-режиме IPlanOrderEditor не зарегистрирован, поэтому маршрут не создаётся.
if (string.Equals(dataSource, "Demo", StringComparison.OrdinalIgnoreCase))
{
    plan.MapPost("/{vin}/move", async (
        string vin,
        MoveRequest request,
        IPlanOrderEditor editor,
        IProductionPlanReader reader,
        ClaimsPrincipal user,
        CancellationToken ct) =>
    {
        if (vin.Length is 0 or > 50)
        {
            return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
        }
        if (request.ToPosition < 1)
        {
            return Problem("Некорректная позиция", "Номер позиции должен быть положительным.");
        }

        var outcome = await editor.MoveAsync(vin, request.ToPosition, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            MoveOutcome.Ok => Results.Ok(await reader.GetByVinAsync(vin, ct)),
            MoveOutcome.VinNotFound => Results.Problem(
                title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.",
                statusCode: StatusCodes.Status404NotFound),
            MoveOutcome.NoPosition => Problem(
                "Нет позиции в плане", "У изделия не задан порядок запуска, перемещать нечего."),
            _ => Problem("Позиция не найдена", "В плане нет позиции с таким номером."),
        };
    });

    // Запуск в производство: 0 → 1 (раздел 10 спецификации). Как и /move — только демо.
    plan.MapPost("/{vin}/start", async (
        string vin, IPlanTransitions transitions, ClaimsPrincipal user, CancellationToken ct) =>
    {
        if (vin.Length is 0 or > 50)
        {
            return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
        }

        var (outcome, item) = await transitions.StartAsync(vin, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            TransitionOutcome.Ok => Results.Ok(item),
            TransitionOutcome.VinNotFound => Results.Problem(
                title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.",
                statusCode: StatusCodes.Status404NotFound),
            _ => Problem(
                "Нельзя запустить",
                $"Изделие уже в статусе «{StatusLabel(item?.StatusId)}», ожидался «{StatusLabel(0)}»."),
        };
    });

    // Завершение сборки: 1 → 2 (раздел 13). Открытые NCP намеренно не проверяются здесь —
    // автоматическая блокировка завершения по ОТК не согласована спецификацией ([П]).
    plan.MapPost("/{vin}/complete", async (
        string vin, IPlanTransitions transitions, ClaimsPrincipal user, CancellationToken ct) =>
    {
        if (vin.Length is 0 or > 50)
        {
            return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
        }

        var (outcome, item) = await transitions.CompleteAsync(vin, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            TransitionOutcome.Ok => Results.Ok(item),
            TransitionOutcome.VinNotFound => Results.Problem(
                title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.",
                statusCode: StatusCodes.Status404NotFound),
            _ => Problem(
                "Нельзя завершить",
                $"Изделие уже в статусе «{StatusLabel(item?.StatusId)}», ожидался «{StatusLabel(1)}»."),
        };
    });

    // Final OK: 2 → 3 (раздел 18). Допуск блокируется незакрытой обязательной деталью
    // (раздел 16) — это проверка по NCP.PartInstalled, а не по статусу самой заявки.
    plan.MapPost("/{vin}/fok", async (
        string vin, IPlanTransitions transitions, INcpReader ncp, ClaimsPrincipal user, CancellationToken ct) =>
    {
        if (vin.Length is 0 or > 50)
        {
            return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
        }

        var missing = await ncp.GetMissingRequiredPartsAsync(vin, ct);
        if (missing.Count > 0)
        {
            var numbers = string.Join(", ", missing.Select(m => m.Number));
            return Problem("FOK недоступен", $"Есть незакрытая обязательная деталь: {numbers}.");
        }

        var (outcome, item) = await transitions.FokAsync(vin, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            TransitionOutcome.Ok => Results.Ok(item),
            TransitionOutcome.VinNotFound => Results.Problem(
                title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.",
                statusCode: StatusCodes.Status404NotFound),
            _ => Problem(
                "Нельзя подтвердить FOK",
                $"Изделие уже в статусе «{StatusLabel(item?.StatusId)}», ожидался «{StatusLabel(2)}»."),
        };
    });

    // Rework (раздел 17): 2 → 4 по явному действию. Строим только этот переход —
    // прямой 1 → 4 не согласован (В-07, см. IPlanTransitions.SendToReworkAsync).
    plan.MapPost("/{vin}/rework", async (
        string vin, IPlanTransitions transitions, ClaimsPrincipal user, CancellationToken ct) =>
    {
        if (vin.Length is 0 or > 50)
        {
            return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
        }

        var (outcome, item) = await transitions.SendToReworkAsync(vin, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            TransitionOutcome.Ok => Results.Ok(item),
            TransitionOutcome.VinNotFound => Results.Problem(
                title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.",
                statusCode: StatusCodes.Status404NotFound),
            _ => Problem(
                "Нельзя отправить в Rework",
                $"Изделие в статусе «{StatusLabel(item?.StatusId)}», ожидался «{StatusLabel(2)}»."),
        };
    });

    // Завершение Rework: 4 → 2 (раздел 277, [П]) — та же проверка обязательной детали, что у FOK.
    plan.MapPost("/{vin}/rework/finish", async (
        string vin, IPlanTransitions transitions, INcpReader ncp, ClaimsPrincipal user, CancellationToken ct) =>
    {
        if (vin.Length is 0 or > 50)
        {
            return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
        }

        var missing = await ncp.GetMissingRequiredPartsAsync(vin, ct);
        if (missing.Count > 0)
        {
            var numbers = string.Join(", ", missing.Select(m => m.Number));
            return Problem("Rework не завершён", $"Есть незакрытая обязательная деталь: {numbers}.");
        }

        var (outcome, item) = await transitions.FinishReworkAsync(vin, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            TransitionOutcome.Ok => Results.Ok(item),
            TransitionOutcome.VinNotFound => Results.Problem(
                title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.",
                statusCode: StatusCodes.Status404NotFound),
            _ => Problem(
                "Нельзя завершить Rework",
                $"Изделие в статусе «{StatusLabel(item?.StatusId)}», ожидался «{StatusLabel(4)}»."),
        };
    });

    // Печать JobCard (раздел 8): отмечает PrintDate, допустимо в любом статусе, не меняет
    // статус изделия. QR генерируется в браузере (DEVELOPMENT_PLAN.md, Этап 7) и кодирует VIN
    // (мой ответ по умолчанию на В-12) — сервер про QR ничего не знает.
    plan.MapPost("/{vin}/print", async (
        string vin, IJobCardPrinter printer, ClaimsPrincipal user, CancellationToken ct) =>
    {
        if (vin.Length is 0 or > 50)
        {
            return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
        }

        var item = await printer.MarkPrintedAsync(vin, user.Identity?.Name ?? "неизвестно", ct);
        return item is null
            ? Results.Problem(title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.",
                statusCode: StatusCodes.Status404NotFound)
            : Results.Ok(item);
    });

    // NCP — операции чтения и записи только для демо-источника (см. Ncp.cs).
    var ncp = api.MapGroup("/ncp").RequireAuthorization();

    ncp.MapGet("/types", async (INcpReader reader, CancellationToken ct) => Results.Ok(await reader.GetTypesAsync(ct)));
    ncp.MapGet("/stations", async (INcpReader reader, CancellationToken ct) => Results.Ok(await reader.GetStationsAsync(ct)));
    ncp.MapGet("/components", async (INcpReader reader, CancellationToken ct) => Results.Ok(await reader.GetComponentsAsync(ct)));

    // Для проактивной подсказки на экране FOK (до попытки подтверждения, не только после отказа).
    ncp.MapGet("/missing-parts", async (string vin, INcpReader reader, CancellationToken ct) =>
    {
        if (string.IsNullOrWhiteSpace(vin) || vin.Length > 50)
        {
            return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
        }
        return Results.Ok(await reader.GetMissingRequiredPartsAsync(vin, ct));
    });

    ncp.MapGet("", async (
        INcpReader reader, CancellationToken ct,
        string? vin = null, string? status = null, int page = 1, int pageSize = 25) =>
    {
        if (vin is { Length: > 50 })
        {
            return Problem("Некорректный VIN", "Длина VIN не может превышать 50 символов.");
        }
        if (page < 1)
        {
            return Problem("Некорректная страница", "Номер страницы должен быть не меньше 1.");
        }
        if (pageSize is < 1 or > 100)
        {
            return Problem("Некорректный размер страницы", "pageSize должен быть в диапазоне 1..100.");
        }

        var result = await reader.GetPageAsync(new NcpQuery(vin, status, page, pageSize), ct);
        return Results.Ok(result);
    });

    ncp.MapPost("", async (CreateNcpRequest request, INcpWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
    {
        if (string.IsNullOrWhiteSpace(request.Vin) || request.Vin.Length > 50)
        {
            return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
        }

        var (outcome, created) = await writer.CreateAsync(request, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            CreateNcpOutcome.Ok => Results.Ok(created),
            CreateNcpOutcome.VinNotFound => Results.Problem(
                title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.",
                statusCode: StatusCodes.Status404NotFound),
            CreateNcpOutcome.ComponentNotFound => Problem("Компонент не найден", "Такого артикула нет в справочнике компонентов."),
            CreateNcpOutcome.InvalidStation => Problem("Некорректная станция", "Такой станции нет в списке."),
            CreateNcpOutcome.InvalidQuantity => Problem("Некорректное количество", "Количество должно быть от 1 до 9999."),
            _ => Problem("Некорректный тип", "Такого типа несоответствия нет в справочнике."),
        };
    });

    ncp.MapPost("/{id:int}/part-installed", async (
        int id, SetPartInstalledRequest request, INcpWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
    {
        var (outcome, updated) = await writer.SetPartInstalledAsync(id, request.Installed, user.Identity?.Name ?? "неизвестно", ct);
        return outcome == NcpActionOutcome.Ok
            ? Results.Ok(updated)
            : Results.Problem(title: "Заявка не найдена", statusCode: StatusCodes.Status404NotFound);
    });

    ncp.MapPost("/{id:int}/close", async (
        int id, CloseNcpRequest request, INcpWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
    {
        var (outcome, closed) = await writer.CloseAsync(id, user.Identity?.Name ?? "неизвестно", request, ct);
        return outcome switch
        {
            NcpActionOutcome.Ok => Results.Ok(closed),
            NcpActionOutcome.AlreadyClosed => Problem("Уже закрыто", "Эта заявка уже закрыта."),
            _ => Results.Problem(title: "Заявка не найдена", statusCode: StatusCodes.Status404NotFound),
        };
    });

    // Станции (Этап 5): отметки проверки компонентов. Остальное (список станций, каталог
    // компонентов, NCP по VIN) экран собирает из уже существующих эндпоинтов /ncp/* —
    // дублировать их здесь незачем.
    var stations = api.MapGroup("/stations").RequireAuthorization();

    stations.MapGet("/{vin}/checks", async (string vin, IStationChecks checks, IProductionPlanReader reader, CancellationToken ct) =>
    {
        if (vin.Length is 0 or > 50)
        {
            return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
        }
        if (await reader.GetByVinAsync(vin, ct) is null)
        {
            return Results.Problem(title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.",
                statusCode: StatusCodes.Status404NotFound);
        }
        return Results.Ok(await checks.GetForVinAsync(vin, ct));
    });

    stations.MapPost("/{vin}/components/{code}/check", async (
        string vin, string code, SetCheckRequest request, IStationChecks checks, ClaimsPrincipal user, CancellationToken ct) =>
    {
        var (outcome, updated) = await checks.SetCheckedAsync(vin, code, request.Checked, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            SetCheckOutcome.Ok => Results.Ok(updated),
            SetCheckOutcome.VinNotFound => Results.Problem(
                title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.",
                statusCode: StatusCodes.Status404NotFound),
            _ => Problem("Компонент не найден", "Такого артикула нет в справочнике компонентов."),
        };
    });

    // Импорт плана (раздел 6, Этап 8): источник сырых строк (файл/вставка) эндпоинту не важен —
    // он принимает уже разобранный список строк одинаковой формы.
    var planImport = api.MapGroup("/plan-import").RequireAuthorization();

    planImport.MapGet("/reference", async (IPlanImport import, CancellationToken ct) =>
        Results.Ok(await import.GetReferenceAsync(ct)));

    planImport.MapPost("/sessions", async (StageImportRequest request, IPlanImport import, ClaimsPrincipal user, CancellationToken ct) =>
    {
        if (request.Rows.Count == 0)
        {
            return Problem("Нет строк", "В загрузке нет ни одной строки для проверки.");
        }
        // ponytail: простая защитная граница объёма одной демо-загрузки, не требование спецификации.
        if (request.Rows.Count > 500)
        {
            return Problem("Слишком много строк", "За одну загрузку можно передать не более 500 строк.");
        }
        var session = await import.StageAsync(request.Rows, request.Source, user.Identity?.Name ?? "неизвестно", ct);
        return Results.Ok(session);
    });

    planImport.MapGet("/sessions/{id}", async (string id, IPlanImport import, CancellationToken ct) =>
    {
        var session = await import.GetSessionAsync(id, ct);
        return session is null
            ? Results.Problem(title: "Загрузка не найдена", statusCode: StatusCodes.Status404NotFound)
            : Results.Ok(session);
    });

    planImport.MapPut("/sessions/{id}/rows/{rowNumber:int}", async (
        string id, int rowNumber, ImportRawRow row, IPlanImport import, ClaimsPrincipal user, CancellationToken ct) =>
    {
        var session = await import.ReplaceRowAsync(id, rowNumber, row, user.Identity?.Name ?? "неизвестно", ct);
        return session is null
            ? Results.Problem(title: "Загрузка или строка не найдена", statusCode: StatusCodes.Status404NotFound)
            : Results.Ok(session);
    });

    planImport.MapPost("/sessions/{id}/publish", async (string id, IPlanImport import, ClaimsPrincipal user, CancellationToken ct) =>
    {
        var (outcome, published) = await import.PublishAsync(id, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            PublishOutcome.Ok => Results.Ok(new { published }),
            PublishOutcome.SessionNotFound => Results.Problem(title: "Загрузка не найдена", statusCode: StatusCodes.Status404NotFound),
            _ => Problem("Нельзя опубликовать", "В загрузке остались ошибки — исправьте все строки перед публикацией."),
        };
    });

    // Входной контроль (разделы 19-24, Этап 9): поставка → упаковки/коробки → строки (IncomingInspection.cs).
    var incoming = api.MapGroup("/incoming-inspection").RequireAuthorization();

    incoming.MapGet("/suppliers", async (IIncomingInspectionReader reader, CancellationToken ct) =>
        Results.Ok(await reader.GetSuppliersAsync(ct)));

    incoming.MapGet("/components", async (IIncomingInspectionReader reader, CancellationToken ct) =>
        Results.Ok(await reader.GetComponentsAsync(ct)));

    incoming.MapPost("/components", async (AddComponentRequest request, IIncomingInspectionWriter writer, CancellationToken ct) =>
    {
        var added = await writer.AddComponentAsync(request, ct);
        return added
            ? Results.NoContent()
            : Problem("Нельзя добавить артикул", "Код и наименование обязательны, а артикул не должен уже существовать в справочнике.");
    });

    incoming.MapGet("/deliveries", async (IIncomingInspectionReader reader, CancellationToken ct, int page = 1, int pageSize = 25) =>
    {
        if (page < 1)
        {
            return Problem("Некорректная страница", "Номер страницы должен быть не меньше 1.");
        }
        if (pageSize is < 1 or > 100)
        {
            return Problem("Некорректный размер страницы", "pageSize должен быть в диапазоне 1..100.");
        }
        return Results.Ok(await reader.GetDeliveriesAsync(page, pageSize, ct));
    });

    incoming.MapPost("/deliveries", async (CreateDeliveryRequest request, IIncomingInspectionWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
    {
        var (outcome, created) = await writer.CreateDeliveryAsync(request, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            CreateDeliveryOutcome.Ok => Results.Ok(created),
            CreateDeliveryOutcome.SupplierNotFound => Problem("Поставщик не найден", "Такого поставщика нет в справочнике."),
            _ => Problem("Некорректная дата инвойса", "Ожидается формат ГГГГ-ММ-ДД или ДД.ММ.ГГГГ."),
        };
    });

    incoming.MapGet("/deliveries/{id}", async (string id, IIncomingInspectionReader reader, CancellationToken ct) =>
    {
        var delivery = await reader.GetDeliveryAsync(id, ct);
        return delivery is null
            ? Results.Problem(title: "Поставка не найдена", statusCode: StatusCodes.Status404NotFound)
            : Results.Ok(delivery);
    });

    incoming.MapGet("/deliveries/{id}/packages/by-hu/{hu}", async (string id, string hu, IIncomingInspectionReader reader, CancellationToken ct) =>
    {
        var package = await reader.GetPackageByHuAsync(id, hu, ct);
        return package is null
            ? Results.Problem(title: "Коробка не найдена", detail: "В этой поставке нет коробки с таким HU.", statusCode: StatusCodes.Status404NotFound)
            : Results.Ok(package);
    });

    incoming.MapPost("/deliveries/{id}/packing-list/sessions", async (
        string id, StagePackingListRequest request, IIncomingInspectionWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
    {
        if (request.Rows.Count == 0)
        {
            return Problem("Нет строк", "В загрузке нет ни одной строки для проверки.");
        }
        if (request.Rows.Count > 500)
        {
            return Problem("Слишком много строк", "За одну загрузку можно передать не более 500 строк.");
        }
        var session = await writer.StagePackingListAsync(id, request.Rows, user.Identity?.Name ?? "неизвестно", ct);
        return session is null
            ? Results.Problem(title: "Поставка не найдена", statusCode: StatusCodes.Status404NotFound)
            : Results.Ok(session);
    });

    incoming.MapGet("/packing-list/sessions/{sessionId}", async (string sessionId, IIncomingInspectionWriter writer, CancellationToken ct) =>
    {
        var session = await writer.GetSessionAsync(sessionId, ct);
        return session is null
            ? Results.Problem(title: "Загрузка не найдена", statusCode: StatusCodes.Status404NotFound)
            : Results.Ok(session);
    });

    incoming.MapPut("/packing-list/sessions/{sessionId}/rows/{rowNumber:int}", async (
        string sessionId, int rowNumber, PackingListRawRow row, IIncomingInspectionWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
    {
        var session = await writer.ReplaceRowAsync(sessionId, rowNumber, row, user.Identity?.Name ?? "неизвестно", ct);
        return session is null
            ? Results.Problem(title: "Загрузка или строка не найдена", statusCode: StatusCodes.Status404NotFound)
            : Results.Ok(session);
    });

    incoming.MapPost("/packing-list/sessions/{sessionId}/confirm", async (
        string sessionId, IIncomingInspectionWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
    {
        var (outcome, delivery) = await writer.ConfirmSessionAsync(sessionId, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            ConfirmPackingListOutcome.Ok => Results.Ok(delivery),
            ConfirmPackingListOutcome.SessionNotFound => Results.Problem(title: "Загрузка не найдена", statusCode: StatusCodes.Status404NotFound),
            _ => Problem("Нельзя подтвердить", "В загрузке остались ошибки — исправьте все строки перед подтверждением."),
        };
    });

    incoming.MapPost("/packages/{packageId:int}/rows/{rowId:int}/result", async (
        int packageId, int rowId, RecordRowResultRequest request, IIncomingInspectionWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
    {
        var (outcome, package) = await writer.RecordRowResultAsync(packageId, rowId, request, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            RowResultOutcome.Ok => Results.Ok(package),
            RowResultOutcome.NotFound => Results.Problem(title: "Коробка или строка не найдена", statusCode: StatusCodes.Status404NotFound),
            RowResultOutcome.PackageClosed => Problem("Коробка закрыта", "Сначала переоткройте коробку, чтобы изменить результат проверки."),
            RowResultOutcome.InvalidOutcome => Problem("Некорректный результат", "Допустимо: OK, Брак, Пересорт, Недостача."),
            RowResultOutcome.InvalidQuantity => Problem("Некорректное количество", "Количество должно быть положительным."),
            _ => Problem("Превышен объём контроля", "Сумма проверенного и недостачи не может превышать требуемый объём — увеличьте норматив, если нужно."),
        };
    });

    incoming.MapPost("/packages/{packageId:int}/rows/{rowId:int}/quota", async (
        int packageId, int rowId, IncreaseQuotaRequest request, IIncomingInspectionWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
    {
        if (string.IsNullOrWhiteSpace(request.Comment))
        {
            return Problem("Нужен комментарий", "Увеличение норматива требует комментария (раздел 22, В-30).");
        }
        var (outcome, package) = await writer.IncreaseQuotaAsync(packageId, rowId, request, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            QuotaOutcome.Ok => Results.Ok(package),
            QuotaOutcome.NotFound => Results.Problem(title: "Коробка или строка не найдена", statusCode: StatusCodes.Status404NotFound),
            QuotaOutcome.PackageClosed => Problem("Коробка закрыта", "Сначала переоткройте коробку."),
            _ => Problem("Некорректный объём", "Новый объём должен быть больше текущего и не превышать поступившее количество."),
        };
    });

    incoming.MapPost("/packages/{packageId:int}/close", async (int packageId, IIncomingInspectionWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
    {
        var (outcome, package) = await writer.ClosePackageAsync(packageId, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            PackageActionOutcome.Ok => Results.Ok(package),
            PackageActionOutcome.NotFound => Results.Problem(title: "Коробка не найдена", statusCode: StatusCodes.Status404NotFound),
            PackageActionOutcome.AlreadyClosed => Problem("Уже закрыта", "Эта коробка уже закрыта."),
            _ => Problem("Нельзя закрыть", "Не все строки отработаны по требуемому нормативу."),
        };
    });

    incoming.MapPost("/packages/{packageId:int}/reopen", async (
        int packageId, ReopenRequest request, IIncomingInspectionWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
    {
        if (string.IsNullOrWhiteSpace(request.Comment))
        {
            return Problem("Нужен комментарий", "Переоткрытие закрытой коробки требует комментария (раздел 23, В-32).");
        }
        var (outcome, package) = await writer.ReopenPackageAsync(packageId, request, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            PackageActionOutcome.Ok => Results.Ok(package),
            PackageActionOutcome.NotFound => Results.Problem(title: "Коробка не найдена", statusCode: StatusCodes.Status404NotFound),
            _ => Problem("Нельзя переоткрыть", "Эта коробка и так открыта."),
        };
    });
}

api.MapGet("/auth/me", (ClaimsPrincipal user, DevAuthOptions opts) => Results.Ok(new
{
    userName = user.Identity?.Name,
    mode = opts.CanLogIn ? "dev" : "closed",
    demo = true
})).RequireAuthorization();

api.MapPost("/auth/logout", async (HttpContext ctx) =>
{
    await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.NoContent();
}).RequireAuthorization();

// Dev-login физически не существует вне Development/без секрета — путь не маппится.
if (devAuth.CanLogIn)
{
    api.MapPost("/dev-auth/login", async (DevAuthLoginRequest request, HttpContext ctx, DevAuthOptions opts) =>
    {
        if (!IsLoopback(ctx) || !IsSameOrigin(ctx))
        {
            return Results.Problem(title: "Доступ запрещён", detail: "Dev-вход разрешён только локально.", statusCode: StatusCodes.Status403Forbidden);
        }
        if (!opts.Matches(request.Username, request.Password))
        {
            return Results.Problem(title: "Неверные учётные данные", statusCode: StatusCodes.Status401Unauthorized);
        }

        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, request.Username), new Claim("auth_mode", "dev")],
            CookieAuthenticationDefaults.AuthenticationScheme);
        await ctx.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
        return Results.Ok(new { userName = request.Username, mode = "dev" });
    }).AllowAnonymous();
}

// SPA fallback: GET вне /api/ → index.html
app.MapFallback(context =>
{
    if (context.Request.Method == "GET" && !context.Request.Path.StartsWithSegments("/api"))
    {
        context.Request.Path = "/index.html";
        return context.Response.SendFileAsync(
            context.RequestServices.GetRequiredService<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>()
                .WebRootFileProvider.GetFileInfo("index.html"));
    }
    context.Response.StatusCode = 404;
    return Task.CompletedTask;
});

app.Run();

// Раздел 5 спецификации — коды 0..4. Неизвестный код не ломает сообщение, показываем как есть
// (то же правило, что и для строкового Status: неизвестное значение не прячем и не придумываем).
static string StatusLabel(int? id) => id switch
{
    0 => "Запланировано",
    1 => "В работе",
    2 => "Производство завершено",
    3 => "FOK пройден",
    4 => "Rework",
    null => "без статуса",
    _ => $"код {id}",
};

static ProblemHttpResult Problem(string title, string detail)
    => TypedResults.Problem(title: title, detail: detail, statusCode: StatusCodes.Status400BadRequest);

static bool IsLoopback(HttpContext ctx)
{
    var ip = ctx.Connection.RemoteIpAddress;
    return ip is null || System.Net.IPAddress.IsLoopback(ip);
}

static bool IsSameOrigin(HttpContext ctx)
{
    var origin = ctx.Request.Headers.Origin.ToString();
    if (string.IsNullOrEmpty(origin))
    {
        return true; // не-браузерный клиент (curl, тесты)
    }
    return Uri.TryCreate(origin, UriKind.Absolute, out var uri)
           && (uri.IsLoopback || string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase));
}
