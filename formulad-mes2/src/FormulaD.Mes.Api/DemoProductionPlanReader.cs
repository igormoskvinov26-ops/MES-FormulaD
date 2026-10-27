using System.Text.Json;

namespace FormulaD.Mes.Api;

/// <summary>Читает синтетические записи из fixtures/production-plan.demo.json. Никакого SQL.</summary>
public sealed class DemoProductionPlanReader : IProductionPlanReader, IPlanOrderEditor
{
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web) { PropertyNameCaseInsensitive = true };

    private readonly Lazy<List<ProductionPlanItem>> _items;
    private readonly IEventLog _eventLog;

    // ponytail: одна блокировка на весь список. Демо-данные живут в памяти одного процесса,
    // и их объём — десятки строк; делить блокировку не на чем.
    private readonly Lock _gate = new();

    public DemoProductionPlanReader(string fixturePath, IEventLog eventLog)
    {
        _items = new(() => Load(fixturePath));
        _eventLog = eventLog;
    }

    private static List<ProductionPlanItem> Load(string path)
    {
        using var stream = File.OpenRead(path);
        return JsonSerializer.Deserialize<List<ProductionPlanItem>>(stream, JsonOptions)
               ?? throw new InvalidOperationException("Демо-фикстура пуста или нечитаема.");
    }

    public Task<PagedResult<ProductionPlanItem>> GetPageAsync(ProductionPlanQuery query, CancellationToken ct)
    {
        lock (_gate)
        {
            return Task.FromResult(GetPageCore(query));
        }
    }

    private PagedResult<ProductionPlanItem> GetPageCore(ProductionPlanQuery query)
    {
        IEnumerable<ProductionPlanItem> q = _items.Value;

        if (!string.IsNullOrWhiteSpace(query.Vin))
        {
            // Тот же выбор режима, что и у SQL-ридера: только цифры — по концу VIN, иначе — по началу.
            var needle = query.Vin.Trim();
            q = VinSearch.IsSuffixSearch(needle)
                ? q.Where(i => i.Vin.EndsWith(needle, StringComparison.OrdinalIgnoreCase))
                : q.Where(i => i.Vin.StartsWith(needle, StringComparison.OrdinalIgnoreCase));
        }

        if (query.Status is not null)
        {
            // Пустая строка = фильтр по записям без статуса (Status IS NULL).
            var status = query.Status.Length == 0 ? null : query.Status;
            q = q.Where(i => string.Equals(i.Status, status, StringComparison.Ordinal));
        }

        // Тот же порядок, что в SQL: по SEQN, изделия без порядка — в конец, затем VIN.
        var ordered = q
            .OrderBy(i => i.Seqn is null ? 1 : 0)
            .ThenBy(i => i.Seqn ?? int.MaxValue)
            .ThenBy(i => i.Vin, StringComparer.Ordinal)
            .ToList();
        var page = ordered.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToList();
        return new PagedResult<ProductionPlanItem>(page, query.Page, query.PageSize, ordered.Count);
    }

    /// <summary>
    /// Переставляет изделие на указанную позицию. Набор номеров позиций не меняется —
    /// меняется только то, какому изделию какой номер достался. Поэтому нумерация остаётся
    /// ровно такой же сплошной (или такой же дырявой), какой была до перестановки.
    /// </summary>
    public Task<MoveOutcome> MoveAsync(string vin, int toPosition, string userName, CancellationToken ct)
    {
        lock (_gate)
        {
            var ordered = _items.Value
                .Where(i => i.Seqn is not null)
                .OrderBy(i => i.Seqn)
                .ToList();

            var moved = _items.Value.FirstOrDefault(i => string.Equals(i.Vin, vin, StringComparison.OrdinalIgnoreCase));
            if (moved is null)
            {
                return Task.FromResult(MoveOutcome.VinNotFound);
            }
            var fromPosition = moved.Seqn;
            if (fromPosition is null)
            {
                return Task.FromResult(MoveOutcome.NoPosition);
            }

            var positions = ordered.Select(i => i.Seqn!.Value).ToList();
            var targetIndex = positions.IndexOf(toPosition);
            if (targetIndex < 0)
            {
                return Task.FromResult(MoveOutcome.PositionNotFound);
            }

            var fromIndex = ordered.FindIndex(i => i.Vin == moved.Vin);
            ordered.RemoveAt(fromIndex);
            ordered.Insert(targetIndex, moved);

            // Раздаём прежние номера позиций по новому порядку.
            for (var index = 0; index < ordered.Count; index++)
            {
                var item = ordered[index];
                var slot = positions[index];
                if (item.Seqn != slot)
                {
                    _items.Value[_items.Value.IndexOf(item)] = item with { Seqn = slot };
                }
            }

            _eventLog.Record("ProductionPlan", vin, "Move", fromPosition.ToString(), toPosition.ToString(), userName);
            return Task.FromResult(MoveOutcome.Ok);
        }
    }

    public Task<ProductionPlanItem?> GetByVinAsync(string vin, CancellationToken ct)
    {
        lock (_gate)
        {
            return Task.FromResult(_items.Value.FirstOrDefault(i => string.Equals(i.Vin, vin, StringComparison.OrdinalIgnoreCase)));
        }
    }

    public Task<IReadOnlyList<string?>> GetStatusesAsync(CancellationToken ct)
    {
        IReadOnlyList<string?> statuses = _items.Value
            .Select(i => i.Status)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(s => s is null ? 1 : 0)
            .ThenBy(s => s, StringComparer.Ordinal)
            .ToList();
        return Task.FromResult(statuses);
    }
}
