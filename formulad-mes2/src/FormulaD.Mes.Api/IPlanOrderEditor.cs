namespace FormulaD.Mes.Api;

public enum MoveOutcome
{
    Ok,
    VinNotFound,
    /// <summary>У изделия нет позиции в плане (SEQN IS NULL) — двигать нечего.</summary>
    NoPosition,
    /// <summary>Запрошенной позиции в плане нет.</summary>
    PositionNotFound,
}

/// <summary>
/// Изменение порядка запуска. Реализовано ТОЛЬКО для демо-источника.
/// Для SQL такой реализации нет и в MVP быть не должно: запись в производственную
/// базу требует отдельного разрешения, ролей, транзакций и журнала
/// (проект операции — docs/REORDER_DESIGN.md).
/// </summary>
public interface IPlanOrderEditor
{
    Task<MoveOutcome> MoveAsync(string vin, int toPosition, CancellationToken ct);
}
