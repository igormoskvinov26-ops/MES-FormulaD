using System.Net.Http.Json;
using FormulaD.Mes.Api;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FormulaD.Mes.Api.Tests;

/// <summary>Поднимает API в памяти. SQL не используется: сервисы заменяются in-memory реализациями.</summary>
public sealed class ApiFactory(bool userExists) : WebApplicationFactory<Program>
{
    public const string Login = "demo-operator";
    public const string Role = "1";

    private static string FixtureDir =>
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "fixtures"));

    private static string FixturePath => Path.Combine(FixtureDir, "production-plan.demo.json");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Environments.Development);
        builder.UseSetting("hostBuilder:reloadConfigOnChange", "false");
        // ponytail: dummy SQL config so Program.cs doesn't throw; overridden by test services below
        builder.UseSetting("Sql:ConnectionString", "Server=test;Database=FormulaD_TEST;User ID=test;Password=test");
        builder.UseSetting("Auth:FormLogin", userExists ? "true" : "false");

        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<IUserDirectory>(new InMemoryUserDirectory(
                userExists ? [new MesUser(1, Login, "Демо Оператор", Role)] : []));

            var eventLog = new InMemoryEventLog();
            services.AddSingleton<IEventLog>(eventLog);

            var demoReader = new DemoProductionPlanReader(FixturePath, eventLog);
            services.AddSingleton<IProductionPlanReader>(demoReader);
            services.AddSingleton<IPlanOrderEditor>(demoReader);
            services.AddSingleton<IPlanTransitions>(demoReader);
            services.AddSingleton<IJobCardPrinter>(demoReader);
            services.AddSingleton<IPlanPublisher>(demoReader);

            var ncpPath = Path.Combine(FixtureDir, "ncp.demo.json");
            var componentsPath = Path.Combine(FixtureDir, "components.demo.json");
            var ncpStore = new DemoNcpStore(ncpPath, componentsPath, demoReader, eventLog);
            services.AddSingleton<INcpReader>(ncpStore);
            services.AddSingleton<INcpWriter>(ncpStore);

            services.AddSingleton<IStationChecks>(new DemoStationChecks(demoReader, ncpStore, eventLog));

            var modelsPath = Path.Combine(FixtureDir, "models.demo.json");
            var colorsPath = Path.Combine(FixtureDir, "colors.demo.json");
            var specificationsPath = Path.Combine(FixtureDir, "specifications.demo.json");
            services.AddSingleton<IPlanImport>(
                new DemoPlanImport(modelsPath, colorsPath, specificationsPath, demoReader, demoReader, eventLog));

            var suppliersPath = Path.Combine(FixtureDir, "suppliers.demo.json");
            var quotasPath = Path.Combine(FixtureDir, "inspection-quotas.demo.json");
            var incomingInspection = new DemoIncomingInspectionStore(suppliersPath, quotasPath, componentsPath, eventLog);
            services.AddSingleton<IIncomingInspectionReader>(incomingInspection);
            services.AddSingleton<IIncomingInspectionWriter>(incomingInspection);
        });
    }

    /// <summary>Клиент с cookie-сессией после входа по логину из справочника.</summary>
    public async Task<HttpClient> CreateAuthenticatedClientAsync()
    {
        var client = CreateDefaultClient(new CookieHandler());
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(Login));
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
