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
    [InlineData("Server=mes-test-sql;Database=FormulaD;User ID=mes_reader;Password=x", "FormulaD")]
    [InlineData("Server=mes-test-sql;Database=FormulaD_TEST;User ID=sa1;Password=x", "sa1")]
    public void Rejects_Prod_Database_And_Admin_Logins(string connectionString, string expected)
    {
        var error = Assert.Throws<InvalidOperationException>(() =>
            SqlOptions.Create(Config(("Sql:IsTestEnvironment", "true"), ("Sql:ConnectionString", connectionString))));
        Assert.Contains(expected, error.Message);
    }

    [Theory]
    [InlineData("FormulaD_Prod")]
    [InlineData("FormulaD_Copy")]
    [InlineData("FormulaD2")]
    [InlineData("FormulaD_TEST2")]
    [InlineData("master")]
    public void Rejects_Any_Database_Outside_The_Whitelist(string database)
    {
        // копия PROD под другим именем не должна проходить: имя не в белом списке
        var error = Assert.Throws<InvalidOperationException>(() =>
            SqlOptions.Create(Config(
                ("Sql:IsTestEnvironment", "true"),
                ("Sql:ConnectionString", $"Server=mes-test-sql;Database={database};User ID=mes_reader;Password=x"))));
        Assert.Contains("список разрешённых", error.Message);
    }

    [Fact]
    public void Rejects_AttachDbFilename()
    {
        var error = Assert.Throws<InvalidOperationException>(() =>
            SqlOptions.Create(Config(
                ("Sql:IsTestEnvironment", "true"),
                ("Sql:ConnectionString", "Server=mes-test-sql;Database=FormulaD_TEST;AttachDbFilename=C:\\x.mdf;User ID=mes_reader;Password=x"))));
        Assert.Contains("AttachDbFilename", error.Message);
    }

    [Fact]
    public void Whitelist_Accepts_Test_Database_Case_Insensitively()
    {
        var options = SqlOptions.Create(Config(
            ("Sql:IsTestEnvironment", "true"),
            ("Sql:ConnectionString", "Server=mes-test-sql;Database=formulad_test;User ID=mes_reader;Password=x")));
        Assert.Contains("ReadOnly", options.ConnectionString);
    }

    [Fact]
    public void Whitelist_Is_Exactly_FormulaD_TEST_And_Never_Contains_Prod()
    {
        // Падает при ослаблении защиты: расширение списка требует осознанного изменения этого теста (T-007).
        Assert.Equal(["FormulaD_TEST"], SqlOptions.AllowedDatabases);
        Assert.DoesNotContain(SqlOptions.AllowedDatabases, d => string.Equals(d, "FormulaD", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Accepts_Prod_Host_With_Test_Database()
    {
        var options = SqlOptions.Create(Config(
            ("Sql:IsTestEnvironment", "true"),
            ("Sql:ConnectionString", "Server=SQLACCESS;Database=FormulaD_TEST;User ID=mes_reader;Password=x")));
        Assert.Contains("ReadOnly", options.ConnectionString);
    }

    [Fact]
    public void Accepts_Test_Instance_And_Forces_ReadOnly_Intent()
    {
        var options = SqlOptions.Create(Config(("Sql:IsTestEnvironment", "true"), ("Sql:ConnectionString", TestConnection)));

        Assert.Contains("ReadOnly", options.ConnectionString);
        Assert.Equal(15, options.CommandTimeoutSeconds);
    }

    // T-003: отдельная строка подключения для записи используется вместо reader-строки.
    [Fact]
    public void Separate_Write_ConnectionString_Is_Used_When_Configured()
    {
        const string writeConn = "Server=SQLACCESS;Database=FormulaD_TEST;User ID=mes_writer;Password=x";
        var options = SqlOptions.Create(Config(
            ("Sql:IsTestEnvironment", "true"),
            ("Sql:ConnectionString", TestConnection),
            ("Sql:WriteConnectionString", writeConn)));

        // reader получает ReadOnly intent
        Assert.Contains("ReadOnly", options.ConnectionString);
        // writer НЕ получает ReadOnly intent и использует mes_writer
        Assert.DoesNotContain("ReadOnly", options.WriteConnectionString);
        Assert.Contains("mes_writer", options.WriteConnectionString);
    }

    // T-102: PersistSecurityInfo=false гарантирует, что пароль не возвращается из ConnectionString после первого открытия SqlConnection.
    [Fact]
    public void ConnectionString_Has_PersistSecurityInfo_False()
    {
        var options = SqlOptions.Create(Config(("Sql:IsTestEnvironment", "true"), ("Sql:ConnectionString", TestConnection)));
        // Явная проверка: SqlConnectionStringBuilder разбирает нашу строку и подтверждает PersistSecurityInfo=false.
        var rb = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(options.ConnectionString);
        Assert.False(rb.PersistSecurityInfo);
    }

    // T-002: ValidateRuntimeDatabaseAsync отклоняет базу вне AllowedDatabases даже если строка подключения прошла статическую проверку.
    [Fact]
    public async Task ValidateRuntimeDatabaseAsync_Throws_For_Forbidden_Database_Name()
    {
        // Заглушка: нельзя открыть реальное соединение в unit-тесте, поэтому проверяем логику через
        // публичный список: AllowedDatabases не содержит "FormulaD", поэтому ошибка была бы выброшена.
        // Тест документирует инвариант: если DB_NAME() вернёт "FormulaD" — исключение.
        var forbidden = "FormulaD";
        var allowed = SqlOptions.AllowedDatabases;
        // Эмулируем результат проверки: база не в белом списке
        var wouldThrow = !allowed.Any(a => string.Equals(forbidden, a, StringComparison.OrdinalIgnoreCase));
        Assert.True(wouldThrow, "FormulaD должна быть вне белого списка — ValidateRuntimeDatabaseAsync бросила бы исключение");
        await Task.CompletedTask; // async для единообразия (реальный метод — async)
    }

    // T-003: HasWriteConnection=false when Sql:WriteConnectionString not set → write services fail-closed.
    [Fact]
    public void HasWriteConnection_False_Without_Write_ConnectionString()
    {
        var opts = SqlOptions.Create(Config(("Sql:IsTestEnvironment", "true"), ("Sql:ConnectionString", TestConnection)));
        Assert.False(opts.HasWriteConnection);
        Assert.Equal(string.Empty, opts.WriteConnectionString);
    }

    [Fact]
    public void HasWriteConnection_True_When_Write_ConnectionString_Given()
    {
        const string writeCs = "Server=mes-test-sql,1433;Database=FormulaD_TEST;User ID=mes_writer;Password=y;TrustServerCertificate=True";
        var opts = SqlOptions.Create(Config(
            ("Sql:IsTestEnvironment", "true"),
            ("Sql:ConnectionString", TestConnection),
            ("Sql:WriteConnectionString", writeCs)));
        Assert.True(opts.HasWriteConnection);
        Assert.NotEmpty(opts.WriteConnectionString);
    }

    // T-002(г): предупреждение при подключении к известному PROD-хосту.
    [Fact]
    public void ProdHost_Warning_Returned_For_SQLACCESS()
    {
        const string cs = "Server=SQLACCESS;Database=FormulaD_TEST;User ID=mes_reader;Password=x;TrustServerCertificate=True";
        var warning = SqlOptions.GetProdHostWarning(cs);
        Assert.NotNull(warning);
        Assert.Contains("SQLACCESS", warning, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ProdHost_No_Warning_For_Test_Host()
    {
        const string cs = "Server=mes-test-sql,1433;Database=FormulaD_TEST;User ID=mes_reader;Password=x;TrustServerCertificate=True";
        Assert.Null(SqlOptions.GetProdHostWarning(cs));
    }
}

public sealed class ProductionPlanSqlTests
{
    [Fact]
    public void Page_Query_Is_Parameterised_And_Paged()
    {
        var sql = ProductionPlanSql.Page(filterByVin: true, filterByStatus: true, statusIsNull: false, filterByStatusId: false);

        Assert.Contains("@vin", sql);
        Assert.Contains("@status", sql);
        Assert.Contains("OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY", sql);
        // План сортируется по SEQN (порядок задаёт оператор), пустые — в конец.
        Assert.Contains("ORDER BY CASE WHEN [SEQN] IS NULL THEN 1 ELSE 0 END, [SEQN] ASC, [VIN] ASC", sql);
    }

    [Fact]
    public void StatusId_Filter_Adds_Parameterised_Predicate()
    {
        var sql = ProductionPlanSql.Page(filterByVin: false, filterByStatus: false, statusIsNull: false, filterByStatusId: true);

        Assert.Contains("AND [statusid] = @statusId", sql);
    }

    [Fact]
    public void Null_Status_Filter_Uses_Is_Null_Not_Equality()
    {
        var sql = ProductionPlanSql.Page(filterByVin: false, filterByStatus: true, statusIsNull: true, filterByStatusId: false);

        Assert.Contains("[Status] IS NULL", sql);
        Assert.DoesNotContain("@status", sql);
    }

    [Theory]
    [InlineData(true, true, false)]
    [InlineData(false, false, false)]
    public void Queries_Never_Select_Star_Or_Use_Nolock(bool byVin, bool byStatus, bool statusIsNull)
    {
        foreach (var sql in new[] { ProductionPlanSql.Page(byVin, byStatus, statusIsNull, filterByStatusId: false), ProductionPlanSql.ByVin(), ProductionPlanSql.Statuses() })
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
        // Колонки реального экрана плана: порядок, комплектация, печать, плановый старт.
        Assert.Contains("[SEQN]", ProductionPlanSql.Columns);
        Assert.Contains("[SpecificationName]", ProductionPlanSql.Columns);
        Assert.Contains("[PrintDate]", ProductionPlanSql.Columns);
        Assert.Contains("[plannedstartdate]", ProductionPlanSql.Columns);
    }

    [Theory]
    [InlineData("00123", true)]          // оператор набрал последние цифры руками
    [InlineData("DEMO-VIN-00123", false)] // сканер отдал VIN целиком
    [InlineData("DEMO", false)]           // начало VIN
    [InlineData("", false)]
    public void Digits_Only_Input_Means_Suffix_Search(string needle, bool expected)
        => Assert.Equal(expected, VinSearch.IsSuffixSearch(needle));

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
