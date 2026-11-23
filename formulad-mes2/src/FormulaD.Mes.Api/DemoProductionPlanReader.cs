using System.Text.Json;

namespace FormulaD.Mes.Api;

public sealed class DemoProductionPlanReader : IProductionPlanReader, IPlanOrderEditor, IPlanTransitions, IJobCardPrinter, IPlanPublisher
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { PropertyNameCaseInsensitive = true };
    private readonly Lazy<List<ProductionPlanItem>> _items;
    private readonly IEventLog _eventLog;
    private readonly Lock _gate = new();

    public DemoProductionPlanReader(string fixturePath, IEventLog eventLog)
    { _items = new(() => Load(fixturePath)); _eventLog = eventLog; }

    private static List<ProductionPlanItem> Load(string path)
    {
        using var stream = File.OpenRead(path);
        return JsonSerializer.Deserialize<List<ProductionPlanItem>>(stream, JsonOptions)
               ?? throw new InvalidOperationException("Демо-фикстура пуста или нечитаема.");
    }

    public Task<PagedResult<ProductionPlanItem>> GetPageAsync(ProductionPlanQuery query, CancellationToken ct)
    { lock (_gate) { return Task.FromResult(GetPageCore(query)); } }

    private PagedResult<ProductionPlanItem> GetPageCore(ProductionPlanQuery query)
    {
        IEnumerable<ProductionPlanItem> q = _items.Value;
        if (!string.IsNullOrWhiteSpace(query.Vin))
        {
            var needle = query.Vin.Trim();
            q = VinSearch.IsSuffixSearch(needle)
                ? q.Where(i => i.Vin.EndsWith(needle, StringComparison.OrdinalIgnoreCase))
                : q.Where(i => i.Vin.StartsWith(needle, StringComparison.OrdinalIgnoreCase));
        }
        if (query.Status is not null) { var status = query.Status.Length == 0 ? null : query.Status; q = q.Where(i => string.Equals(i.Status, status, StringComparison.Ordinal)); }
        if (query.StatusId.HasValue) q = q.Where(i => i.StatusId == query.StatusId);
        var ordered = q.OrderBy(i => i.Seqn is null ? 1 : 0).ThenBy(i => i.Seqn ?? int.MaxValue).ThenBy(i => i.Vin, StringComparer.Ordinal).ToList();
        var page = ordered.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToList();
        return new PagedResult<ProductionPlanItem>(page, query.Page, query.PageSize, ordered.Count);
    }

    public Task<MoveOutcome> MoveAsync(string vin, int toPosition, string userName, CancellationToken ct)
    {
        lock (_gate)
        {
            var ordered = _items.Value.Where(i => i.Seqn is not null).OrderBy(i => i.Seqn).ToList();
            var moved = _items.Value.FirstOrDefault(i => string.Equals(i.Vin, vin, StringComparison.OrdinalIgnoreCase));
            if (moved is null) return Task.FromResult(MoveOutcome.VinNotFound);
            if (moved.StatusId > 0) return Task.FromResult(MoveOutcome.StatusRestricted);
            var fromPosition = moved.Seqn;
            if (fromPosition is null) return Task.FromResult(MoveOutcome.NoPosition);
            var positions = ordered.Select(i => i.Seqn!.Value).ToList();
            var targetIndex = positions.IndexOf(toPosition);
            if (targetIndex < 0) return Task.FromResult(MoveOutcome.PositionNotFound);
            var fromIndex = ordered.FindIndex(i => i.Vin == moved.Vin);
            ordered.RemoveAt(fromIndex); ordered.Insert(targetIndex, moved);
            for (var i = 0; i < ordered.Count; i++)
            { var item = ordered[i]; var slot = positions[i]; if (item.Seqn != slot) _items.Value[_items.Value.IndexOf(item)] = item with { Seqn = slot }; }
            _eventLog.Record("ProductionPlan", vin, "Move", fromPosition.ToString(), toPosition.ToString(), userName);
            return Task.FromResult(MoveOutcome.Ok);
        }
    }

    public Task<ProductionPlanItem?> GetByVinAsync(string vin, CancellationToken ct)
    { lock (_gate) { return Task.FromResult(_items.Value.FirstOrDefault(i => string.Equals(i.Vin, vin, StringComparison.OrdinalIgnoreCase))); } }

    public Task<IReadOnlyList<string?>> GetStatusesAsync(CancellationToken ct)
    {
        IReadOnlyList<string?> statuses = _items.Value.Select(i => i.Status).Distinct(StringComparer.Ordinal).OrderBy(s => s is null ? 1 : 0).ThenBy(s => s, StringComparer.Ordinal).ToList();
        return Task.FromResult(statuses);
    }

    private Task<(TransitionOutcome, ProductionPlanItem?)> Transition(string vin, int fromStatusId, string action, string userName, Func<ProductionPlanItem, ProductionPlanItem> apply)
    {
        lock (_gate)
        {
            var index = _items.Value.FindIndex(i => string.Equals(i.Vin, vin, StringComparison.OrdinalIgnoreCase));
            if (index < 0) return Task.FromResult<(TransitionOutcome, ProductionPlanItem?)>((TransitionOutcome.VinNotFound, null));
            var current = _items.Value[index];
            if (current.StatusId != fromStatusId) return Task.FromResult<(TransitionOutcome, ProductionPlanItem?)>((TransitionOutcome.WrongStatus, current));
            var updated = apply(current);
            _items.Value[index] = updated;
            _eventLog.Record("ProductionPlan", vin, action, fromStatusId.ToString(), updated.StatusId.ToString(), userName);
            return Task.FromResult<(TransitionOutcome, ProductionPlanItem?)>((TransitionOutcome.Ok, updated));
        }
    }

    public Task<(TransitionOutcome, ProductionPlanItem?)> StartAsync(string vin, string userName, CancellationToken ct)
        => Transition(vin, 0, "Start", userName, c => c with { StatusId = 1, Status = "in progress", StartDate = DateTime.Now });
    public Task<(TransitionOutcome, ProductionPlanItem?)> CompleteAsync(string vin, string userName, CancellationToken ct)
        => Transition(vin, 1, "Complete", userName, c => c with { StatusId = 2, Status = "complete", CompleteDate = DateTime.Now });
    public Task<(TransitionOutcome, ProductionPlanItem?)> FokAsync(string vin, string userName, CancellationToken ct)
        => Transition(vin, 2, "FOK", userName, c => c with { StatusId = 3, Status = "FOK", FokDate = DateTime.Now });
    public Task<(TransitionOutcome, ProductionPlanItem?)> SendToReworkAsync(string vin, string userName, CancellationToken ct)
        => Transition(vin, 2, "SendToRework", userName, c => c with { StatusId = 4, Status = "rework" });
    public Task<(TransitionOutcome, ProductionPlanItem?)> FinishReworkAsync(string vin, string userName, CancellationToken ct)
        => Transition(vin, 4, "FinishRework", userName, c => c with { StatusId = 2, Status = "complete" });

    public Task<ProductionPlanItem?> MarkPrintedAsync(string vin, string userName, CancellationToken ct)
    {
        lock (_gate)
        {
            var index = _items.Value.FindIndex(i => string.Equals(i.Vin, vin, StringComparison.OrdinalIgnoreCase));
            if (index < 0) return Task.FromResult<ProductionPlanItem?>(null);
            var current = _items.Value[index]; var updated = current with { PrintDate = DateTime.Now };
            _items.Value[index] = updated;
            _eventLog.Record("ProductionPlan", vin, "Print", current.PrintDate?.ToString("O"), updated.PrintDate?.ToString("O"), userName);
            return Task.FromResult<ProductionPlanItem?>(updated);
        }
    }

    public Task<int> PublishAsync(IReadOnlyList<NewPlanRow> rows, string userName, CancellationToken ct)
    {
        lock (_gate)
        {
            var nextId = _items.Value.Count == 0 ? 1 : _items.Value.Max(i => i.Id) + 1;
            var nextSeqn = _items.Value.Count == 0 ? 1 : _items.Value.Where(i => i.Seqn is not null).Select(i => i.Seqn!.Value).DefaultIfEmpty(0).Max() + 1;
            foreach (var row in rows)
            {
                _items.Value.Add(new ProductionPlanItem(row.Vin, nextId++, nextSeqn++, row.ModelArticle, row.ModelName,
                    row.EngineNumber, null, row.Color, row.SpecificationName, "planned", 0,
                    null, row.PlannedStartDate, row.PlannedCompleteDate, row.PlannedShipmentDate, null, null, null));
                _eventLog.Record("ProductionPlan", row.Vin, "Import", null, $"SEQN={nextSeqn - 1}", userName);
            }
            return Task.FromResult(rows.Count);
        }
    }
}
