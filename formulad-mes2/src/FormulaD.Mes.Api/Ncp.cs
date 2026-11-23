using System.Text.Json;

namespace FormulaD.Mes.Api;

public sealed record NcpItem(int Id, string Number, string Vin, string Station, string ComponentCode, string ComponentName, int Quantity, string Type, string? OperatorComment, string? EngineerComment, string Status, bool PartInstalled, DateTime CreatedAt, string CreatedBy, DateTime? ClosedAt, string? ClosedBy, string? ModelArticle = null, string? ModelName = null, string? Color = null);
public sealed record ComponentItem(string Code, string Name, string? Station, string[]? ModelIds = null);
public sealed record UpdateComponentRequest(string? Station, string[]? ModelIds);
public sealed record NcpQuery(string? Vin, string? Status, string? Type, string? Station, int Page, int PageSize);
public sealed record CreateNcpRequest(string Vin, string Station, string ComponentCode, int Quantity, string Type, string? OperatorComment);
public sealed record SetPartInstalledRequest(bool Installed);
public sealed record CloseNcpRequest(string? EngineerComment);
public enum CreateNcpOutcome { Ok, VinNotFound, ComponentNotFound, InvalidStation, InvalidQuantity, InvalidType }
public enum NcpActionOutcome { Ok, NotFound, AlreadyClosed }
public sealed record StationCount(string Station, int Count);
public sealed record TypeCount(string Type, int Count);

public interface INcpReader
{
    Task<PagedResult<NcpItem>> GetPageAsync(NcpQuery query, CancellationToken ct);
    Task<IReadOnlyList<string>> GetTypesAsync(CancellationToken ct);
    Task<IReadOnlyList<ComponentItem>> GetComponentsAsync(CancellationToken ct);
    Task<IReadOnlyList<string>> GetStationsAsync(CancellationToken ct);
    Task<IReadOnlyList<StationCount>> GetStationCountsAsync(DateTime from, DateTime to, CancellationToken ct);
    Task<IReadOnlyList<TypeCount>> GetTypeCountsAsync(DateTime from, DateTime to, CancellationToken ct);
    Task<IReadOnlyList<NcpItem>> GetMissingRequiredPartsAsync(string vin, CancellationToken ct);
}

public interface INcpWriter
{
    Task<(CreateNcpOutcome Outcome, NcpItem? Created)> CreateAsync(CreateNcpRequest request, string author, CancellationToken ct);
    Task<(NcpActionOutcome Outcome, NcpItem? Updated)> SetPartInstalledAsync(int id, bool installed, string author, CancellationToken ct);
    Task<(NcpActionOutcome Outcome, NcpItem? Closed)> CloseAsync(int id, string author, CloseNcpRequest request, CancellationToken ct);
    Task UpdateComponentAsync(string code, UpdateComponentRequest request, CancellationToken ct);
}

public sealed class DemoNcpStore : INcpReader, INcpWriter
{
    public static readonly string[] Types = ["Брак", "Пересорт", "Недостача", "Прочее"];
    public static readonly string[] Stations = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { PropertyNameCaseInsensitive = true };
    private readonly Lock _gate = new();
    private readonly Lazy<List<NcpItem>> _items;
    private readonly Lazy<List<ComponentItem>> _components;
    private readonly IProductionPlanReader _plan;
    private readonly IEventLog _eventLog;

    public DemoNcpStore(string ncpPath, string componentsPath, IProductionPlanReader plan, IEventLog eventLog)
    { _items = new(() => Load<NcpItem>(ncpPath)); _components = new(() => Load<ComponentItem>(componentsPath)); _plan = plan; _eventLog = eventLog; }

    private static List<T> Load<T>(string path)
    { using var stream = File.OpenRead(path); return JsonSerializer.Deserialize<List<T>>(stream, JsonOptions) ?? throw new InvalidOperationException($"Демо-фикстура пуста или нечитаема: {path}"); }

