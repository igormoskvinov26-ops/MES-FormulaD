using System.Reflection;
using System.Security.Claims;
using System.Threading.RateLimiting;
using FormulaD.Mes.Api;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseWindowsService();

var dataSource = builder.Configuration["DataSource"] ?? "Demo";
IEventLog eventLog = new InMemoryEventLog();
bool sqlWriteDisabled = false;

switch (dataSource.ToLowerInvariant())
{
    case "demo":
        var fixturePath = builder.Configuration["Demo:FixturePath"]
                          ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "production-plan.demo.json");
        var demoReader = new DemoProductionPlanReader(fixturePath, eventLog);
        builder.Services.AddSingleton<IProductionPlanReader>(demoReader);
        builder.Services.AddSingleton<IPlanOrderEditor>(demoReader);
        builder.Services.AddSingleton<IPlanTransitions>(demoReader);
        builder.Services.AddSingleton<IJobCardPrinter>(demoReader);
        builder.Services.AddSingleton<IPlanPublisher>(demoReader);
        builder.Services.AddSingleton<IPrintTemplateRepo>(new InMemoryPrintTemplateRepo());

        var ncpPath = builder.Configuration["Demo:NcpFixturePath"]
                     ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "ncp.demo.json");
        var componentsPath = builder.Configuration["Demo:ComponentsFixturePath"]
                            ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "components.demo.json");
        var ncpStore = new DemoNcpStore(ncpPath, componentsPath, demoReader, eventLog);
        builder.Services.AddSingleton<INcpReader>(ncpStore);
        builder.Services.AddSingleton<INcpWriter>(ncpStore);
        builder.Services.AddSingleton<IStationChecks>(new DemoStationChecks(demoReader, ncpStore, eventLog));

        var modelsPath = builder.Configuration["Demo:ModelsFixturePath"]
                        ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "models.demo.json");
        var colorsPath = builder.Configuration["Demo:ColorsFixturePath"]
                        ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "colors.demo.json");
        var specificationsPath = builder.Configuration["Demo:SpecificationsFixturePath"]
                                ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "specifications.demo.json");
        builder.Services.AddSingleton<IPlanImport>(
            new DemoPlanImport(modelsPath, colorsPath, specificationsPath, demoReader, demoReader, eventLog));

        var suppliersPath = builder.Configuration["Demo:SuppliersFixturePath"]
                           ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "suppliers.demo.json");
        var quotasPath = builder.Configuration["Demo:InspectionQuotasFixturePath"]
                        ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "inspection-quotas.demo.json");
        var incomingInspection = new DemoIncomingInspectionStore(suppliersPath, quotasPath, componentsPath, eventLog);
        builder.Services.AddSingleton<IIncomingInspectionReader>(incomingInspection);
        builder.Services.AddSingleton<IIncomingInspectionWriter>(incomingInspection);

        var demoQc = new DemoQcStore();
        builder.Services.AddSingleton<IQcChecklistReader>(demoQc);
        builder.Services.AddSingleton<IQcChecklistWriter>(demoQc);
        break;

    case "sql":
        var sqlOptions = SqlOptions.Create(builder.Configuration);
        if (!sqlOptions.HasWriteConnection)
        {
            sqlWriteDisabled = true;
            Console.WriteLine("WARNING: [T-003] Sql:WriteConnectionString не задана — операции записи вернут 503. " +
                              "Задайте переменную окружения Sql__WriteConnectionString для полного режима.");
        }
        IEventLog sqlOrMemoryLog = sqlOptions.HasWriteConnection
            ? (IEventLog)new SqlEventLog(sqlOptions.WriteConnectionString, sqlOptions.CommandTimeoutSeconds)
            : new InMemoryEventLog();
        if (sqlOptions.HasWriteConnection && sqlOrMemoryLog is SqlEventLog sel)
            sel.PurgeOldEntries(builder.Configuration.GetValue("EventLog:RetentionDays", 365));
        eventLog = sqlOrMemoryLog;
        var migrationsPath = builder.Configuration["Sql:MigrationsPath"]
                             ?? Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "sql", "migrations");
        var prodWarn = SqlOptions.GetProdHostWarning(sqlOptions.ConnectionString);
        if (prodWarn != null) Console.WriteLine($"WARNING: {prodWarn}");
        SqlOptions.ValidateRuntimeDatabaseAsync(sqlOptions.ConnectionString, sqlOptions.CommandTimeoutSeconds).GetAwaiter().GetResult();
        if (Directory.Exists(migrationsPath))
            SchemaMigrator.MigrateAsync(sqlOptions, migrationsPath).GetAwaiter().GetResult();
        builder.Services.AddSingleton(sqlOptions);
        builder.Services.AddSingleton<IProductionPlanReader>(sp => new SqlProductionPlanReader(sp.GetRequiredService<SqlOptions>()));
        builder.Services.AddSingleton<IPlanTransitions>(sp => new SqlPlanTransitions(sp.GetRequiredService<SqlOptions>(), sp.GetRequiredService<IEventLog>()));
        builder.Services.AddSingleton<IPlanOrderEditor>(sp => new SqlPlanOrderEditor(sp.GetRequiredService<SqlOptions>(), sp.GetRequiredService<IEventLog>()));
        builder.Services.AddSingleton<IJobCardPrinter>(sp => new SqlJobCardPrinter(sp.GetRequiredService<SqlOptions>(), sp.GetRequiredService<IEventLog>()));
        builder.Services.AddSingleton<IPlanPublisher>(sp => new SqlPlanPublisher(sp.GetRequiredService<SqlOptions>(), sp.GetRequiredService<IEventLog>()));
        var sqlNcp = new SqlNcpStore(sqlOptions, eventLog);
        builder.Services.AddSingleton<INcpReader>(sqlNcp);
        builder.Services.AddSingleton<INcpWriter>(sqlNcp);
        builder.Services.AddSingleton<IStationChecks>(new SqlStationChecks(sqlOptions, eventLog));
        builder.Services.AddSingleton<IPlanImport>(sp => new SqlPlanImport(
            sp.GetRequiredService<SqlOptions>(),
            sp.GetRequiredService<IProductionPlanReader>(),
            sp.GetRequiredService<IPlanPublisher>(),
            sp.GetRequiredService<IEventLog>()));
        var sqlIncoming = new SqlIncomingInspection(sqlOptions, eventLog);
        builder.Services.AddSingleton<IIncomingInspectionReader>(sqlIncoming);
        builder.Services.AddSingleton<IIncomingInspectionWriter>(sqlIncoming);
        var sqlQc = new SqlQcStore(sqlOptions);
        builder.Services.AddSingleton<IQcChecklistReader>(sqlQc);
        builder.Services.AddSingleton<IQcChecklistWriter>(sqlQc);
        builder.Services.AddSingleton<IPrintTemplateRepo>(
            new SqlPrintTemplateRepo(sqlOptions.WriteConnectionString, sqlOptions.CommandTimeoutSeconds));
        break;

    default:
        throw new InvalidOperationException(
            $"DataSource='{dataSource}' не поддерживается. Допустимо 'Demo' или 'Sql' (только TEST-экземпляр).");
}

