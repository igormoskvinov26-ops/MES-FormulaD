using System.Text.Json;

namespace FormulaD.Mes.Api;

/// <summary>
/// Несоответствие (NCP). Состав полей — форма Access `frmNewNCP` (компонент, количество,
/// тип, комментарий) и связь `tblNCP.VIN -> tblProductionPlan.VIN`, плюс поля из раздела 14
/// спецификации (docs/SPECIFICATION.md): станция, раздельные комментарии оператора и
/// инженера, признак установки корректной детали. Точная схема `dbo.tblNCP` не обследована —
/// поля подлежат сверке на TEST-базе.
/// </summary>
public sealed record NcpItem(
    int Id,
    string Number,
    string Vin,
    string Station,
    string ComponentCode,
    string ComponentName,
    int Quantity,
    string Type,
    string? OperatorComment,
    string? EngineerComment,
    string Status,
    /// <summary>
    /// Установлена ли корректная деталь. Намеренно ОТДЕЛЬНО от <see cref="Status"/>:
    /// раздел 16 спецификации прямо требует не путать «заявка закрыта» с «деталь физически
    /// стоит». Именно это поле, а не статус, блокирует допуск к FOK (Этап 4 плана).
    /// </summary>
    bool PartInstalled,
    DateTime CreatedAt,
    string CreatedBy,
    DateTime? ClosedAt,
    string? ClosedBy);

/// <summary>Компонент из справочника. Станция — то же поле, что в AS-IS «Компоненты»/«Соединения».</summary>
public sealed record ComponentItem(string Code, string Name, string? Station);

public sealed record NcpQuery(string? Vin, string? Status, int Page, int PageSize);

/// <summary>Заявка на регистрацию несоответствия. Только для демо-источника.</summary>
public sealed record CreateNcpRequest(string Vin, string Station, string ComponentCode, int Quantity, string Type, string? OperatorComment);

public sealed record SetPartInstalledRequest(bool Installed);
public sealed record CloseNcpRequest(string? EngineerComment);

public enum CreateNcpOutcome { Ok, VinNotFound, ComponentNotFound, InvalidStation, InvalidQuantity, InvalidType }
public enum NcpActionOutcome { Ok, NotFound, AlreadyClosed }

public interface INcpReader
{
    Task<PagedResult<NcpItem>> GetPageAsync(NcpQuery query, CancellationToken ct);
    Task<IReadOnlyList<string>> GetTypesAsync(CancellationToken ct);
    Task<IReadOnlyList<ComponentItem>> GetComponentsAsync(CancellationToken ct);
    Task<IReadOnlyList<string>> GetStationsAsync(CancellationToken ct);

    /// <summary>
    /// Заявки, у которых обязательная деталь не установлена — раздел 16 спецификации:
    /// именно это, а не статус заявки, блокирует допуск к FOK. Признак основан на факте
    /// установки ([П], раздел 16: «не только на наличии записей NCP»), поэтому закрытая без
    /// замены заявка тоже блокирует.
    /// </summary>
    Task<IReadOnlyList<NcpItem>> GetMissingRequiredPartsAsync(string vin, CancellationToken ct);
}

/// <summary>Запись несоответствий. Реализовано только для демо-источника.</summary>
public interface INcpWriter
{
    Task<(CreateNcpOutcome Outcome, NcpItem? Created)> CreateAsync(CreateNcpRequest request, string author, CancellationToken ct);

    /// <summary>
    /// Физический факт: деталь установлена/заменена или нет. Отдельное действие от закрытия
    /// заявки — можно отметить установку, не закрывая NCP, и наоборот (раздел 16).
    /// </summary>
    Task<(NcpActionOutcome Outcome, NcpItem? Updated)> SetPartInstalledAsync(int id, bool installed, string author, CancellationToken ct);

    /// <summary>Закрывает заявку как документ. Не требует, чтобы деталь была установлена —
    /// это раздельные состояния (можно закрыть «пересорт», отмеченный как информационный,
    /// без признака доустановки).</summary>
    Task<(NcpActionOutcome Outcome, NcpItem? Closed)> CloseAsync(int id, string author, CloseNcpRequest request, CancellationToken ct);
}

public sealed class DemoNcpStore : INcpReader, INcpWriter
{
    /// <summary>Типы несоответствий: брак/пересорт/недостача (раздел 14) + прочее. Справочник — сверить на TEST.</summary>
    public static readonly string[] Types = ["Брак", "Пересорт", "Недостача", "Прочее"];

