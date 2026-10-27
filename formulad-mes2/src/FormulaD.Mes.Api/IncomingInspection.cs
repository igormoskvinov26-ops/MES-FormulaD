using System.Globalization;
using System.Text.Json;

namespace FormulaD.Mes.Api;

// Входной контроль (раздел 19-24 спецификации, Этап 9 плана разработки). Иерархия обработки,
// как прямо сказано в разделе 19: поставка → упаковки/коробки → строки комплектующих.
// Реализовано ТОЛЬКО для демо-источника — точная схема SQL для этой области ещё не обсуждалась.

public sealed record SupplierRef(string Code, string Name, bool IsParentPlant);

/// <summary>Норматив контроля конкретного артикула (раздел 22). Ровно один из двух задан —
/// если ни один, норматив по умолчанию 100% (раздел 22, [С]).</summary>
public sealed record InspectionQuotaRef(string ComponentCode, int? Percent, int? FixedCount);

/// <summary>
/// Сырая строка Packing List — всё строками, как пришло из вставки/файла (раздел 19, [С]:
/// «кладовщик копирует столбцы из Excel поставщика и вставляет данные в табличную форму»).
/// Номер упаковки — первая колонка: по нему строки группируются в коробки (раздел 19, [С]).
/// </summary>
public sealed record PackingListRawRow(
    string? PackageNumber,
    string? Article,
    string? ComponentName,
    string? Quantity,
    string? NetWeight,
    string? GrossWeight,
    string? Batch);

public sealed record PackingListRowResult(int RowNumber, PackingListRawRow Row, IReadOnlyList<string> Errors, int? PreviewRequiredQuantity)
{
    public bool IsValid => Errors.Count == 0;
}

/// <summary>Сессия загрузки Packing List — тот же паттерн временной области, что в импорте
/// плана (Этап 8, PlanImport.cs): вставка → проверка → исправление → подтверждение.</summary>
public sealed record PackingListSession(
    string Id,
    string DeliveryId,
    DateTime CreatedAt,
    string CreatedBy,
    IReadOnlyList<PackingListRowResult> Rows)
{
    public int TotalCount => Rows.Count;
    public int ErrorCount => Rows.Count(r => !r.IsValid);
}

/// <summary>Статусы — обычные строки на проводе, как и остальные статусы в API
/// (<see cref="ProductionPlanItem.Status"/>, <see cref="NcpItem.Status"/>), не enum: без строкового
/// enum-конвертера сервер и клиент(ы) должны были бы держать одинаковую настройку JSON, а так — нет.</summary>
public static class PackageStatuses
{
    public const string Open = "Open";
    public const string Closed = "Closed";
}

public static class DeliveryStatuses
{
    public const string Open = "Open";
    public const string Verified = "Verified";
    public const string VerifiedWithIssues = "VerifiedWithIssues";
}

/// <summary>
/// Строка комплектующих внутри коробки (раздел 21). Учёт — агрегированно по строке, не по
/// экземпляру: <see cref="OkQuantity"/>/<see cref="DefectQuantity"/>/<see cref="MismatchQuantity"/>/
/// <see cref="ShortageQuantity"/> — независимые счётчики, не переносятся автоматически друг на
/// друга (раздел 21, [С]: «не переносит один найденный дефект автоматически на оставшиеся 15
/// непроверенных штук»). <see cref="RequiredQuantity"/> — снимок норматива на момент
/// подтверждения строки (раздел 22, [П]), не пересчитывается позже при смене значения в справочнике.
/// </summary>
public sealed record PackingListRow(
    int Id,
    string ComponentCode,
    string ComponentName,
    int PlannedQuantity,
    decimal? NetWeight,
    decimal? GrossWeight,
    string? Batch,
    int RequiredQuantity,
    int OkQuantity,
    int DefectQuantity,
    int MismatchQuantity,
    int ShortageQuantity,
    string? DiscrepancyReason)
{
    /// <summary>Сумма отработанного: осмотрено (OK/брак/пересорт) плюс признанная недостача —
    /// физически непоступившее проверить нельзя (раздел 23, В-31, рабочая рекомендация).</summary>
    public int CheckedQuantity => OkQuantity + DefectQuantity + MismatchQuantity + ShortageQuantity;
    public bool IsComplete => CheckedQuantity >= RequiredQuantity;
    public bool HasIssues => DefectQuantity > 0 || MismatchQuantity > 0 || ShortageQuantity > 0;
}

