using Microsoft.Extensions.Configuration;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

/// <summary>
/// Проверки SQL-режима без SQL Server: конфигурация fail-closed и тексты запросов.
/// Соединение не открывается ни в одном тесте.
/// </summary>
public sealed class SqlOptionsTests
{
    private const string TestConnection = "Server=mes-test-sql,1433;Database=FormulaD_TEST;User ID=mes_reader;Password=x;TrustServerCertificate=True";

    private static IConfiguration Config(params (string Key, string? Value)[] values)
        => new ConfigurationBuilder().AddInMemoryCollection(values.Select(v => new KeyValuePair<string, string?>(v.Key, v.Value))).Build();

    [Fact]
    public void Requires_Explicit_Test_Environment_Marker()
    {
        var error = Assert.Throws<InvalidOperationException>(() =>
            SqlOptions.Create(Config(("Sql:ConnectionString", TestConnection))));
        Assert.Contains("IsTestEnvironment", error.Message);
    }

    [Fact]
    public void Requires_Connection_String_From_Secrets()
    {
        var error = Assert.Throws<InvalidOperationException>(() =>
            SqlOptions.Create(Config(("Sql:IsTestEnvironment", "true"))));
        Assert.Contains("Sql:ConnectionString", error.Message);
    }

    [Theory]
    [InlineData("Server=SQLACCESS;Database=FormulaD_TEST;User ID=mes_reader;Password=x", "SQLACCESS")]
    [InlineData("Server=mes-test-sql;Database=FormulaD;User ID=mes_reader;Password=x", "FormulaD")]
    [InlineData("Server=mes-test-sql;Database=FormulaD_TEST;User ID=sa1;Password=x", "sa1")]
    public void Rejects_Prod_Host_Prod_Database_And_Admin_Logins(string connectionString, string expected)
    {
        var error = Assert.Throws<InvalidOperationException>(() =>
            SqlOptions.Create(Config(("Sql:IsTestEnvironment", "true"), ("Sql:ConnectionString", connectionString))));
        Assert.Contains(expected, error.Message);
    }

    [Fact]
    public void Accepts_Test_Instance_And_Forces_ReadOnly_Intent()
    {
        var options = SqlOptions.Create(Config(("Sql:IsTestEnvironment", "true"), ("Sql:ConnectionString", TestConnection)));

        Assert.Contains("ReadOnly", options.ConnectionString);
        Assert.Equal(15, options.CommandTimeoutSeconds);
    }
}

public sealed class ProductionPlanSqlTests
{
    [Fact]
    public void Page_Query_Is_Parameterised_And_Paged()
    {
        var sql = ProductionPlanSql.Page(filterByVin: true, filterByStatus: true, statusIsNull: false);

        Assert.Contains("@vinPrefix", sql);
        Assert.Contains("@vinSuffix", sql);
        Assert.Contains("@status", sql);
        Assert.Contains("OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY", sql);
        Assert.Contains("ORDER BY [VIN] ASC", sql);
    }

    [Fact]
    public void Null_Status_Filter_Uses_Is_Null_Not_Equality()
    {
        var sql = ProductionPlanSql.Page(filterByVin: false, filterByStatus: true, statusIsNull: true);

        Assert.Contains("[Status] IS NULL", sql);
        Assert.DoesNotContain("@status", sql);
    }

    [Theory]
    [InlineData(true, true, false)]
    [InlineData(false, false, false)]
    public void Queries_Never_Select_Star_Or_Use_Nolock(bool byVin, bool byStatus, bool statusIsNull)
    {
        foreach (var sql in new[] { ProductionPlanSql.Page(byVin, byStatus, statusIsNull), ProductionPlanSql.ByVin(), ProductionPlanSql.Statuses() })
        {
            Assert.DoesNotContain("SELECT *", sql, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("NOLOCK", sql, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void Column_Whitelist_Excludes_Rowversion_And_Noise_Columns()
    {
        Assert.DoesNotContain("[rv]", ProductionPlanSql.Columns);
        Assert.DoesNotContain("shipment_comments", ProductionPlanSql.Columns);
        Assert.DoesNotContain("ErrorMessage", ProductionPlanSql.Columns);
        Assert.Contains("[VIN]", ProductionPlanSql.Columns);
        Assert.Contains("[FOK_date]", ProductionPlanSql.Columns);
    }

    [Fact]
    public void Vin_Search_Covers_Prefix_And_Suffix_And_Escapes_Wildcards()
    {
        // Путь сканера: без ведущего '%', префиксный LIKE попадает в индекс по VIN.
        Assert.Equal(@"DEMO-VIN%", ProductionPlanSql.LikeStartsWith("DEMO-VIN"));
        // Путь ручного ввода последних цифр.
        Assert.Equal(@"%00123", ProductionPlanSql.LikeEndsWith("00123"));

        Assert.Equal(@"100\%\_test%", ProductionPlanSql.LikeStartsWith("100%_test"));
        Assert.Equal(@"%100\%\_test", ProductionPlanSql.LikeEndsWith("100%_test"));
    }
}