    public Task<PagedResult<NcpItem>> GetPageAsync(NcpQuery query, CancellationToken ct)
    {
        lock (_gate)
        {
            IEnumerable<NcpItem> q = _items.Value;
            if (!string.IsNullOrWhiteSpace(query.Vin)) { var n = query.Vin.Trim(); q = VinSearch.IsSuffixSearch(n) ? q.Where(i => i.Vin.EndsWith(n, StringComparison.OrdinalIgnoreCase)) : q.Where(i => i.Vin.StartsWith(n, StringComparison.OrdinalIgnoreCase)); }
            if (!string.IsNullOrEmpty(query.Status)) q = q.Where(i => string.Equals(i.Status, query.Status, StringComparison.Ordinal));
            if (!string.IsNullOrEmpty(query.Type)) q = q.Where(i => string.Equals(i.Type, query.Type, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrEmpty(query.Station)) q = q.Where(i => string.Equals(i.Station, query.Station, StringComparison.OrdinalIgnoreCase));
            var ordered = q.OrderByDescending(i => i.CreatedAt).ThenByDescending(i => i.Id).ToList();
            var page = ordered.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToList();
            return Task.FromResult(new PagedResult<NcpItem>(page, query.Page, query.PageSize, ordered.Count));
        }
    }

    public Task<IReadOnlyList<string>> GetTypesAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<string>>(Types);
    public Task<IReadOnlyList<string>> GetStationsAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<string>>(Stations);
    public Task<IReadOnlyList<ComponentItem>> GetComponentsAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<ComponentItem>>(_components.Value);

    public Task<IReadOnlyList<StationCount>> GetStationCountsAsync(DateTime from, DateTime to, CancellationToken ct)
    { lock (_gate) { var r = _items.Value.Where(i => i.CreatedAt >= from && i.CreatedAt < to && !string.IsNullOrEmpty(i.Station)).GroupBy(i => i.Station).Select(g => new StationCount(g.Key, g.Count())).OrderByDescending(s => s.Count).ToList(); return Task.FromResult<IReadOnlyList<StationCount>>(r); } }

    public Task<IReadOnlyList<TypeCount>> GetTypeCountsAsync(DateTime from, DateTime to, CancellationToken ct)
    { lock (_gate) { var r = _items.Value.Where(i => i.CreatedAt >= from && i.CreatedAt < to && !string.IsNullOrEmpty(i.Type)).GroupBy(i => i.Type).Select(g => new TypeCount(g.Key, g.Count())).OrderByDescending(t => t.Count).ToList(); return Task.FromResult<IReadOnlyList<TypeCount>>(r); } }

    public Task<IReadOnlyList<NcpItem>> GetMissingRequiredPartsAsync(string vin, CancellationToken ct)
    { lock (_gate) { IReadOnlyList<NcpItem> r = _items.Value.Where(i => string.Equals(i.Vin, vin, StringComparison.OrdinalIgnoreCase) && !i.PartInstalled).ToList(); return Task.FromResult(r); } }

    public async Task<(CreateNcpOutcome, NcpItem?)> CreateAsync(CreateNcpRequest request, string author, CancellationToken ct)
    {
        if (await _plan.GetByVinAsync(request.Vin, ct) is null) return (CreateNcpOutcome.VinNotFound, null);
        if (!Stations.Contains(request.Station, StringComparer.Ordinal)) return (CreateNcpOutcome.InvalidStation, null);
        lock (_gate)
        {
            var component = _components.Value.FirstOrDefault(c => string.Equals(c.Code, request.ComponentCode, StringComparison.OrdinalIgnoreCase));
            if (component is null) return (CreateNcpOutcome.ComponentNotFound, null);
            if (request.Quantity is < 1 or > 9999) return (CreateNcpOutcome.InvalidQuantity, null);
            if (!Types.Contains(request.Type, StringComparer.Ordinal)) return (CreateNcpOutcome.InvalidType, null);
            var id = _items.Value.Count == 0 ? 1 : _items.Value.Max(i => i.Id) + 1;
            var created = new NcpItem(id, $"NC-{DateTime.Now:yyyy}-{id:D4}", request.Vin, request.Station, component.Code, component.Name,
                request.Quantity, request.Type, Trim(request.OperatorComment), null, "Открыто", false, DateTime.Now, author, null, null);
            _items.Value.Add(created);
            _eventLog.Record("Ncp", created.Number, "Create", null, request.Type, author);
            return (CreateNcpOutcome.Ok, created);
        }
    }

    public Task<(NcpActionOutcome, NcpItem?)> SetPartInstalledAsync(int id, bool installed, string author, CancellationToken ct)
    {
        lock (_gate)
        {
            var index = _items.Value.FindIndex(i => i.Id == id);
            if (index < 0) return Task.FromResult<(NcpActionOutcome, NcpItem?)>((NcpActionOutcome.NotFound, null));
            var current = _items.Value[index];
            if (current.PartInstalled == installed) return Task.FromResult<(NcpActionOutcome, NcpItem?)>((NcpActionOutcome.Ok, current));
            var updated = current with { PartInstalled = installed };
            _items.Value[index] = updated;
            _eventLog.Record("Ncp", updated.Number, "PartInstalled", current.PartInstalled.ToString(), installed.ToString(), author);
            return Task.FromResult<(NcpActionOutcome, NcpItem?)>((NcpActionOutcome.Ok, updated));
        }
    }

    public Task<(NcpActionOutcome, NcpItem?)> CloseAsync(int id, string author, CloseNcpRequest request, CancellationToken ct)
    {
        lock (_gate)
        {
            var index = _items.Value.FindIndex(i => i.Id == id);
            if (index < 0) return Task.FromResult<(NcpActionOutcome, NcpItem?)>((NcpActionOutcome.NotFound, null));
            var current = _items.Value[index];
            if (current.Status == "Закрыто") return Task.FromResult<(NcpActionOutcome, NcpItem?)>((NcpActionOutcome.AlreadyClosed, current));
            var updated = current with { Status = "Закрыто", EngineerComment = Trim(request.EngineerComment) ?? current.EngineerComment, ClosedAt = DateTime.Now, ClosedBy = author };
            _items.Value[index] = updated;
            _eventLog.Record("Ncp", updated.Number, "Close", current.Status, "Закрыто", author);
            return Task.FromResult<(NcpActionOutcome, NcpItem?)>((NcpActionOutcome.Ok, updated));
        }
    }

    public Task UpdateComponentAsync(string code, UpdateComponentRequest request, CancellationToken ct)
    {
        lock (_gate)
        {
            var index = _components.Value.FindIndex(c => string.Equals(c.Code, code, StringComparison.OrdinalIgnoreCase));
            if (index >= 0) _components.Value[index] = _components.Value[index] with { Station = request.Station, ModelIds = request.ModelIds?.Length > 0 ? request.ModelIds : null };
        }
        return Task.CompletedTask;
    }

    private static string? Trim(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