builder.Services.AddSingleton(eventLog);

builder.Services.AddSingleton<IProductionCalendarStore>(new ProductionCalendarStore(
    dataSource.Equals("sql", StringComparison.OrdinalIgnoreCase)
        ? builder.Configuration["Calendar:StorePath"] ?? Path.Combine(AppContext.BaseDirectory, "App_Data", "production-calendar.json")
        : null,
    eventLog));

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
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;
        options.SlidingExpiration = true;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
        options.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
    });
builder.Services.AddAuthorization();
builder.Services.AddProblemDetails();
builder.Services.AddRateLimiter(o =>
{
    o.AddFixedWindowLimiter("login", lo =>
    {
        lo.Window = TimeSpan.FromMinutes(1);
        lo.PermitLimit = 5;
        lo.QueueLimit = 0;
        lo.AutoReplenishment = true;
    });
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
});

if (builder.Environment.IsDevelopment())
    builder.Services.AddOpenApi();

var app = builder.Build();

app.Logger.LogInformation("Источник данных: {DataSource}", dataSource);

if (!devAuth.CanLogIn)
{
    app.Logger.LogWarning(
        "Dev-аутентификация выключена (DevAuth:Enabled={Enabled}, секрет задан={HasSecret}). " +
        "Защищённые эндпоинты будут возвращать 401.", devAuth.Enabled, devAuth.HasCredentials);
}

