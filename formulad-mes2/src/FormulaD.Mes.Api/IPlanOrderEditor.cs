namespace FormulaD.Mes.Api;

public enum MoveOutcome
{
    Ok,
    VinNotFound,
    /// <summary>У изделия нет позиции в плане (SEQN IS NULL) — двигать нечего.</summary>
    NoPosition,
    /// <summary>Запрошенной позиции в плане нет.</summary>
    PositionNotFound,
    /// <summary>Изделие уже запущено (statusId > 0) — перестановка запрещена (T-052).</summary>
    StatusRestricted,
}

public interface IPlanOrderEditor
{
    Task<MoveOutcome> MoveAsync(string vin, int toPosition, string userName, CancellationToken ct);
}
