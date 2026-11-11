using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

/// <summary>
/// Startup checks: required tables exist and schema version is current.
/// Replaces runtime DDL (EnsureTable) with fail-fast on missing tables.
/// </summary>
public static class SqlStartupCheck
{
    // ponytail: bump this when adding a migration; app warns if DB is behind.
    public const int ExpectedSchemaVersion = 2;

    private static readonly string[] RequiredTables =
    [
        "tblProductionPlan",
        "tblDiscrepancyList",
        "tblComponent",
        "tblNCP",
        "tblComponentCheck",
        "tblIncomingSupplier",
        "tblInspectionQuota",
        "tblIncomingDelivery",
        "tblIncomingPackage",
        "tblIncomingPackingRow",
        "tblEventLog",
    ];

    public static async Task RunAsync(SqlOptions options, ILogger logger, CancellationToken ct)
    {
        try
        {
            await using var conn = new SqlConnection(options.ConnectionString);
            await conn.OpenAsync(ct);

            CheckRequiredTables(conn, logger);
            CheckSchemaVersion(conn, logger);
        }
        catch (SqlException ex)
        {
            logger.LogWarning(ex, "Не удалось проверить схему БД при старте — приложение продолжит работу, " +
                "но могут быть ошибки при обращении к БД.");
        }
    }

    private static void CheckRequiredTables(SqlConnection conn, ILogger logger)
    {
        using var cmd = new SqlCommand(
            "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'", conn);

        var existing = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            existing.Add(reader.GetString(0));

        var missing = RequiredTables.Where(t => !existing.Contains(t)).ToList();
        if (missing.Count > 0)
        {
            throw new InvalidOperationException(
                $"В базе данных отсутствуют таблицы: {string.Join(", ", missing)}. " +
                "Примените миграции из sql/migrations/ перед запуском приложения.");
        }

        logger.LogInformation("Все {Count} обязательных таблиц найдены.", RequiredTables.Length);
    }

    private static void CheckSchemaVersion(SqlConnection conn, ILogger logger)
    {
        using var cmd = new SqlCommand(
            "SELECT CASE WHEN OBJECT_ID(N'dbo.__SchemaVersion', N'U') IS NOT NULL THEN 1 ELSE 0 END", conn);

        if ((int)cmd.ExecuteScalar()! == 0)
        {
            logger.LogWarning("Таблица __SchemaVersion не найдена — версионирование схемы не настроено. " +
                "Примените sql/migrations/000_create_version_table.sql.");
            return;
        }

        using var verCmd = new SqlCommand(
            "SELECT ISNULL(MAX(Version), -1) FROM dbo.__SchemaVersion", conn);
        var dbVersion = (int)verCmd.ExecuteScalar()!;

        if (dbVersion < ExpectedSchemaVersion)
        {
            logger.LogWarning("Версия схемы БД ({DbVersion}) ниже ожидаемой ({Expected}). " +
                "Примените недостающие миграции из sql/migrations/.", dbVersion, ExpectedSchemaVersion);
        }
        else
        {
            logger.LogInformation("Версия схемы БД: {Version}.", dbVersion);
        }
    }
}