app.UseExceptionHandler();
app.UseStatusCodePages();
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["X-Frame-Options"] = "DENY";
    ctx.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    await next();
});
app.UseRateLimiter();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
if (sqlWriteDisabled)
{
    app.Use(async (ctx, next) =>
    {
        if (ctx.Request.Path.StartsWithSegments("/api") &&
            !ctx.Request.Path.StartsWithSegments("/api/v1/auth") &&
            !ctx.Request.Path.StartsWithSegments("/api/v1/dev-auth") &&
            !HttpMethods.IsGet(ctx.Request.Method) &&
            !HttpMethods.IsHead(ctx.Request.Method))
        {
            ctx.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await ctx.Response.WriteAsJsonAsync(new
            {
                title = "Операции записи недоступны",
                detail = "[T-003] Задайте Sql:WriteConnectionString для включения записи.",
                status = 503
            });
            return;
        }
        await next(ctx);
    });
}

if (app.Environment.IsDevelopment())
    app.MapOpenApi();

var api = app.MapGroup("/api/v1");

api.MapGet("/health/live", () => Results.Ok(new { status = "ok" })).AllowAnonymous();

api.MapGet("/health/ready", async (IProductionPlanReader reader, CancellationToken ct) =>
{
    try
    {
        await reader.GetStatusesAsync(ct);
        return Results.Ok(new { status = "ready" });
    }
    catch
    {
        return Results.StatusCode(503);
    }
}).AllowAnonymous();

var asmVersion = Assembly.GetExecutingAssembly()
    .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
    ?? "unknown";
api.MapGet("/info", () => Results.Ok(new { version = asmVersion })).AllowAnonymous();

api.MapGet("/schema-version", async (CancellationToken ct) =>
{
    if (!dataSource.Equals("sql", StringComparison.OrdinalIgnoreCase))
        return Results.Ok(new { dataSource, schemaVersion = (int?)null });
    var opts = app.Services.GetRequiredService<SqlOptions>();
    var version = await SchemaMigrator.GetCurrentVersionAsync(opts, ct);
    return Results.Ok(new { dataSource, schemaVersion = version });
}).RequireAuthorization();

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
        return Problem("Некорректный VIN", "Длина VIN не может превышать 50 символов.");
    if (page < 1)
        return Problem("Некорректная страница", "Номер страницы должен быть не меньше 1.");
    if (pageSize is < 1 or > 100)
        return Problem("Некорректный размер страницы", "pageSize должен быть в диапазоне 1..100.");
    var result = await reader.GetPageAsync(new ProductionPlanQuery(vin, status, statusId, page, pageSize), ct);
    return Results.Ok(result);
});

