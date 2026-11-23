using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

/// <summary>
/// Applies numbered SQL migrations from <c>sql/migrations/</c> on startup.
/// Reads <c>__schema_version</c> to skip already-applied versions.
/// Runs on the write connection — needs CREATE TABLE on first run (migration 0001
/// creates the tracking table itself), then only DML for recording versions.
/// </summary>
public static class SchemaMigrator
{
    public static async Task MigrateAsync(SqlOptions options, string migrationsPath, CancellationToken ct = default)
    {
        if (!Directory.Exists(migrationsPath))
            throw new InvalidOperationException($"Migrations directory not found: {migrationsPath}");

        var files = Directory.GetFiles(migrationsPath, "*.sql")
            .Where(f => !f.EndsWith(".rollback.sql", StringComparison.OrdinalIgnoreCase))
            .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (files.Count == 0) return;

        await using var conn = new SqlConnection(options.WriteConnectionString);
        await conn.OpenAsync(ct);

        var applied = await GetAppliedVersionsAsync(conn, options.CommandTimeoutSeconds, ct);

        foreach (var file in files)
        {
            var version = ParseVersion(Path.GetFileName(file));
            if (version <= 0 || applied.Contains(version)) continue;

            var sql = await File.ReadAllTextAsync(file, ct);
            await ExecuteBatchesAsync(conn, sql, options.CommandTimeoutSeconds, ct);

            applied.Add(version);
        }
    }

    // ponytail: version = leading digits in filename, e.g. "0001_foo.sql" → 1
    internal static int ParseVersion(string fileName)
    {
        var span = fileName.AsSpan();
        var end = 0;
        while (end < span.Length && char.IsAsciiDigit(span[end])) end++;
        return end > 0 && int.TryParse(span[..end], out var v) ? v : 0;
    }

    public static async Task<int> GetCurrentVersionAsync(SqlOptions options, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(options.ConnectionString);
        await conn.OpenAsync(ct);

        if (!await TableExistsAsync(conn, "__schema_version", options.CommandTimeoutSeconds, ct))
            return 0;

        await using var cmd = new SqlCommand(
            "SELECT ISNULL(MAX([Version]), 0) FROM [dbo].[__schema_version]", conn)
        { CommandTimeout = options.CommandTimeoutSeconds };

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is int v ? v : 0;
    }

    private static async Task<HashSet<int>> GetAppliedVersionsAsync(
        SqlConnection conn, int timeout, CancellationToken ct)
    {
        if (!await TableExistsAsync(conn, "__schema_version", timeout, ct))
            return [];

        await using var cmd = new SqlCommand(
            "SELECT [Version] FROM [dbo].[__schema_version]", conn)
        { CommandTimeout = timeout };

        var set = new HashSet<int>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            set.Add(reader.GetInt32(0));
        return set;
    }

    private static async Task<bool> TableExistsAsync(
        SqlConnection conn, string tableName, int timeout, CancellationToken ct)
    {
        await using var cmd = new SqlCommand(
            "SELECT OBJECT_ID(@name, N'U')", conn) { CommandTimeout = timeout };
        cmd.Parameters.AddWithValue("@name", $"[dbo].[{tableName}]");
        return await cmd.ExecuteScalarAsync(ct) is not null and not DBNull;
    }

    // ponytail: split on GO (batch separator), skip empty batches
    private static async Task ExecuteBatchesAsync(
        SqlConnection conn, string sql, int timeout, CancellationToken ct)
    {
        var batches = sql.Split(
            ["\nGO\n", "\nGO\r\n", "\nGO"],
            StringSplitOptions.RemoveEmptyEntries);

        foreach (var batch in batches)
        {
            var trimmed = batch.Trim();
            if (trimmed.Length == 0) continue;

            await using var cmd = new SqlCommand(trimmed, conn) { CommandTimeout = timeout };
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }
}
