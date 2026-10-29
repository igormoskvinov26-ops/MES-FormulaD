using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Hosting;

namespace FormulaD.Mes.Api.Tests;

/// <summary>Проверяет fail-closed: неполная или неизвестная настройка источника не должна запускаться (и тем более открывать соединение).</summary>
public sealed class SqlAttemptFactory(string dataSource = "Sql") : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Environments.Development);
        builder.UseSetting("DataSource", dataSource);
    }
}