plan.MapGet("/{vin}", async (string vin, IProductionPlanReader reader, CancellationToken ct) =>
{
    if (vin.Length is 0 or > 50)
        return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
    var item = await reader.GetByVinAsync(vin, ct);
    return item is null
        ? Results.Problem(title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.", statusCode: StatusCodes.Status404NotFound)
        : Results.Ok(item);
});

{
    plan.MapPost("/{vin}/start", async (
        string vin, IPlanTransitions transitions, ClaimsPrincipal user, CancellationToken ct) =>
    {
        if (vin.Length is 0 or > 50) return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
        var (outcome, item) = await transitions.StartAsync(vin, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            TransitionOutcome.Ok => Results.Ok(item),
            TransitionOutcome.VinNotFound => Results.Problem(title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.", statusCode: StatusCodes.Status404NotFound),
            _ => Problem("Нельзя запустить", $"Изделие уже в статусе «{StatusLabel(item?.StatusId)}», ожидался «{StatusLabel(0)}»."),
        };
    });

    plan.MapPost("/{vin}/complete", async (
        string vin, IPlanTransitions transitions, ClaimsPrincipal user, CancellationToken ct) =>
    {
        if (vin.Length is 0 or > 50) return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
        var (outcome, item) = await transitions.CompleteAsync(vin, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            TransitionOutcome.Ok => Results.Ok(item),
            TransitionOutcome.VinNotFound => Results.Problem(title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.", statusCode: StatusCodes.Status404NotFound),
            _ => Problem("Нельзя завершить", $"Изделие уже в статусе «{StatusLabel(item?.StatusId)}», ожидался «{StatusLabel(1)}»."),
        };
    });

    plan.MapPost("/{vin}/fok", async (
        string vin, IPlanTransitions transitions, ClaimsPrincipal user, HttpContext httpCtx, CancellationToken ct) =>
    {
        if (vin.Length is 0 or > 50) return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
        var ncp = httpCtx.RequestServices.GetService<INcpReader>();
        if (ncp is not null)
        {
            var missing = await ncp.GetMissingRequiredPartsAsync(vin, ct);
            if (missing.Count > 0)
            {
                var numbers = string.Join(", ", missing.Select(m => m.Number));
                return Problem("FOK недоступен", $"Есть незакрытая обязательная деталь: {numbers}.");
            }
        }
        var (outcome, item) = await transitions.FokAsync(vin, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            TransitionOutcome.Ok => Results.Ok(item),
            TransitionOutcome.VinNotFound => Results.Problem(title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.", statusCode: StatusCodes.Status404NotFound),
            _ => Problem("Нельзя подтвердить FOK", $"Изделие уже в статусе «{StatusLabel(item?.StatusId)}», ожидался «{StatusLabel(2)}»."),
        };
    });

    plan.MapPost("/{vin}/rework", async (
        string vin, IPlanTransitions transitions, ClaimsPrincipal user, CancellationToken ct) =>
    {
        if (vin.Length is 0 or > 50) return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
        var (outcome, item) = await transitions.SendToReworkAsync(vin, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            TransitionOutcome.Ok => Results.Ok(item),
            TransitionOutcome.VinNotFound => Results.Problem(title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.", statusCode: StatusCodes.Status404NotFound),
            _ => Problem("Нельзя отправить в Rework", $"Изделие в статусе «{StatusLabel(item?.StatusId)}», ожидался «{StatusLabel(2)}»."),
        };
    });

    plan.MapPost("/{vin}/rework/finish", async (
        string vin, IPlanTransitions transitions, ClaimsPrincipal user, HttpContext httpCtx, CancellationToken ct) =>
    {
        if (vin.Length is 0 or > 50) return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
        var ncp = httpCtx.RequestServices.GetService<INcpReader>();
        if (ncp is not null)
        {
            var missing = await ncp.GetMissingRequiredPartsAsync(vin, ct);
            if (missing.Count > 0)
            {
                var numbers = string.Join(", ", missing.Select(m => m.Number));
                return Problem("Rework не завершён", $"Есть незакрытая обязательная деталь: {numbers}.");
            }
        }
        var (outcome, item) = await transitions.FinishReworkAsync(vin, user.Identity?.Name ?? "неизвестно", ct);
        return outcome switch
        {
            TransitionOutcome.Ok => Results.Ok(item),
            TransitionOutcome.VinNotFound => Results.Problem(title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.", statusCode: StatusCodes.Status404NotFound),
            _ => Problem("Нельзя завершить Rework", $"Изделие в статусе «{StatusLabel(item?.StatusId)}», ожидался «{StatusLabel(4)}»."),
        };
    });
}

plan.MapPost("/{vin}/move", async (
    string vin, MoveRequest request, IPlanOrderEditor editor,
    IProductionPlanReader reader, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (vin.Length is 0 or > 50) return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
    if (request.ToPosition < 1) return Problem("Некорректная позиция", "Номер позиции должен быть положительным.");
    var outcome = await editor.MoveAsync(vin, request.ToPosition, user.Identity?.Name ?? "неизвестно", ct);
    return outcome switch
    {
        MoveOutcome.Ok => Results.Ok(await reader.GetByVinAsync(vin, ct)),
        MoveOutcome.VinNotFound => Results.Problem(title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.", statusCode: StatusCodes.Status404NotFound),
        MoveOutcome.NoPosition => Problem("Нет позиции в плане", "У изделия не задан порядок запуска, перемещать нечего."),
        MoveOutcome.StatusRestricted => Results.Problem(title: "Перестановка запрещена", detail: "Изделие уже запущено в производство.", statusCode: StatusCodes.Status422UnprocessableEntity),
        _ => Problem("Позиция не найдена", "В плане нет позиции с таким номером."),
    };
});

plan.MapPost("/{vin}/print", async (
    string vin, IJobCardPrinter printer, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (vin.Length is 0 or > 50) return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
    var item = await printer.MarkPrintedAsync(vin, user.Identity?.Name ?? "неизвестно", ct);
    return item is null
        ? Results.Problem(title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.", statusCode: StatusCodes.Status404NotFound)
        : Results.Ok(item);
});

var calendar = api.MapGroup("/calendar").RequireAuthorization();
calendar.MapGet("", (IProductionCalendarStore store) => Results.Ok(store.Get()));
calendar.MapPut("/days", (ApplyCalendarRequest request, IProductionCalendarStore store, ClaimsPrincipal user) =>
{
    var error = store.Apply(request.Changes ?? [], user.Identity?.Name ?? "неизвестно", out var state);
    return error is null ? Results.Ok(state) : Problem("Некорректное изменение календаря", error);
});
calendar.MapPut("/settings", (CalendarSettings request, IProductionCalendarStore store, ClaimsPrincipal user) =>
{
    var error = store.ApplySettings(request, user.Identity?.Name ?? "неизвестно", out var state);
    return error is null ? Results.Ok(state) : Problem("Некорректный график работы", error);
});

api.MapGet("/events", (IEventLog log, string? entityType = null, string? entityKey = null, int limit = 100) =>
{
    if (limit is < 1 or > 500) return Problem("Некорректный лимит", "limit должен быть в диапазоне 1..500.");
    if (entityType is { Length: > 50 } || entityKey is { Length: > 100 }) return Problem("Некорректный фильтр", "Слишком длинное значение фильтра.");
    return Results.Ok(log.Query(entityType, entityKey, limit));
}).RequireAuthorization();

var ncp = api.MapGroup("/ncp").RequireAuthorization();

ncp.MapGet("/types", async (INcpReader reader, CancellationToken ct) => Results.Ok(await reader.GetTypesAsync(ct)));
ncp.MapGet("/stations", async (INcpReader reader, CancellationToken ct) => Results.Ok(await reader.GetStationsAsync(ct)));
ncp.MapGet("/components", async (INcpReader reader, CancellationToken ct) => Results.Ok(await reader.GetComponentsAsync(ct)));

ncp.MapGet("/missing-parts", async (string vin, INcpReader reader, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(vin) || vin.Length > 50)
        return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
    return Results.Ok(await reader.GetMissingRequiredPartsAsync(vin, ct));
});

ncp.MapGet("", async (
    INcpReader reader, IProductionPlanReader planReader, CancellationToken ct,
    string? vin = null, string? status = null, string? type = null, string? station = null, int page = 1, int pageSize = 25) =>
{
    if (vin is { Length: > 50 }) return Problem("Некорректный VIN", "Длина VIN не может превышать 50 символов.");
    if (page < 1) return Problem("Некорректная страница", "Номер страницы должен быть не меньше 1.");
    if (pageSize is < 1 or > 100) return Problem("Некорректный размер страницы", "pageSize должен быть в диапазоне 1..100.");
    var result = await reader.GetPageAsync(new NcpQuery(vin, status, type, station, page, pageSize), ct);
    var byVin = new Dictionary<string, ProductionPlanItem?>(StringComparer.OrdinalIgnoreCase);
    foreach (var v in result.Items.Select(i => i.Vin).Distinct(StringComparer.OrdinalIgnoreCase))
        byVin[v] = await planReader.GetByVinAsync(v, ct);
    var items = result.Items
        .Select(i => byVin.GetValueOrDefault(i.Vin) is { } p ? i with { ModelArticle = p.ModelArticle, ModelName = p.ModelName, Color = p.Color } : i)
        .ToList();
    return Results.Ok(result with { Items = items });
});

ncp.MapPost("", async (CreateNcpRequest request, INcpWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Vin) || request.Vin.Length > 50)
        return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
    var (outcome, created) = await writer.CreateAsync(request, user.Identity?.Name ?? "неизвестно", ct);
    return outcome switch
    {
        CreateNcpOutcome.Ok => Results.Ok(created),
        CreateNcpOutcome.VinNotFound => Results.Problem(title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.", statusCode: StatusCodes.Status404NotFound),
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

var stations = api.MapGroup("/stations").RequireAuthorization();

stations.MapGet("/{vin}/checks", async (string vin, IStationChecks checks, IProductionPlanReader reader, CancellationToken ct) =>
{
    if (vin.Length is 0 or > 50) return Problem("Некорректный VIN", "VIN должен содержать от 1 до 50 символов.");
    if (await reader.GetByVinAsync(vin, ct) is null)
        return Results.Problem(title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.", statusCode: StatusCodes.Status404NotFound);
    return Results.Ok(await checks.GetForVinAsync(vin, ct));
});

stations.MapPost("/{vin}/components/{code}/check", async (
    string vin, string code, SetCheckRequest request, IStationChecks checks, ClaimsPrincipal user, CancellationToken ct) =>
{
    var (outcome, updated) = await checks.SetCheckedAsync(vin, code, request.Checked, user.Identity?.Name ?? "неизвестно", ct);
    return outcome switch
    {
        SetCheckOutcome.Ok => Results.Ok(updated),
        SetCheckOutcome.VinNotFound => Results.Problem(title: "Изделие не найдено", detail: "VIN отсутствует в производственном плане.", statusCode: StatusCodes.Status404NotFound),
        _ => Problem("Компонент не найден", "Такого артикула нет в справочнике компонентов."),
    };
});

var planImport = api.MapGroup("/plan-import").RequireAuthorization();

planImport.MapGet("/reference", async (IPlanImport import, CancellationToken ct) =>
    Results.Ok(await import.GetReferenceAsync(ct)));

planImport.MapPost("/sessions", async (StageImportRequest request, IPlanImport import, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (request.Rows.Count == 0) return Problem("Нет строк", "В загрузке нет ни одной строки для проверки.");
    if (request.Rows.Count > 500) return Problem("Слишком много строк", "За одну загрузку можно передать не более 500 строк.");
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
    if (page < 1) return Problem("Некорректная страница", "Номер страницы должен быть не меньше 1.");
    if (pageSize is < 1 or > 100) return Problem("Некорректный размер страницы", "pageSize должен быть в диапазоне 1..100.");
    return Results.Ok(await reader.GetDeliveriesAsync(page, pageSize, ct));
});

incoming.MapPost("/deliveries", async (CreateDeliveryRequest request, IIncomingInspectionWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
{
    var (outcome, created) = await writer.CreateDeliveryAsync(request, user.Identity?.Name ?? "неизвестно", ct);
    return outcome switch
    {
        CreateDeliveryOutcome.Ok => Results.Ok(created),
        CreateDeliveryOutcome.SupplierNotFound => Problem("Поставщик не найден", "Такого поставщика нет в справочнике."),
        CreateDeliveryOutcome.DuplicateInvoice => Results.Problem(title: "Дубликат инвойса", detail: "Поставка с таким номером инвойса у этого поставщика уже существует.", statusCode: StatusCodes.Status409Conflict),
        _ => Problem("Некорректная дата инвойса", "Ожидается формат ГГГГ-ММ-ДД или ДД.ММ.ГГГГ."),
    };
});

incoming.MapDelete("/deliveries/{id}", async (string id, IIncomingInspectionWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
{
    var outcome = await writer.DeleteDeliveryAsync(id, user.Identity?.Name ?? "неизвестно", ct);
    return outcome switch
    {
        DeleteDeliveryOutcome.Ok => Results.NoContent(),
        DeleteDeliveryOutcome.NotFound => Results.Problem(title: "Поставка не найдена", statusCode: StatusCodes.Status404NotFound),
        DeleteDeliveryOutcome.NotOpen => Results.Problem(title: "Нельзя удалить", detail: "Удалить можно только поставку со статусом «В работе».", statusCode: StatusCodes.Status409Conflict),
        _ => Results.Problem(title: "Нельзя удалить", detail: "У поставки есть коробки — сначала удалите их.", statusCode: StatusCodes.Status409Conflict),
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
    if (request.Rows.Count == 0) return Problem("Нет строк", "В загрузке нет ни одной строки для проверки.");
    if (request.Rows.Count > 500) return Problem("Слишком много строк", "За одну загрузку можно передать не более 500 строк.");
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
        _ => Problem("Превышен объём контроля", "Сумма проверенного и недостачи не может превышать требуемый объём."),
    };
});

incoming.MapPost("/packages/{packageId:int}/rows/{rowId:int}/quota", async (
    int packageId, int rowId, IncreaseQuotaRequest request, IIncomingInspectionWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Comment))
        return Problem("Нужен комментарий", "Увеличение норматива требует комментария (раздел 22, В-30).");
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
        return Problem("Нужен комментарий", "Переоткрытие закрытой коробки требует комментария (раздел 23, В-32).");
    var (outcome, package) = await writer.ReopenPackageAsync(packageId, request, user.Identity?.Name ?? "неизвестно", ct);
    return outcome switch
    {
        PackageActionOutcome.Ok => Results.Ok(package),
        PackageActionOutcome.NotFound => Results.Problem(title: "Коробка не найдена", statusCode: StatusCodes.Status404NotFound),
        _ => Problem("Нельзя переоткрыть", "Эта коробка и так открыта."),
    };
});

var qc = api.MapGroup("/qc").RequireAuthorization();

qc.MapGet("/posts", async (IQcChecklistReader reader, CancellationToken ct, string? vin = null) =>
    Results.Ok(await reader.GetPostsAsync(ct, vin)));

qc.MapGet("/posts/{postId:int}/items", async (int postId, IQcChecklistReader reader, CancellationToken ct) =>
    Results.Ok(await reader.GetItemsAsync(postId, ct)));

qc.MapPost("/sessions", async (StartSessionRequest request, IQcChecklistWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (request.PostId <= 0)
        return Problem("Не указан пост", "Укажите id контрольного поста.");
    if (string.IsNullOrWhiteSpace(request.Vin))
        return Problem("Не указан VIN", "Укажите VIN изделия.");
    var session = await writer.StartSessionAsync(request, user.Identity?.Name ?? "неизвестно", ct);
    return Results.Created($"/api/v1/qc/sessions/{session.Id}", session);
});

qc.MapGet("/sessions/{id:int}", async (int id, IQcChecklistReader reader, CancellationToken ct) =>
{
    var session = await reader.GetSessionAsync(id, ct);
    return session is null
        ? Results.Problem(title: "Сессия не найдена", statusCode: StatusCodes.Status404NotFound)
        : Results.Ok(session);
});

qc.MapGet("/posts/{postId:int}/sessions", async (int postId, IQcChecklistReader reader, int limit = 20, CancellationToken ct = default) =>
    Results.Ok(await reader.GetSessionsByPostAsync(postId, limit, ct)));

qc.MapPost("/sessions/{id:int}/results", async (
    int id, RecordResultRequest request, IQcChecklistWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (!new[] { "pass", "fail", "skip" }.Contains(request.Status))
        return Problem("Недопустимый статус", "Допустимо: pass, fail, skip.");
    var result = await writer.RecordResultAsync(id, request, user.Identity?.Name ?? "неизвестно", ct);
    return Results.Ok(result);
});

qc.MapPost("/sessions/{id:int}/finish", async (
    int id, FinishSessionRequest request, IQcChecklistWriter writer, ClaimsPrincipal user, CancellationToken ct) =>
{
    var session = await writer.FinishSessionAsync(id, request, user.Identity?.Name ?? "неизвестно", ct);
    return Results.Ok(session);
});

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

if (devAuth.CanLogIn)
{
    api.MapPost("/dev-auth/login", async (DevAuthLoginRequest request, HttpContext ctx, DevAuthOptions opts) =>
    {
        if (!IsLoopback(ctx) || !IsSameOrigin(ctx))
            return Results.Problem(title: "Доступ запрещён", detail: "Dev-вход разрешён только локально.", statusCode: StatusCodes.Status403Forbidden);
        if (!opts.Matches(request.Username, request.Password))
            return Results.Problem(title: "Неверные учётные данные", statusCode: StatusCodes.Status401Unauthorized);
        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, request.Username), new Claim("auth_mode", "dev")],
            CookieAuthenticationDefaults.AuthenticationScheme);
        await ctx.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
        return Results.Ok(new { userName = request.Username, mode = "dev" });
    }).AllowAnonymous().RequireRateLimiting("login");
}

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

var adminGroup = api.MapGroup("/admin").RequireAuthorization();

adminGroup.MapPost("/suppliers", async (SupplierRef supplier, IIncomingInspectionWriter writer, CancellationToken ct) =>
{
    var ok = await writer.AddSupplierAsync(supplier, ct);
    return ok ? Results.Created($"/api/v1/admin/suppliers/{supplier.Code}", supplier) : Results.Conflict();
});

adminGroup.MapDelete("/suppliers/{code}", async (string code, IIncomingInspectionWriter writer, CancellationToken ct) =>
{
    var ok = await writer.DeleteSupplierAsync(code, ct);
    return ok ? Results.NoContent() : Results.NotFound();
});

adminGroup.MapPut("/components/{code}", async (
    string code, UpdateComponentRequest request, INcpWriter writer, CancellationToken ct) =>
{
    await writer.UpdateComponentAsync(code, request, ct);
    return Results.NoContent();
});

adminGroup.MapGet("/print-templates", async (IPrintTemplateRepo repo, CancellationToken ct) =>
    Results.Ok(await repo.GetAllAsync(ct)));

adminGroup.MapGet("/print-templates/{id:int}", async (int id, IPrintTemplateRepo repo, CancellationToken ct) =>
{
    var t = await repo.GetAsync(id, ct);
    return t is null ? Results.NotFound() : Results.Ok(t);
});

adminGroup.MapPut("/print-templates/{id:int}", async (
    int id, UpdatePrintTemplateRequest req, IPrintTemplateRepo repo, CancellationToken ct) =>
    Results.Ok(await repo.UpsertAsync(id, req.Name, req.BodyHtml, ct)));

api.MapPost("/print/{id:int}", async (
    int id, IPrintTemplateRepo repo,
    string? vin = null, string? model = null, string? color = null,
    string? ncp = null, string? inspector = null,
    CancellationToken ct = default) =>
{
    var template = await repo.GetAsync(id, ct);
    if (template is null) return Results.NotFound();
    var html = template.BodyHtml
        .Replace("{{VIN}}", System.Net.WebUtility.HtmlEncode(vin ?? ""))
        .Replace("{{MODEL}}", System.Net.WebUtility.HtmlEncode(model ?? ""))
        .Replace("{{COLOR}}", System.Net.WebUtility.HtmlEncode(color ?? ""))
        .Replace("{{NCP_NUMBER}}", System.Net.WebUtility.HtmlEncode(ncp ?? ""))
        .Replace("{{INSPECTOR}}", System.Net.WebUtility.HtmlEncode(inspector ?? ""))
        .Replace("{{DATE}}", System.Net.WebUtility.HtmlEncode(DateTime.Now.ToString("dd.MM.yyyy")));
    var fullHtml = "<!DOCTYPE html>" +
        "<html lang=\"ru\"><head><meta charset=\"utf-8\">" +
        "<style>" +
        "body { font-family: Arial, sans-serif; font-size: 12pt; margin: 20mm; }" +
        "table { border-collapse: collapse; width: 100%; }" +
        "td, th { border: 1px solid #000; padding: 4px 6px; }" +
        "</style>" +
        $"</head><body>{html}</body></html>";
    var playwright = await Microsoft.Playwright.Playwright.CreateAsync();
    await using var browser = await playwright.Chromium.LaunchAsync(
        new() { Headless = true, ExecutablePath = "/opt/pw-browsers/chromium" });
    var page = await browser.NewPageAsync();
    await page.SetContentAsync(fullHtml, new() { WaitUntil = Microsoft.Playwright.WaitUntilState.NetworkIdle });
    var pdf = await page.PdfAsync(new() { Format = "A4", PrintBackground = true });
    return Results.File(pdf, "application/pdf", $"template-{id}.pdf");
}).RequireAuthorization();

var reports = api.MapGroup("/reports").RequireAuthorization();

reports.MapGet("/stations", async (INcpReader ncp, DateTime? from, DateTime? to, CancellationToken ct) =>
{
    var f = from ?? DateTime.UtcNow.Date.AddMonths(-1);
    var t = (to ?? DateTime.UtcNow.Date).AddDays(1);
    return Results.Ok(await ncp.GetStationCountsAsync(f, t, ct));
});

reports.MapGet("/ncp-causes", async (INcpReader ncp, DateTime? from, DateTime? to, CancellationToken ct) =>
{
    var f = from ?? DateTime.UtcNow.Date.AddMonths(-1);
    var t = (to ?? DateTime.UtcNow.Date).AddDays(1);
    return Results.Ok(await ncp.GetTypeCountsAsync(f, t, ct));
});

app.Run();

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
    if (string.IsNullOrEmpty(origin)) return true;
    return Uri.TryCreate(origin, UriKind.Absolute, out var uri)
           && (uri.IsLoopback || string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase));
}