    /// <summary>
    /// Станции — простой список номеров для демо. Отдельного справочника станций в данных
    /// пока нет (docs/PRINTED_CARDS.md): номер станции встречается только как атрибут
    /// справочников «Компоненты»/«Соединения»; при переходе на SQL список сверить.
    /// </summary>
    public static readonly string[] Stations = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];

    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web) { PropertyNameCaseInsensitive = true };

    private readonly Lock _gate = new();
    private readonly Lazy<List<NcpItem>> _items;
    private readonly Lazy<List<ComponentItem>> _components;
    private readonly IProductionPlanReader _plan;
    private readonly IEventLog _eventLog;

    public DemoNcpStore(string ncpPath, string componentsPath, IProductionPlanReader plan, IEventLog eventLog)
    {
        _items = new(() => Load<NcpItem>(ncpPath));
        _components = new(() => Load<ComponentItem>(componentsPath));
        _plan = plan;
        _eventLog = eventLog;
    }

    private static List<T> Load<T>(string path)
    {
        using var stream = File.OpenRead(path);
        return JsonSerializer.Deserialize<List<T>>(stream, JsonOptions)
               ?? throw new InvalidOperationException($"Демо-фикстура пуста или нечитаема: {path}");
    }

    public Task<PagedResult<NcpItem>> GetPageAsync(NcpQuery query, CancellationToken ct)
    {
        lock (_gate)
        {
            IEnumerable<NcpItem> q = _items.Value;

            if (!string.IsNullOrWhiteSpace(query.Vin))
            {
                var needle = query.Vin.Trim();
                q = VinSearch.IsSuffixSearch(needle)
                    ? q.Where(i => i.Vin.EndsWith(needle, StringComparison.OrdinalIgnoreCase))
                    : q.Where(i => i.Vin.StartsWith(needle, StringComparison.OrdinalIgnoreCase));
            }

            if (!string.IsNullOrEmpty(query.Status))
            {
                q = q.Where(i => string.Equals(i.Status, query.Status, StringComparison.Ordinal));
            }

            // Новые несоответствия сверху: оператор смотрит, что случилось только что.
            var ordered = q.OrderByDescending(i => i.CreatedAt).ThenByDescending(i => i.Id).ToList();
            var page = ordered.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToList();
            return Task.FromResult(new PagedResult<NcpItem>(page, query.Page, query.PageSize, ordered.Count));
        }
    }

    public Task<IReadOnlyList<string>> GetTypesAsync(CancellationToken ct)
        => Task.FromResult<IReadOnlyList<string>>(Types);

    public Task<IReadOnlyList<string>> GetStationsAsync(CancellationToken ct)
        => Task.FromResult<IReadOnlyList<string>>(Stations);

    public Task<IReadOnlyList<ComponentItem>> GetComponentsAsync(CancellationToken ct)
        => Task.FromResult<IReadOnlyList<ComponentItem>>(_components.Value);

    public Task<IReadOnlyList<NcpItem>> GetMissingRequiredPartsAsync(string vin, CancellationToken ct)
    {
        lock (_gate)
        {
            IReadOnlyList<NcpItem> blocking = _items.Value
                .Where(i => string.Equals(i.Vin, vin, StringComparison.OrdinalIgnoreCase) && !i.PartInstalled)
                .ToList();
            return Task.FromResult(blocking);
        }
    }

    public async Task<(CreateNcpOutcome, NcpItem?)> CreateAsync(CreateNcpRequest request, string author, CancellationToken ct)
    {
        // Несоответствие регистрируется только на существующее изделие: в базе это FK на VIN.
        if (await _plan.GetByVinAsync(request.Vin, ct) is null)
        {
            return (CreateNcpOutcome.VinNotFound, null);
        }
        if (!Stations.Contains(request.Station, StringComparer.Ordinal))
        {
            return (CreateNcpOutcome.InvalidStation, null);
        }

        lock (_gate)
        {
            var component = _components.Value
                .FirstOrDefault(c => string.Equals(c.Code, request.ComponentCode, StringComparison.OrdinalIgnoreCase));
            if (component is null)
            {
                return (CreateNcpOutcome.ComponentNotFound, null);
            }
            if (request.Quantity is < 1 or > 9999)
            {
                return (CreateNcpOutcome.InvalidQuantity, null);
            }
            if (!Types.Contains(request.Type, StringComparer.Ordinal))
            {
                return (CreateNcpOutcome.InvalidType, null);
            }

            var id = _items.Value.Count == 0 ? 1 : _items.Value.Max(i => i.Id) + 1;
            var created = new NcpItem(
                Id: id,
                Number: $"NC-{DateTime.Now:yyyy}-{id:D4}",
                Vin: request.Vin,
                Station: request.Station,
                ComponentCode: component.Code,
                ComponentName: component.Name,
                Quantity: request.Quantity,
                Type: request.Type,
                OperatorComment: Trim(request.OperatorComment),
                EngineerComment: null,
                Status: "Открыто",
                PartInstalled: false,
                CreatedAt: DateTime.Now,
                CreatedBy: author,
                ClosedAt: null,
                ClosedBy: null);

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
            if (index < 0)
            {
                return Task.FromResult<(NcpActionOutcome, NcpItem?)>((NcpActionOutcome.NotFound, null));
            }

            var current = _items.Value[index];
            if (current.PartInstalled == installed)
            {
                return Task.FromResult<(NcpActionOutcome, NcpItem?)>((NcpActionOutcome.Ok, current));
            }

            var updated = current with { PartInstalled = installed };
            _items.Value[index] = updated;
            _eventLog.Record("Ncp", updated.Number, "PartInstalled",
                current.PartInstalled.ToString(), installed.ToString(), author);
            return Task.FromResult<(NcpActionOutcome, NcpItem?)>((NcpActionOutcome.Ok, updated));
        }
    }

    public Task<(NcpActionOutcome, NcpItem?)> CloseAsync(int id, string author, CloseNcpRequest request, CancellationToken ct)
    {
        lock (_gate)
        {
            var index = _items.Value.FindIndex(i => i.Id == id);
            if (index < 0)
            {
                return Task.FromResult<(NcpActionOutcome, NcpItem?)>((NcpActionOutcome.NotFound, null));
            }

            var current = _items.Value[index];
            if (current.Status == "Закрыто")
            {
                return Task.FromResult<(NcpActionOutcome, NcpItem?)>((NcpActionOutcome.AlreadyClosed, current));
            }

            var engineerComment = Trim(request.EngineerComment) ?? current.EngineerComment;
            var updated = current with
            {
                Status = "Закрыто",
                EngineerComment = engineerComment,
                ClosedAt = DateTime.Now,
                ClosedBy = author,
            };
            _items.Value[index] = updated;
            _eventLog.Record("Ncp", updated.Number, "Close", current.Status, "Закрыто", author);
            return Task.FromResult<(NcpActionOutcome, NcpItem?)>((NcpActionOutcome.Ok, updated));
        }
    }

    private static string? Trim(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
