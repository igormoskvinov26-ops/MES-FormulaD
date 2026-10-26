using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

/// <summary>
/// Настройки подключения к TEST-экземпляру SQL Server. Fail-closed: любая неполная
/// или похожая на PROD конфигурация приводит к ошибке запуска, а не к попытке соединения.
/// </summary>
public sealed record SqlOptions(string ConnectionString, int CommandTimeoutSeconds)
{
    /// <summary>Имена PROD-ресурсов, которые приложение отказывается открывать даже на чтение.</summary>
    private static readonly string[] ForbiddenHosts = ["SQLACCESS"];
    private static readonly string[] ForbiddenDatabases = ["FormulaD"];

    /// <summary>Админские учётки, недопустимые для read-only доступа.</summary>
    private static readonly string[] ForbiddenLogins = ["sa", "sa1"];

    public static SqlOptions Create(IConfiguration configuration)
    {
        if (!configuration.GetValue("Sql:IsTestEnvironment", false))
        {
            throw new InvalidOperationException(
                "DataSource='Sql' требует явного подтверждения тестовой среды: Sql:IsTestEnvironment=true. " +
                "PROD-подключение этим приложением не поддерживается.");
        }

        var connectionString = configuration["Sql:ConnectionString"];
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "Не задана Sql:ConnectionString. Задайте её через user-secrets или переменные среды; " +
                "в репозитории строк подключения нет.");
        }

        var builder = new SqlConnectionStringBuilder(connectionString);
        Validate(builder);

        // ponytail: ReadOnly-намерение и таймауты — страховка, а не замена прав SQL-логина.
        // Настоящая гарантия только чтения — отдельный TEST-логин с одним SELECT.
        builder.ApplicationIntent = ApplicationIntent.ReadOnly;
        builder.ApplicationName = "FormulaD.Mes.Api (read-only)";
        builder.ConnectTimeout = Math.Min(builder.ConnectTimeout is 0 ? 5 : builder.ConnectTimeout, 15);

        return new SqlOptions(builder.ConnectionString, configuration.GetValue("Sql:CommandTimeoutSeconds", 15));
    }

    private static void Validate(SqlConnectionStringBuilder builder)
    {
        var host = builder.DataSource ?? string.Empty;
        if (ForbiddenHosts.Any(forbidden => host.Contains(forbidden, StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException(
                $"Хост '{host}' относится к PROD и запрещён. Допустим только отдельный тестовый экземпляр SQL Server.");
        }

        var database = builder.InitialCatalog ?? string.Empty;
        if (ForbiddenDatabases.Any(forbidden => string.Equals(database, forbidden, StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException(
                $"База '{database}' является рабочей и запрещена. Используйте отдельную обезличенную TEST-базу.");
        }

        if (database.Length == 0)
        {
            throw new InvalidOperationException("В строке подключения не указана база данных (Initial Catalog).");
        }

        var login = builder.UserID ?? string.Empty;
        if (ForbiddenLogins.Any(forbidden => string.Equals(login, forbidden, StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException(
                $"Учётная запись '{login}' административная. Требуется отдельный TEST-логин только с правом SELECT.");
        }
    }
}
