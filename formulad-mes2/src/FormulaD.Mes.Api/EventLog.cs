namespace FormulaD.Mes.Api;

/// <summary>Одна запись в журнале событий. Раздел 25 спецификации.</summary>
public sealed record EventLogEntry(
    int Id,
    string EntityType,
    string EntityKey,
    string Action,
    string? OldValue,
    string? NewValue,
    string UserName,
    DateTime OccurredAt);

/// <summary>
/// Общий журнал для всех операций записи — заводится один раз (см. docs/DEVELOPMENT_PLAN.md,
/// Этап 1), чтобы не пристраивать его к каждой новой пишущей функции по отдельности.
/// Только демо: события живут в памяти процесса и не переживают перезапуск.
/// </summary>
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
        {
            _entries.Add(new EventLogEntry(_nextId++, entityType, entityKey, action, oldValue, newValue, userName, DateTime.Now));
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
