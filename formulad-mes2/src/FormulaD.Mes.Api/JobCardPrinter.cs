namespace FormulaD.Mes.Api;

/// <summary>
/// Печать JobCard (раздел 8 спецификации). Отмечает факт печати — <see cref="ProductionPlanItem.PrintDate"/>
/// уже существует в модели (реальное поле AS-IS), печать его и обновляет. Не меняет статус и не создаёт
/// новое изделие (раздел 149, [П]: «повторная печать не должна создавать новое изделие или новый VIN») —
/// поэтому это отдельная операция, а не вариант <see cref="IPlanTransitions"/>. Реализовано ТОЛЬКО для
/// демо-источника, как и остальные операции записи.
/// </summary>
public interface IJobCardPrinter
{
    Task<ProductionPlanItem?> MarkPrintedAsync(string vin, string userName, CancellationToken ct);
}
