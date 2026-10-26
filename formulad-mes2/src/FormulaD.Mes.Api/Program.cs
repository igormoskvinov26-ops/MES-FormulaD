using System.Security.Claims;
using FormulaD.Mes.Api;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);

// --- Источник данных -------------------------------------------------------
// Только Demo. Режим SQL в MVP 0.1 отсутствует: любая другая настройка —
// контролируемая ошибка конфигурации (fail-closed), без fallback на PROD.
var dataSource = builder.Configuration["DataSource"] ?? "Demo";
if (!string.Equals(dataSource, "Demo", StringComparison.OrdinalIgnoreCase))
{
    throw new InvalidOperationException(
        $"DataSource='{dataSource}' не поддерживается в MVP 0.1. Допустимо только 'Demo'. " +
        "Подключение к SQL будет добавлено отдельной задачей и только для TEST-экземпляра с read-only учётной записью.");
}

var fixturePath = builder.Configuration["Demo:FixturePath"]
                  ?? Path.Combine(AppContext.BaseDirectory, "fixtures", "production-plan.demo.json");
builder.Services.AddSingleton<IProductionPlanReader>(_ => new DemoProductionPlanReader(fixturePath));

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

    var result = await reader.GetPageAsync(new ProductionPlanQuery(vin, status, page, pageSize), ct);
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