/// <summary>
/// Упаковка/коробка (раздел 20). <see cref="PackageStatuses.Closed"/> — отдельное явное действие
/// (раздел 23, [С]: «закрытие — самостоятельное явное действие, не равное последнему скану
/// артикула»), не выводится автоматически из завершённости строк.
/// </summary>
public sealed record Package(
    int Id,
    string DeliveryId,
    string HuNumber,
    string Status,
    DateTime? ClosedAt,
    string? ClosedBy,
    IReadOnlyList<PackingListRow> Rows)
{
    public bool IsComplete => Rows.Count > 0 && Rows.All(r => r.IsComplete);

    /// <summary>Зелёный vs предупреждающий цвет закрытой коробки (раздел 23, [С]): «проверено»
    /// не равно «без проблем».</summary>
    public bool HasIssues => Rows.Any(r => r.HasIssues);
}

/// <summary>
/// Поставка (раздел 19). <see cref="Status"/> вычисляется, а не хранится отдельным полем:
/// «проверена» ровно тогда, когда закрыты все коробки (раздел 23, [С]) — отдельного действия
/// «закрыть поставку» не требуется, это следствие закрытия последней коробки.
/// </summary>
public sealed record Delivery(
    string Id,
    string SupplierCode,
    string SupplierName,
    string InvoiceNumber,
    DateTime InvoiceDate,
    string? AccompanyingDocument,
    DateTime CreatedAt,
    string CreatedBy,
    IReadOnlyList<Package> Packages)
{
    public string Status => Packages.Count > 0 && Packages.All(p => p.Status == PackageStatuses.Closed)
        ? (Packages.Any(p => p.HasIssues) ? DeliveryStatuses.VerifiedWithIssues : DeliveryStatuses.Verified)
        : DeliveryStatuses.Open;
}

public sealed record CreateDeliveryRequest(string SupplierCode, string InvoiceNumber, string InvoiceDate, string? AccompanyingDocument);
public sealed record AddComponentRequest(string Code, string Name);
public sealed record StagePackingListRequest(IReadOnlyList<PackingListRawRow> Rows);
public sealed record RecordRowResultRequest(string Outcome, int Quantity, string? Reason);
public sealed record IncreaseQuotaRequest(int NewRequiredQuantity, string Comment);
public sealed record ReopenRequest(string Comment);

public enum CreateDeliveryOutcome { Ok, SupplierNotFound, InvalidInvoiceDate }
public enum ConfirmPackingListOutcome { Ok, SessionNotFound, HasErrors }
public enum RowResultOutcome { Ok, NotFound, PackageClosed, InvalidOutcome, InvalidQuantity, ExceedsRequired }
public enum QuotaOutcome { Ok, NotFound, PackageClosed, InvalidQuantity }
public enum PackageActionOutcome { Ok, NotFound, AlreadyClosed, NotComplete, NotClosed }

public interface IIncomingInspectionReader
{
    Task<IReadOnlyList<SupplierRef>> GetSuppliersAsync(CancellationToken ct);
    Task<IReadOnlyList<ComponentItem>> GetComponentsAsync(CancellationToken ct);
    Task<PagedResult<Delivery>> GetDeliveriesAsync(int page, int pageSize, CancellationToken ct);
    Task<Delivery?> GetDeliveryAsync(string id, CancellationToken ct);
    Task<Package?> GetPackageByHuAsync(string deliveryId, string hu, CancellationToken ct);
}

