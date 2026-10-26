using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Hosting;

namespace FormulaD.Mes.Api.Tests;

/// <summary>Проверяет fail-closed: DataSource != Demo не должен запускаться (и тем более искать SQL).</summary>
public sealed class SqlAttemptFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Environments.Development);
        builder.UseSetting("DataSource", "Sql");
    }
}
