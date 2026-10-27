using System.Text.Json;

namespace FormulaD.Mes.Api;

/// <summary>
/// Несоответствие (NCP). Состав полей взят из формы Access `frmNewNCP`
/// (компонент, количество, тип, комментарий) и связи `tblNCP.VIN -> tblProductionPlan.VIN`.
/// Точная схема `dbo.tblNCP` не обследована — поля подлежат сверке на TEST-базе.
/// </summary>
public sealed record NcpItem(
    int Id,
    string Number,
    string Vin,
    string ComponentCode,
    string ComponentName,
    int Quantity,
    string Type,
    string? Comment,
    string Status,
    DateTime CreatedAt,
    string CreatedBy,
    DateTime? ClosedAt);

public sealed record ComponentItem(string Code, string Name);

public sealed record NcpQuery(string? Vin, string? Status, int Page, int PageSize);

/// <summary>Заявка на регистрацию несоответствия. Только для демо-источника.</summary>
public sealed record CreateNcpRequest(string Vin, string ComponentCode, int Quantity, string Type, string? Comment);

public enum CreateNcpOutcome { Ok, VinNotFound, ComponentNotFound, InvalidQuantity, InvalidType }

public interface INcpReader
{
    Task<PagedResult<NcpItem>> GetPageAsync(NcpQuery query, CancellationToken ct);
    Task<IReadOnlyList<string>> GetTypesAsync(CancellationToken ct);
    Task<IReadOnlyList<ComponentItem>> GetComponentsAsync(CancellationToken ct);
}

/// <summary>Регистрация несоответствия. Реализовано только для демо-источника.</summary>
public interface INcpWriter
{
    Task<(CreateNcpOutcome Outcome, NcpItem? Created)> CreateAsync(CreateNcpRequest request, string author, CancellationToken ct);
}

public sealed class DemoNcpStore : INcpReader, INcpWriter
{
    /// <summary>Типы несоответствий. В реальной базе это справочник — сверить на TEST.</summary>
    public static readonly string[] Types =
        ["Повреждение", "Некомплект", "Отклонение размера", "Несоответствие документации", "Прочее"];

    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web) { PropertyNameCaseInsensitive = true };

    private readonly Lock _gate = new();
    private readonly Lazy<List<NcpItem>> _items;
    private readonly Lazy<List<ComponentItem>> _components;
    private readonly IProductionPlanReader _plan;

    public DemoNcpStore(string ncpPath, string componentsPath, IProductionPlanReader plan)
    {
        _items = new(() => Load<NcpItem>(ncpPath));
        _components = new(() => Load<ComponentItem>(componentsPath));
        _plan = plan;
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

    public Task<IReadOnlyList<ComponentItem>> GetComponentsAsync(CancellationToken ct)
        => Task.FromResult<IReadOnlyList<ComponentItem>>(_components.Value);

    public async Task<(CreateNcpOutcome, NcpItem?)> CreateAsync(CreateNcpRequest request, string author, CancellationToken ct)
    {
        // Несоответствие регистрируется только на существующее изделие: в базе это FK на VIN.
        if (await _plan.GetByVinAsync(request.Vin, ct) is null)
        {
            return (CreateNcpOutcome.VinNotFound, null);
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
                ComponentCode: component.Code,
                ComponentName: component.Name,
                Quantity: request.Quantity,
                Type: request.Type,
                Comment: string.IsNullOrWhiteSpace(request.Comment) ? null : request.Comment.Trim(),
                Status: "Открыто",
                CreatedAt: DateTime.Now,
                CreatedBy: author,
                ClosedAt: null);

            _items.Value.Add(created);
            return (CreateNcpOutcome.Ok, created);
        }
    }
}
