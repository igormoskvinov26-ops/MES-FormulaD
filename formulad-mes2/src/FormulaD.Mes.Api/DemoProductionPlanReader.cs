using System.Text.Json;

namespace FormulaD.Mes.Api;

/// <summary>Читает синтетические записи из fixtures/production-plan.demo.json. Никакого SQL.</summary>
public sealed class DemoProductionPlanReader : IProductionPlanReader
{
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web) { PropertyNameCaseInsensitive = true };

    private readonly Lazy<List<ProductionPlanItem>> _items;

    public DemoProductionPlanReader(string fixturePath)
        => _items = new(() => Load(fixturePath));

    private static List<ProductionPlanItem> Load(string path)
    {
        using var stream = File.OpenRead(path);
        return JsonSerializer.Deserialize<List<ProductionPlanItem>>(stream, JsonOptions)
               ?? throw new InvalidOperationException("Демо-фикстура пуста или нечитаема.");
    }

    public Task<PagedResult<ProductionPlanItem>> GetPageAsync(ProductionPlanQuery query, CancellationToken ct)
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

        var ordered = q.OrderBy(i => i.Vin, StringComparer.Ordinal).ToList();
        var page = ordered.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToList();
        return Task.FromResult(new PagedResult<ProductionPlanItem>(page, query.Page, query.PageSize, ordered.Count));
    }

    public Task<ProductionPlanItem?> GetByVinAsync(string vin, CancellationToken ct)
        => Task.FromResult(_items.Value.FirstOrDefault(i => string.Equals(i.Vin, vin, StringComparison.OrdinalIgnoreCase)));

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
