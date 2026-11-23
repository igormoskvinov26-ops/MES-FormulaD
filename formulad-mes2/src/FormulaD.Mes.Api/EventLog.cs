using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

public sealed record EventLogEntry(
    int Id, string EntityType, string EntityKey, string Action,
    string? OldValue, string? NewValue, string UserName, DateTime OccurredAt);

public interface IEventLog
{
    void Record(string entityType, string entityKey, string action, string? oldValue, string? newValue, string userName);
    IReadOnlyList<EventLogEntry> Query(string? entityType, string? entityKey, int limit);
}

public sealed class InMemoryEventLog : IEventLog
{
    private readonly Lock _gate = new();
    private readonly List<EventLogEntry> _entries = [];
    private int _nextId = 1;

    public void Record(string entityType, string entityKey, string action, string? oldValue, string? newValue, string userName)
    {
        lock (_gate)
            _entries.Add(new EventLogEntry(_nextId++, entityType, entityKey, action, oldValue, newValue, userName, DateTime.Now));
    }

    public IReadOnlyList<EventLogEntry> Query(string? entityType, string? entityKey, int limit)
    {
        lock (_gate)
        {
            IEnumerable<EventLogEntry> q = _entries;
            if (!string.IsNullOrEmpty(entityType)) q = q.Where(e => e.EntityType == entityType);
            if (!string.IsNullOrEmpty(entityKey)) q = q.Where(e => e.EntityKey == entityKey);
            return q.OrderByDescending(e => e.Id).Take(limit).ToList();
        }
    }
}

public sealed class SqlEventLog : IEventLog
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;

    public SqlEventLog(string connectionString, int commandTimeout = 30)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    public void PurgeOldEntries(int retentionDays)
    {
        if (retentionDays <= 0) return;
        try
        {
            using var conn = new SqlConnection(_connectionString);
            conn.Open();
            using var cmd = new SqlCommand(
                "DELETE FROM [dbo].[tblEventLog] WHERE [occurred_at] < DATEADD(DAY, -@days, SYSDATETIME())", conn)
            { CommandTimeout = _commandTimeout };
            cmd.Parameters.AddWithValue("@days", retentionDays);
            cmd.ExecuteNonQuery();
        }
        catch (Exception ex) { Console.Error.WriteLine($"[EventLog] Purge failed: {ex.Message}"); }
    }

    public void Record(string entityType, string entityKey, string action, string? oldValue, string? newValue, string userName)
    {
        try
        {
            using var conn = new SqlConnection(_connectionString);
            conn.Open();
            using var cmd = new SqlCommand(
                """
                INSERT INTO [dbo].[tblEventLog]
                    ([entity_type],[entity_key],[action],[old_value],[new_value],[user_name],[occurred_at])
                VALUES (@et,@ek,@a,@ov,@nv,@un,SYSDATETIME())
                """, conn) { CommandTimeout = _commandTimeout };
            cmd.Parameters.AddWithValue("@et", entityType);
            cmd.Parameters.AddWithValue("@ek", entityKey);
            cmd.Parameters.AddWithValue("@a", action);
            cmd.Parameters.AddWithValue("@ov", (object?)oldValue ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@nv", (object?)newValue ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@un", userName);
            cmd.ExecuteNonQuery();
        }
        catch (Exception ex) { Console.Error.WriteLine($"[EventLog] INSERT failed: {ex.Message}"); }
    }

    public IReadOnlyList<EventLogEntry> Query(string? entityType, string? entityKey, int limit)
    {
        try
        {
            using var conn = new SqlConnection(_connectionString);
            conn.Open();
            var where = new System.Text.StringBuilder("WHERE 1=1");
            if (!string.IsNullOrEmpty(entityType)) where.Append(" AND [entity_type]=@et");
            if (!string.IsNullOrEmpty(entityKey)) where.Append(" AND [entity_key]=@ek");
            using var cmd = new SqlCommand(
                $"SELECT TOP (@lim) [id],[entity_type],[entity_key],[action],[old_value],[new_value],[user_name],[occurred_at] FROM [dbo].[tblEventLog] {where} ORDER BY [id] DESC", conn)
            { CommandTimeout = _commandTimeout };
            cmd.Parameters.AddWithValue("@lim", limit);
            if (!string.IsNullOrEmpty(entityType)) cmd.Parameters.AddWithValue("@et", entityType);
            if (!string.IsNullOrEmpty(entityKey)) cmd.Parameters.AddWithValue("@ek", entityKey);
            using var reader = cmd.ExecuteReader();
            var entries = new List<EventLogEntry>();
            while (reader.Read())
                entries.Add(new(reader.GetInt32(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
                    reader.IsDBNull(4) ? null : reader.GetString(4), reader.IsDBNull(5) ? null : reader.GetString(5),
                    reader.GetString(6), reader.GetDateTime(7)));
            return entries;
        }
        catch (Exception ex) { Console.Error.WriteLine($"[EventLog] Query failed: {ex.Message}"); return []; }
    }
}

public sealed class FileEventLog : IEventLog
{
    public const int MaxLoaded = 20000;
    private static readonly System.Text.Json.JsonSerializerOptions JsonOptions = new(System.Text.Json.JsonSerializerDefaults.Web);
    private readonly Lock _gate = new();
    private readonly string _path;
    private readonly List<EventLogEntry> _entries = [];
    private int _nextId = 1;

    public FileEventLog(string path)
    {
        _path = path;
        if (!File.Exists(path)) return;
        foreach (var line in File.ReadLines(path).TakeLast(MaxLoaded))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            try
            {
                var entry = System.Text.Json.JsonSerializer.Deserialize<EventLogEntry>(line, JsonOptions);
                if (entry is not null) _entries.Add(entry);
            }
            catch (System.Text.Json.JsonException) { }
        }
        _nextId = _entries.Count == 0 ? 1 : _entries.Max(e => e.Id) + 1;
    }

    public void Record(string entityType, string entityKey, string action, string? oldValue, string? newValue, string userName)
    {
        lock (_gate)
        {
            var entry = new EventLogEntry(_nextId++, entityType, entityKey, action, oldValue, newValue, userName, DateTime.Now);
            _entries.Add(entry);
            try
            {
                var dir = Path.GetDirectoryName(Path.GetFullPath(_path));
                if (dir is not null) Directory.CreateDirectory(dir);
                File.AppendAllText(_path, System.Text.Json.JsonSerializer.Serialize(entry, JsonOptions) + "\n");
            }
            catch (IOException ex) { Console.Error.WriteLine($"Журнал событий: не удалось записать в {_path}: {ex.Message}"); }
        }
    }

    public IReadOnlyList<EventLogEntry> Query(string? entityType, string? entityKey, int limit)
    {
        lock (_gate)
        {
            IEnumerable<EventLogEntry> q = _entries;
            if (!string.IsNullOrEmpty(entityType)) q = q.Where(e => e.EntityType == entityType);
            if (!string.IsNullOrEmpty(entityKey)) q = q.Where(e => e.EntityKey == entityKey);
            return q.OrderByDescending(e => e.Id).Take(limit).ToList();
        }
    }
}