public interface IIncomingInspectionWriter
{
    Task<(CreateDeliveryOutcome Outcome, Delivery? Created)> CreateDeliveryAsync(CreateDeliveryRequest request, string author, CancellationToken ct);

    /// <summary>Добавление неизвестного артикула в справочник (раздел 19, [С]) — своя копия
    /// каталога компонентов, не трогает справочник NCP/станций (Ncp.cs): это разные владельцы
    /// одного и того же демо-перечня, как уже сделано для моделей/цветов импорта плана.</summary>
    Task<bool> AddComponentAsync(AddComponentRequest request, CancellationToken ct);

    Task<PackingListSession?> StagePackingListAsync(string deliveryId, IReadOnlyList<PackingListRawRow> rows, string userName, CancellationToken ct);
    Task<PackingListSession?> GetSessionAsync(string sessionId, CancellationToken ct);
    Task<PackingListSession?> ReplaceRowAsync(string sessionId, int rowNumber, PackingListRawRow updated, string userName, CancellationToken ct);
    Task<(ConfirmPackingListOutcome Outcome, Delivery? Updated)> ConfirmSessionAsync(string sessionId, string userName, CancellationToken ct);

    Task<(RowResultOutcome Outcome, Package? Updated)> RecordRowResultAsync(
        int packageId, int rowId, RecordRowResultRequest request, string userName, CancellationToken ct);

    Task<(QuotaOutcome Outcome, Package? Updated)> IncreaseQuotaAsync(
        int packageId, int rowId, IncreaseQuotaRequest request, string userName, CancellationToken ct);

    Task<(PackageActionOutcome Outcome, Package? Updated)> ClosePackageAsync(int packageId, string userName, CancellationToken ct);

    Task<(PackageActionOutcome Outcome, Package? Updated)> ReopenPackageAsync(int packageId, ReopenRequest request, string userName, CancellationToken ct);
}

