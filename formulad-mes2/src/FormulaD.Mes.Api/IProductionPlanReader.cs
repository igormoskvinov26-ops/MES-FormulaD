namespace FormulaD.Mes.Api;

public interface IProductionPlanReader
{
    Task<PagedResult<ProductionPlanItem>> GetPageAsync(ProductionPlanQuery query, CancellationToken ct);
    Task<ProductionPlanItem?> GetByVinAsync(string vin, CancellationToken ct);
    /// <summary>Статусы как есть из источника. NULL-статус представлен как null-элемент.</summary>
    Task<IReadOnlyList<string?>> GetStatusesAsync(CancellationToken ct);
}
