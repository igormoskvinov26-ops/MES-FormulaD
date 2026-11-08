using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

/// <summary>
/// Настройки подключения к SQL Server. Fail-closed: отсутствие строки подключения
/// или базы данных приводит к ошибке запуска.
/// </summary>
public sealed record SqlOptions(string ConnectionString, string WriteConnectionString, int CommandTimeoutSeconds)
{
    public static SqlOptions Create(IConfiguration configuration)
    {
        var connectionString = configuration["Sql:ConnectionString"];
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "Не задана Sql:ConnectionString. Задайте её через user-secrets или переменные среды; " +
                "в репозитории строк подключения нет.");
        }

        var builder = new SqlConnectionStringBuilder(connectionString);
        Validate(builder);

        builder.ApplicationName = "FormulaD.Mes.Api";
        builder.ConnectTimeout = Math.Min(builder.ConnectTimeout is 0 ? 5 : builder.ConnectTimeout, 15);

        var writeCs = builder.ConnectionString;

        builder.ApplicationIntent = ApplicationIntent.ReadOnly;
        builder.ApplicationName = "FormulaD.Mes.Api (read-only)";
        var readCs = builder.ConnectionString;

        return new SqlOptions(readCs, writeCs, configuration.GetValue("Sql:CommandTimeoutSeconds", 15));
    }

    private static void Validate(SqlConnectionStringBuilder builder)
    {
        var database = builder.InitialCatalog ?? string.Empty;
        if (database.Length == 0)
        {
            throw new InvalidOperationException("В строке подключения не указана база данных (Initial Catalog).");
        }
    }
}