public sealed class DemoIncomingInspectionStore : IIncomingInspectionReader, IIncomingInspectionWriter
{
    /// <summary>Типы расхождений — те же слова, что в NCP (раздел 14), для единой терминологии.</summary>
    public static readonly string[] DiscrepancyOutcomes = ["OK", "Брак", "Пересорт", "Недостача"];

    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web) { PropertyNameCaseInsensitive = true };

    private readonly Lazy<List<SupplierRef>> _suppliers;
    private readonly Lazy<List<InspectionQuotaRef>> _quotas;
    private readonly Lazy<List<ComponentItem>> _components;
    private readonly IEventLog _eventLog;

    private readonly Lock _gate = new();
    private readonly List<Delivery> _deliveries = [];
    private readonly Dictionary<string, PackingListSession> _sessions = new();
    private int _nextPackageId = 1;
    private int _nextRowId = 1;

    public DemoIncomingInspectionStore(string suppliersPath, string quotasPath, string componentsPath, IEventLog eventLog)
    {
        _suppliers = new(() => Load<SupplierRef>(suppliersPath));
        _quotas = new(() => Load<InspectionQuotaRef>(quotasPath));
        // Своя (мутируемая) копия каталога компонентов — см. IIncomingInspectionWriter.AddComponentAsync.
        _components = new(() => Load<ComponentItem>(componentsPath));
        _eventLog = eventLog;
    }

    private static List<T> Load<T>(string path)
    {
        using var stream = File.OpenRead(path);
        return JsonSerializer.Deserialize<List<T>>(stream, JsonOptions)
               ?? throw new InvalidOperationException($"Демо-фикстура пуста или нечитаема: {path}");
    }

    public Task<IReadOnlyList<SupplierRef>> GetSuppliersAsync(CancellationToken ct)
        => Task.FromResult<IReadOnlyList<SupplierRef>>(_suppliers.Value);

    public Task<IReadOnlyList<ComponentItem>> GetComponentsAsync(CancellationToken ct)
    {
        lock (_gate)
        {
            return Task.FromResult<IReadOnlyList<ComponentItem>>(_components.Value.ToList());
        }
    }

    public Task<bool> AddComponentAsync(AddComponentRequest request, CancellationToken ct)
    {
        var code = request.Code?.Trim();
        var name = request.Name?.Trim();
        if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(name))
        {
            return Task.FromResult(false);
        }
        lock (_gate)
        {
            if (_components.Value.Any(c => string.Equals(c.Code, code, StringComparison.OrdinalIgnoreCase)))
            {
                return Task.FromResult(false);
            }
            _components.Value.Add(new ComponentItem(code, name, null));
            _eventLog.Record("Component", code, "Add", null, name, "система");
            return Task.FromResult(true);
        }
    }

    public Task<PagedResult<Delivery>> GetDeliveriesAsync(int page, int pageSize, CancellationToken ct)
    {
        lock (_gate)
        {
            var ordered = _deliveries.OrderByDescending(d => d.CreatedAt).ToList();
            var items = ordered.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            return Task.FromResult(new PagedResult<Delivery>(items, page, pageSize, ordered.Count));
        }
    }

    public Task<Delivery?> GetDeliveryAsync(string id, CancellationToken ct)
    {
        lock (_gate)
        {
            return Task.FromResult(_deliveries.FirstOrDefault(d => d.Id == id));
        }
    }

    public Task<Package?> GetPackageByHuAsync(string deliveryId, string hu, CancellationToken ct)
    {
        lock (_gate)
        {
            var delivery = _deliveries.FirstOrDefault(d => d.Id == deliveryId);
            var package = delivery?.Packages.FirstOrDefault(p => string.Equals(p.HuNumber, hu.Trim(), StringComparison.OrdinalIgnoreCase));
            return Task.FromResult(package);
        }
    }

    public Task<(CreateDeliveryOutcome, Delivery?)> CreateDeliveryAsync(CreateDeliveryRequest request, string author, CancellationToken ct)
    {
        var supplier = _suppliers.Value.FirstOrDefault(s => string.Equals(s.Code, request.SupplierCode, StringComparison.OrdinalIgnoreCase));
        if (supplier is null)
        {
            return Task.FromResult<(CreateDeliveryOutcome, Delivery?)>((CreateDeliveryOutcome.SupplierNotFound, null));
        }
        if (!TryParseDate(request.InvoiceDate, out var invoiceDate))
        {
            return Task.FromResult<(CreateDeliveryOutcome, Delivery?)>((CreateDeliveryOutcome.InvalidInvoiceDate, null));
        }

        lock (_gate)
        {
            // ponytail: ID поставки — просто Guid, составной ключ поставщик+инвойс не форсируем
            // (В-25 не согласован; спецификация не запрещает повторяющиеся инвойсы).
            var delivery = new Delivery(
                Guid.NewGuid().ToString("N"), supplier.Code, supplier.Name,
                request.InvoiceNumber.Trim(), invoiceDate, Trim(request.AccompanyingDocument),
                DateTime.Now, author, []);
            _deliveries.Add(delivery);
            _eventLog.Record("Delivery", delivery.Id, "Create", null, $"{supplier.Name} / {delivery.InvoiceNumber}", author);
            return Task.FromResult<(CreateDeliveryOutcome, Delivery?)>((CreateDeliveryOutcome.Ok, delivery));
        }
    }

    public async Task<PackingListSession?> StagePackingListAsync(string deliveryId, IReadOnlyList<PackingListRawRow> rows, string userName, CancellationToken ct)
    {
        if (await GetDeliveryAsync(deliveryId, ct) is null)
        {
            return null;
        }
        var validated = ValidateAll(rows, SnapshotComponents());
        var session = new PackingListSession(Guid.NewGuid().ToString("N"), deliveryId, DateTime.Now, userName, validated);
        lock (_gate)
        {
            _sessions[session.Id] = session;
        }
        _eventLog.Record("PackingList", session.Id, "Stage", null, $"{session.TotalCount} строк, {session.ErrorCount} с ошибками", userName);
        return session;
    }

    public Task<PackingListSession?> GetSessionAsync(string sessionId, CancellationToken ct)
    {
        lock (_gate)
        {
            return Task.FromResult(_sessions.GetValueOrDefault(sessionId));
        }
    }

    public Task<PackingListSession?> ReplaceRowAsync(string sessionId, int rowNumber, PackingListRawRow updated, string userName, CancellationToken ct)
    {
        PackingListSession? existing;
        lock (_gate)
        {
            _sessions.TryGetValue(sessionId, out existing);
        }
        if (existing is null || existing.Rows.All(r => r.RowNumber != rowNumber))
        {
            return Task.FromResult<PackingListSession?>(null);
        }

        var rawRows = existing.Rows.Select(r => r.RowNumber == rowNumber ? updated : r.Row).ToList();
        var validated = ValidateAll(rawRows, SnapshotComponents());
        var session = existing with { Rows = validated };
        lock (_gate)
        {
            _sessions[sessionId] = session;
        }
        _eventLog.Record("PackingList", sessionId, "EditRow", null, $"строка {rowNumber}", userName);
        return Task.FromResult<PackingListSession?>(session);
    }

    public Task<(ConfirmPackingListOutcome, Delivery?)> ConfirmSessionAsync(string sessionId, string userName, CancellationToken ct)
    {
        lock (_gate)
        {
            if (!_sessions.TryGetValue(sessionId, out var session))
            {
                return Task.FromResult<(ConfirmPackingListOutcome, Delivery?)>((ConfirmPackingListOutcome.SessionNotFound, null));
            }
            if (session.ErrorCount > 0)
            {
                return Task.FromResult<(ConfirmPackingListOutcome, Delivery?)>((ConfirmPackingListOutcome.HasErrors, null));
            }

            var deliveryIndex = _deliveries.FindIndex(d => d.Id == session.DeliveryId);
            if (deliveryIndex < 0)
            {
                return Task.FromResult<(ConfirmPackingListOutcome, Delivery?)>((ConfirmPackingListOutcome.SessionNotFound, null));
            }
            var delivery = _deliveries[deliveryIndex];
            var packages = delivery.Packages.ToList();

            foreach (var group in session.Rows.GroupBy(r => r.Row.PackageNumber!.Trim(), StringComparer.OrdinalIgnoreCase))
            {
                var packageIndex = packages.FindIndex(p => string.Equals(p.HuNumber, group.Key, StringComparison.OrdinalIgnoreCase));
                var newRows = group.Select(r => BuildRow(r.Row)).ToList();

                if (packageIndex < 0)
                {
                    packages.Add(new Package(_nextPackageId++, delivery.Id, group.Key, PackageStatuses.Open, null, null, newRows));
                }
                else
                {
                    var existingPackage = packages[packageIndex];
                    packages[packageIndex] = existingPackage with { Rows = existingPackage.Rows.Concat(newRows).ToList() };
                }
            }

            var updated = delivery with { Packages = packages };
            _deliveries[deliveryIndex] = updated;
            _sessions.Remove(sessionId);
            _eventLog.Record("PackingList", sessionId, "Confirm", null, $"{session.TotalCount} строк в поставку {delivery.Id}", userName);
            return Task.FromResult<(ConfirmPackingListOutcome, Delivery?)>((ConfirmPackingListOutcome.Ok, updated));
        }
    }

    public Task<(RowResultOutcome, Package?)> RecordRowResultAsync(int packageId, int rowId, RecordRowResultRequest request, string userName, CancellationToken ct)
    {
        if (!DiscrepancyOutcomes.Contains(request.Outcome, StringComparer.Ordinal))
        {
            return Task.FromResult<(RowResultOutcome, Package?)>((RowResultOutcome.InvalidOutcome, null));
        }
        if (request.Quantity < 1)
        {
            return Task.FromResult<(RowResultOutcome, Package?)>((RowResultOutcome.InvalidQuantity, null));
        }

        return Task.FromResult(MutatePackage(packageId, rowId, (package, row) =>
        {
            if (package.Status == PackageStatuses.Closed)
            {
                return (RowResultOutcome.PackageClosed, null);
            }
            if (row.CheckedQuantity + request.Quantity > row.RequiredQuantity)
            {
                return (RowResultOutcome.ExceedsRequired, null);
            }

            var updated = request.Outcome switch
            {
                "OK" => row with { OkQuantity = row.OkQuantity + request.Quantity },
                "Брак" => row with { DefectQuantity = row.DefectQuantity + request.Quantity, DiscrepancyReason = Trim(request.Reason) ?? row.DiscrepancyReason },
                "Пересорт" => row with { MismatchQuantity = row.MismatchQuantity + request.Quantity, DiscrepancyReason = Trim(request.Reason) ?? row.DiscrepancyReason },
                _ => row with { ShortageQuantity = row.ShortageQuantity + request.Quantity, DiscrepancyReason = Trim(request.Reason) ?? row.DiscrepancyReason },
            };
            _eventLog.Record("PackingListRow", $"{packageId}/{rowId}", "Check", null, $"{request.Outcome} +{request.Quantity}", userName);
            return (RowResultOutcome.Ok, updated);
        }, RowResultOutcome.NotFound));
    }

    public Task<(QuotaOutcome, Package?)> IncreaseQuotaAsync(int packageId, int rowId, IncreaseQuotaRequest request, string userName, CancellationToken ct)
    {
        return Task.FromResult(MutatePackage(packageId, rowId, (package, row) =>
        {
            if (package.Status == PackageStatuses.Closed)
            {
                return (QuotaOutcome.PackageClosed, null);
            }
            if (request.NewRequiredQuantity <= row.RequiredQuantity || request.NewRequiredQuantity > row.PlannedQuantity)
            {
                return (QuotaOutcome.InvalidQuantity, null);
            }

            var updated = row with { RequiredQuantity = request.NewRequiredQuantity };
            _eventLog.Record("PackingListRow", $"{packageId}/{rowId}", "IncreaseQuota",
                row.RequiredQuantity.ToString(), $"{request.NewRequiredQuantity} ({request.Comment.Trim()})", userName);
            return (QuotaOutcome.Ok, updated);
        }, QuotaOutcome.NotFound));
    }

    public Task<(PackageActionOutcome, Package?)> ClosePackageAsync(int packageId, string userName, CancellationToken ct)
    {
        lock (_gate)
        {
            var located = LocatePackage(packageId);
            if (located is not var (deliveryIndex, packageIndex))
            {
                return Task.FromResult<(PackageActionOutcome, Package?)>((PackageActionOutcome.NotFound, null));
            }
            var delivery = _deliveries[deliveryIndex];
            var package = delivery.Packages[packageIndex];
            if (package.Status == PackageStatuses.Closed)
            {
                return Task.FromResult<(PackageActionOutcome, Package?)>((PackageActionOutcome.AlreadyClosed, package));
            }
            if (!package.IsComplete)
            {
                return Task.FromResult<(PackageActionOutcome, Package?)>((PackageActionOutcome.NotComplete, package));
            }

            var updated = package with { Status = PackageStatuses.Closed, ClosedAt = DateTime.Now, ClosedBy = userName };
            ReplacePackage(deliveryIndex, packageIndex, updated);
            _eventLog.Record("Package", $"{delivery.Id}/{package.HuNumber}", "Close", null,
                updated.HasIssues ? "проверено, с замечаниями" : "проверено, без замечаний", userName);
            return Task.FromResult<(PackageActionOutcome, Package?)>((PackageActionOutcome.Ok, updated));
        }
    }

    public Task<(PackageActionOutcome, Package?)> ReopenPackageAsync(int packageId, ReopenRequest request, string userName, CancellationToken ct)
    {
        lock (_gate)
        {
            var located = LocatePackage(packageId);
            if (located is not var (deliveryIndex, packageIndex))
            {
                return Task.FromResult<(PackageActionOutcome, Package?)>((PackageActionOutcome.NotFound, null));
            }
            var delivery = _deliveries[deliveryIndex];
            var package = delivery.Packages[packageIndex];
            if (package.Status == PackageStatuses.Open)
            {
                return Task.FromResult<(PackageActionOutcome, Package?)>((PackageActionOutcome.NotClosed, package));
            }

            var updated = package with { Status = PackageStatuses.Open, ClosedAt = null, ClosedBy = null };
            ReplacePackage(deliveryIndex, packageIndex, updated);
            _eventLog.Record("Package", $"{delivery.Id}/{package.HuNumber}", "Reopen", "Closed", request.Comment.Trim(), userName);
            return Task.FromResult<(PackageActionOutcome, Package?)>((PackageActionOutcome.Ok, updated));
        }
    }

    /// <summary>Общий поиск+замена строки внутри коробки под единой блокировкой — закрытие,
    /// учёт результата и увеличение норматива все адресуются парой (packageId, rowId).</summary>
    private (TOutcome, Package?) MutatePackage<TOutcome>(
        int packageId, int rowId, Func<Package, PackingListRow, (TOutcome, PackingListRow?)> mutate, TOutcome notFound)
    {
        lock (_gate)
        {
            var located = LocatePackage(packageId);
            if (located is not var (deliveryIndex, packageIndex))
            {
                return (notFound, null);
            }
            var delivery = _deliveries[deliveryIndex];
            var package = delivery.Packages[packageIndex];
            var rowIndex = package.Rows.ToList().FindIndex(r => r.Id == rowId);
            if (rowIndex < 0)
            {
                return (notFound, null);
            }

            var (outcome, updatedRow) = mutate(package, package.Rows[rowIndex]);
            if (updatedRow is null)
            {
                return (outcome, null);
            }

            var rows = package.Rows.ToList();
            rows[rowIndex] = updatedRow;
            var updatedPackage = package with { Rows = rows };
            ReplacePackage(deliveryIndex, packageIndex, updatedPackage);
            return (outcome, updatedPackage);
        }
    }

    private (int DeliveryIndex, int PackageIndex)? LocatePackage(int packageId)
    {
        for (var di = 0; di < _deliveries.Count; di++)
        {
            var pi = _deliveries[di].Packages.ToList().FindIndex(p => p.Id == packageId);
            if (pi >= 0) return (di, pi);
        }
        return null;
    }

    private void ReplacePackage(int deliveryIndex, int packageIndex, Package updated)
    {
        var delivery = _deliveries[deliveryIndex];
        var packages = delivery.Packages.ToList();
        packages[packageIndex] = updated;
        _deliveries[deliveryIndex] = delivery with { Packages = packages };
    }

    /// <summary>Снимок изменяемого каталога компонентов (см. <see cref="AddComponentAsync"/>) —
    /// валидация читает его без удержания <see cref="_gate"/> на всё время проверки строк.</summary>
    private List<ComponentItem> SnapshotComponents()
    {
        lock (_gate)
        {
            return _components.Value.ToList();
        }
    }

    private PackingListRow BuildRow(PackingListRawRow raw)
    {
        // Вызывается только из ConfirmSessionAsync, уже под _gate — читать _components.Value
        // напрямую здесь безопасно.
        var article = raw.Article!.Trim();
        var component = _components.Value.First(c => string.Equals(c.Code, article, StringComparison.OrdinalIgnoreCase));
        var plannedQuantity = int.Parse(raw.Quantity!.Trim(), CultureInfo.InvariantCulture);
        var required = ComputeRequiredQuantity(component.Code, plannedQuantity);
        TryParseDecimal(raw.NetWeight, out var netWeight);
        TryParseDecimal(raw.GrossWeight, out var grossWeight);

        return new PackingListRow(
            _nextRowId++, component.Code, component.Name, plannedQuantity,
            netWeight, grossWeight, Trim(raw.Batch),
            required, OkQuantity: 0, DefectQuantity: 0, MismatchQuantity: 0, ShortageQuantity: 0, DiscrepancyReason: null);
    }

    /// <summary>Раздел 22, [С]: при проценте — округление вверх; результат не может требовать
    /// больше, чем реально поступило. Снимок фиксируется один раз, при подтверждении строки.</summary>
    private int ComputeRequiredQuantity(string componentCode, int plannedQuantity)
    {
        var quota = _quotas.Value.FirstOrDefault(q => string.Equals(q.ComponentCode, componentCode, StringComparison.OrdinalIgnoreCase));
        if (quota?.FixedCount is int fixedCount)
        {
            return Math.Clamp(fixedCount, 0, plannedQuantity);
        }
        var percent = quota?.Percent ?? 100;
        var required = (int)Math.Ceiling(plannedQuantity * percent / 100.0);
        return Math.Clamp(required, 0, plannedQuantity);
    }

    private List<PackingListRowResult> ValidateAll(IReadOnlyList<PackingListRawRow> rows, List<ComponentItem> components)
    {
        var results = new List<PackingListRowResult>(rows.Count);
        for (var i = 0; i < rows.Count; i++)
        {
            var errors = ValidateRow(rows[i], components, out var preview);
            results.Add(new PackingListRowResult(i + 1, rows[i], errors, preview));
        }
        return results;
    }

    private List<string> ValidateRow(PackingListRawRow row, List<ComponentItem> components, out int? previewRequired)
    {
        var errors = new List<string>();
        previewRequired = null;

        if (string.IsNullOrWhiteSpace(row.PackageNumber))
        {
            errors.Add("Номер упаковки (HU) не указан");
        }

        var article = row.Article?.Trim();
        ComponentItem? component = null;
        if (string.IsNullOrEmpty(article))
        {
            errors.Add("Артикул не указан");
        }
        else
        {
            component = components.FirstOrDefault(c => string.Equals(c.Code, article, StringComparison.OrdinalIgnoreCase));
            if (component is null)
            {
                errors.Add($"Артикул «{article}» не найден в справочнике — добавьте его в справочник");
            }
        }

        var quantityText = row.Quantity?.Trim();
        int? quantity = null;
        if (string.IsNullOrEmpty(quantityText))
        {
            errors.Add("Количество не указано");
        }
        else if (!int.TryParse(quantityText, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedQuantity) || parsedQuantity < 1)
        {
            errors.Add("Количество должно быть положительным целым числом");
        }
        else
        {
            quantity = parsedQuantity;
        }

        ValidateOptionalDecimal(row.NetWeight, "Вес нетто", errors);
        ValidateOptionalDecimal(row.GrossWeight, "Вес брутто", errors);

        if (component is not null && quantity is not null)
        {
            previewRequired = ComputeRequiredQuantity(component.Code, quantity.Value);
        }

        return errors;
    }

    private static void ValidateOptionalDecimal(string? value, string label, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        if (!TryParseDecimal(value, out _))
        {
            errors.Add($"{label}: не распознано число «{value}»");
        }
    }

    private static bool TryParseDecimal(string? value, out decimal result)
        => decimal.TryParse(value?.Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out result);

    private static bool TryParseDate(string? value, out DateTime result)
        => DateTime.TryParseExact(value?.Trim(), ["yyyy-MM-dd", "dd.MM.yyyy"], CultureInfo.InvariantCulture, DateTimeStyles.None, out result);

    private static string? Trim(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
