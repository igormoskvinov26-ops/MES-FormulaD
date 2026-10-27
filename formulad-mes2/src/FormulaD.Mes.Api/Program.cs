using System.Security.Claims;
using FormulaD.Mes.Api;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);

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
