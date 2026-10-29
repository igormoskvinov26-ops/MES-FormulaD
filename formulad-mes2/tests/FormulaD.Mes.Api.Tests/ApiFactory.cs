using System.Net.Http.Json;
using FormulaD.Mes.Api;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace FormulaD.Mes.Api.Tests;

/// <summary>Поднимает API в памяти. Никаких SQL-подключений: только DEMO-фикстура.</summary>
public sealed class ApiFactory(bool devAuthEnabled) : WebApplicationFactory<Program>
{
    public const string Login = "demo-operator";
    public const string Password = "test-only-secret";

    private static string FixturePath =>
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "fixtures", "production-plan.demo.json"));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Environments.Development);
        // ponytail: каждый тест поднимает свой WebApplicationFactory — без этого каждый из них
        // заводит FileSystemWatcher на appsettings.json (reloadOnChange по умолчанию), и при
        // десятках тестов это упирается в лимит inotify-инстансов песочницы (128). Конфигурация
        // в тестах не меняется на лету, следить за файлом незачем.
        builder.UseSetting("hostBuilder:reloadConfigOnChange", "false");
        builder.UseSetting("Demo:FixturePath", FixturePath);
        builder.UseSetting("DevAuth:Enabled", devAuthEnabled ? "true" : "false");
        if (devAuthEnabled)
        {
            builder.UseSetting("DevAuth:Username", Login);
            builder.UseSetting("DevAuth:Password", Password);
        }
    }

    /// <summary>Клиент с cookie-сессией после dev-входа.</summary>
    public async Task<HttpClient> CreateAuthenticatedClientAsync()
    {
        var client = CreateDefaultClient(new CookieHandler());
        var response = await client.PostAsJsonAsync("/api/v1/dev-auth/login", new DevAuthLoginRequest(Login, Password));
        response.EnsureSuccessStatusCode();
        return client;
    }

    private sealed class CookieHandler : DelegatingHandler
    {
        private readonly List<string> _cookies = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            if (_cookies.Count > 0)
            {
                request.Headers.Add("Cookie", string.Join("; ", _cookies));
            }
            var response = await base.SendAsync(request, ct);
            if (response.Headers.TryGetValues("Set-Cookie", out var values))
            {
                _cookies.AddRange(values.Select(v => v.Split(';')[0]));
            }
            return response;
        }
    }
}
