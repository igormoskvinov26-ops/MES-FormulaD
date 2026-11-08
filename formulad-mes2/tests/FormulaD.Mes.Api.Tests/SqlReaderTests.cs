using Microsoft.Extensions.Configuration;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

/// <summary>
/// Проверки SQL-конфигурации: fail-closed при отсутствии строки подключения или базы данных.
/// Соединение не открывается ни в одном тесте.
/// </summary>
public sealed class SqlOptionsTests
{
    private const string TestConnection = "Server=mes-test-sql,1433;Database=FormulaD_TEST;User ID=mes_reader;Password=x;TrustServerCertificate=True";

    private static IConfiguration Config(params (string Key, string? Value)[] values)
        => new ConfigurationBuilder().AddInMemoryCollection(values.Select(v => new KeyValuePair<string, string?>(v.Key, v.Value))).Build();

    [Fact]
    public void Requires_Connection_String()
    {
        var error = Assert.Throws<InvalidOperationException>(() =>
            SqlOptions.Create(Config()));
        Assert.Contains("Sql:ConnectionString", error.Message);
    }

    [Fact]
    public void Rejects_Empty_Database()
    {
        var error = Assert.Throws<InvalidOperationException>(() =>
            SqlOptions.Create(Config(("Sql:ConnectionString", "Server=host;User ID=test;Password=x"))));
        Assert.Contains("Initial Catalog", error.Message);
    }

    [Fact]
    public void Accepts_Valid_Connection_And_Forces_ReadOnly_Intent()
    {
        var options = SqlOptions.Create(Config(("Sql:ConnectionString", TestConnection)));

        Assert.Contains("ReadOnly", options.ConnectionString);
        Assert.Equal(15, options.CommandTimeoutSeconds);
    }

    [Fact]
    public void Accepts_Any_Database_Name()
    {
        var options = SqlOptions.Create(Config(
            ("Sql:ConnectionString", "Server=SQLACCESS;Database=FormulaD;User ID=mes_user;Password=x")));
        Assert.Contains("ReadOnly", options.ConnectionString);
    }
}
