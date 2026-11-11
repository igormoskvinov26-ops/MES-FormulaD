using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

// ponytail: append-only SQL event log (T-005); app login should have INSERT but no UPDATE/DELETE on tblEventLog
public sealed class SqlEventLog(SqlOptions options) : IEventLog
{
    public void Record(string entityType, string entityKey, string action, string? oldValue, string? newValue, string userName)
    {
        using var conn = new SqlConnection(options.WriteConnectionString);
        conn.Open();
        using var cmd = new SqlCommand(
            "INSERT INTO tblEventLog (EntityType, EntityKey, Action, OldValue, NewValue, UserName) " +
            "VALUES (@et, @ek, @a, @ov, @nv, @u)", conn);
        cmd.Parameters.AddWithValue("@et", entityType);
        cmd.Parameters.AddWithValue("@ek", entityKey);
        cmd.Parameters.AddWithValue("@a", action);
        cmd.Parameters.AddWithValue("@ov", (object?)oldValue ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@nv", (object?)newValue ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@u", userName);
        cmd.CommandTimeout = options.CommandTimeoutSeconds;
        cmd.ExecuteNonQuery();
    }

    public IReadOnlyList<EventLogEntry> Query(string? entityType, string? entityKey, int limit)
    {
        using var conn = new SqlConnection(options.ConnectionString);
        conn.Open();
        var sql = "SELECT TOP (@limit) Id, EntityType, EntityKey, Action, OldValue, NewValue, UserName, OccurredAt " +
                  "FROM tblEventLog WHERE 1=1";
        if (!string.IsNullOrEmpty(entityType)) sql += " AND EntityType = @et";
        if (!string.IsNullOrEmpty(entityKey)) sql += " AND EntityKey = @ek";
        sql += " ORDER BY Id DESC";

        using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@limit", limit);
        if (!string.IsNullOrEmpty(entityType)) cmd.Parameters.AddWithValue("@et", entityType);
        if (!string.IsNullOrEmpty(entityKey)) cmd.Parameters.AddWithValue("@ek", entityKey);
        cmd.CommandTimeout = options.CommandTimeoutSeconds;

        using var r = cmd.ExecuteReader();
        var list = new List<EventLogEntry>();
        while (r.Read())
        {
            list.Add(new EventLogEntry(
                (int)r.GetInt64(0), r.GetString(1), r.GetString(2), r.GetString(3),
                r.IsDBNull(4) ? null : r.GetString(4),
                r.IsDBNull(5) ? null : r.GetString(5),
                r.GetString(6), r.GetDateTime(7)));
        }
        return list;
    }
}
