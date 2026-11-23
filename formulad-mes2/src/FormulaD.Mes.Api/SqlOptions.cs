using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

public sealed record SqlOptions(string ConnectionString, string WriteConnectionString, int CommandTimeoutSeconds, bool HasWriteConnection = false)
{
    private static readonly string[] ForbiddenDatabases = ["FormulaD"];
    public static readonly IReadOnlyList<string> AllowedDatabases = ["FormulaD_TEST"];
    private static readonly string[] ForbiddenLogins = ["sa", "sa1"];
    private static readonly string[] KnownProdHosts = ["SQLACCESS", "SQLACCESS\\MSSQLSERVER"];

    public static string? GetProdHostWarning(string connectionString)
    {
        try
        {
            var host = new SqlConnectionStringBuilder(connectionString).DataSource ?? string.Empty;
            if (KnownProdHosts.Any(h => string.Equals(host, h, StringComparison.OrdinalIgnoreCase)))
                return $"[T-002] Строка подключения указывает на известный PROD-хост '{host}'. " +
                       "Убедитесь, что база — тестовая (AllowedDatabases + IsTestEnvironment)!";
        }
        catch { }
        return null;
    }

    public static SqlOptions Create(IConfiguration configuration)
    {
        if (!configuration.GetValue("Sql:IsTestEnvironment", false))
            throw new InvalidOperationException("DataSource='Sql' требует Sql:IsTestEnvironment=true.");

        var connectionString = configuration["Sql:ConnectionString"];
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException("Не задана Sql:ConnectionString.");

        var builder = new SqlConnectionStringBuilder(connectionString);
        Validate(builder);
        builder.PersistSecurityInfo = false;
        builder.ApplicationName = "FormulaD.Mes.Api";
        builder.ConnectTimeout = Math.Min(builder.ConnectTimeout is 0 ? 5 : builder.ConnectTimeout, 15);

        var explicitWrite = configuration["Sql:WriteConnectionString"];
        string writeCs;
        bool hasWrite;
        if (!string.IsNullOrWhiteSpace(explicitWrite))
        {
            var wb = new SqlConnectionStringBuilder(explicitWrite);
            Validate(wb);
            wb.PersistSecurityInfo = false;
            wb.ApplicationName = "FormulaD.Mes.Api (write)";
            wb.ConnectTimeout = Math.Min(wb.ConnectTimeout is 0 ? 5 : wb.ConnectTimeout, 15);
            writeCs = wb.ConnectionString;
            hasWrite = true;
        }
        else
        {
            writeCs = string.Empty;
            hasWrite = false;
        }

        builder.ApplicationIntent = ApplicationIntent.ReadOnly;
        builder.ApplicationName = "FormulaD.Mes.Api (read-only)";
        return new SqlOptions(builder.ConnectionString, writeCs, configuration.GetValue("Sql:CommandTimeoutSeconds", 15), hasWrite);
    }

    public static async Task ValidateRuntimeDatabaseAsync(string connectionString, int timeoutSeconds, CancellationToken ct = default)
    {
        using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        using var cmd = new SqlCommand("SELECT DB_NAME()", conn) { CommandTimeout = timeoutSeconds };
        var actual = (string)(await cmd.ExecuteScalarAsync(ct))!;
        if (!AllowedDatabases.Any(a => string.Equals(actual, a, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"База '{actual}' не в списке разрешённых.");
    }

    private static void Validate(SqlConnectionStringBuilder builder)
    {
        var database = builder.InitialCatalog ?? string.Empty;
        if (ForbiddenDatabases.Any(f => string.Equals(database, f, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"База '{database}' является рабочей и запрещена.");
        if (database.Length == 0)
            throw new InvalidOperationException("В строке подключения не указана база данных.");
        if (!AllowedDatabases.Any(a => string.Equals(database, a, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"База '{database}' не в списке разрешённых.");
        if (!string.IsNullOrWhiteSpace(builder.AttachDBFilename))
            throw new InvalidOperationException("AttachDbFilename не поддерживается.");
        var login = builder.UserID ?? string.Empty;
        if (ForbiddenLogins.Any(f => string.Equals(login, f, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"Учётная запись '{login}' административная.");
    }
}
