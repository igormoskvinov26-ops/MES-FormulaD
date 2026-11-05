using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Hosting;

namespace FormulaD.Mes.Api.Tests;

/// <summary>
/// Приложение в SQL-режиме с конфигурацией, которая проходит проверку на старте
/// (не PROD-хост/база/логин), но реально никуда не подключается: тесты здесь не дергают
/// эндпоинты плана (они бы попытались открыть соединение), только проверяют, какие
/// маршруты вообще существуют.
/// </summary>
public sealed class SqlConfiguredFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Environments.Development);
        builder.UseSetting("DataSource", "Sql");
        builder.UseSetting("Sql:IsTestEnvironment", "true");
        builder.UseSetting("Sql:ConnectionString",
            "Server=mes-test-sql,1433;Database=FormulaD_TEST;User ID=mes_reader;Password=x;TrustServerCertificate=True");
    }
}
