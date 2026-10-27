using System.Text.Json;

namespace FormulaD.Mes.Api;

/// <summary>Читает синтетические записи из fixtures/production-plan.demo.json. Никакого SQL.</summary>
public sealed class DemoProductionPlanReader : IProductionPlanReader, IPlanOrderEditor, IPlanTransitions, IJobCardPrinter, IPlanPublisher
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

        if (query.StatusId.HasValue)
        {
            q = q.Where(i => i.StatusId == query.StatusId);
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

    /// <summary>
    /// Общий ход для всех переходов статуса: проверить VIN, проверить исходный статус,
    /// применить изменение, записать в журнал. Строковое поле Status обновляется теми же
    /// литералами, что использует реальный Access-обработчик (R-03/R-04/R-05 аудита:
    /// 'in progress'/'complete'/'FOK') — не придумываем новые значения, копируем существующие.
    /// В отличие от AS-IS, статус проверяется ДО записи, поэтому повторный переход невозможен.
    /// </summary>
    private Task<(TransitionOutcome, ProductionPlanItem?)> Transition(
        string vin, int fromStatusId, string action, string userName, Func<ProductionPlanItem, ProductionPlanItem> apply)
    {
        lock (_gate)
        {
            var index = _items.Value.FindIndex(i => string.Equals(i.Vin, vin, StringComparison.OrdinalIgnoreCase));
            if (index < 0)
            {
                return Task.FromResult<(TransitionOutcome, ProductionPlanItem?)>((TransitionOutcome.VinNotFound, null));
            }

            var current = _items.Value[index];
            if (current.StatusId != fromStatusId)
            {
                return Task.FromResult<(TransitionOutcome, ProductionPlanItem?)>((TransitionOutcome.WrongStatus, current));
            }

            var updated = apply(current);
            _items.Value[index] = updated;
            _eventLog.Record("ProductionPlan", vin, action, fromStatusId.ToString(), updated.StatusId.ToString(), userName);
            return Task.FromResult<(TransitionOutcome, ProductionPlanItem?)>((TransitionOutcome.Ok, updated));
        }
    }

    public Task<(TransitionOutcome, ProductionPlanItem?)> StartAsync(string vin, string userName, CancellationToken ct)
        => Transition(vin, fromStatusId: 0, "Start", userName,
            c => c with { StatusId = 1, Status = "in progress", StartDate = DateTime.Now });

    public Task<(TransitionOutcome, ProductionPlanItem?)> CompleteAsync(string vin, string userName, CancellationToken ct)
        => Transition(vin, fromStatusId: 1, "Complete", userName,
            c => c with { StatusId = 2, Status = "complete", CompleteDate = DateTime.Now });

    public Task<(TransitionOutcome, ProductionPlanItem?)> FokAsync(string vin, string userName, CancellationToken ct)
        => Transition(vin, fromStatusId: 2, "FOK", userName,
            c => c with { StatusId = 3, Status = "FOK", FokDate = DateTime.Now });

    // Литерал 'rework' для Status не подтверждён аудитом (в отличие от 'in progress'/'complete'/
    // 'FOK') — сверить при переходе на TEST. CompleteDate не трогаем: сборка уже была завершена
    // раньше, Rework устраняет отклонения, а не повторяет сборку.
    public Task<(TransitionOutcome, ProductionPlanItem?)> SendToReworkAsync(string vin, string userName, CancellationToken ct)
        => Transition(vin, fromStatusId: 2, "SendToRework", userName,
            c => c with { StatusId = 4, Status = "rework" });

    public Task<(TransitionOutcome, ProductionPlanItem?)> FinishReworkAsync(string vin, string userName, CancellationToken ct)
        => Transition(vin, fromStatusId: 4, "FinishRework", userName,
            c => c with { StatusId = 2, Status = "complete" });

    // Печать разрешена в любом статусе — JobCard нужна и до запуска, и повторно на линии.
    public Task<ProductionPlanItem?> MarkPrintedAsync(string vin, string userName, CancellationToken ct)
    {
        lock (_gate)
        {
            var index = _items.Value.FindIndex(i => string.Equals(i.Vin, vin, StringComparison.OrdinalIgnoreCase));
            if (index < 0)
            {
                return Task.FromResult<ProductionPlanItem?>(null);
            }

            var current = _items.Value[index];
            var updated = current with { PrintDate = DateTime.Now };
            _items.Value[index] = updated;
            _eventLog.Record("ProductionPlan", vin, "Print", current.PrintDate?.ToString("O"), updated.PrintDate?.ToString("O"), userName);
            return Task.FromResult<ProductionPlanItem?>(updated);
        }
    }

    // Раздел 6.3: «в конец существующей очереди», одной операцией под общей блокировкой —
    // значит ни одна другая запись (перестановка, переход статуса) не может вклиниться
    // между вычислением следующего SEQN/ID и добавлением строк.
    public Task<int> PublishAsync(IReadOnlyList<NewPlanRow> rows, string userName, CancellationToken ct)
    {
        lock (_gate)
        {
            var nextId = _items.Value.Count == 0 ? 1 : _items.Value.Max(i => i.Id) + 1;
            var nextSeqn = _items.Value.Count == 0 ? 1 : _items.Value.Where(i => i.Seqn is not null).Select(i => i.Seqn!.Value).DefaultIfEmpty(0).Max() + 1;

            foreach (var row in rows)
            {
                var item = new ProductionPlanItem(
                    Vin: row.Vin,
                    Id: nextId++,
                    Seqn: nextSeqn++,
                    ModelArticle: row.ModelArticle,
                    ModelName: row.ModelName,
                    EngineNumber: row.EngineNumber,
                    Color: row.Color,
                    SpecificationName: row.SpecificationName,
                    Status: "planned",
                    StatusId: 0,
                    PrintDate: null,
                    PlannedStartDate: row.PlannedStartDate,
                    PlannedCompleteDate: row.PlannedCompleteDate,
                    PlannedShipmentDate: row.PlannedShipmentDate,
                    StartDate: null,
                    CompleteDate: null,
                    FokDate: null);
                _items.Value.Add(item);
                _eventLog.Record("ProductionPlan", item.Vin, "Import", null, $"SEQN={item.Seqn}", userName);
            }

            return Task.FromResult(rows.Count);
        }
    }
}
