namespace FormulaD.Mes.Api;

/// <summary>
/// Переходы изделия между статусами 0..4 (раздел 5, 9, 10 спецификации). Реализовано ТОЛЬКО
/// для демо-источника — запись в производственную базу требует отдельного разрешения
/// (docs/CODEX_START.md, п.0).
/// </summary>
public interface IPlanTransitions
{
    /// <summary>
    /// Запуск в производство: 0 → 1. Допустим только из статуса 0 (раздел 10, [С]).
    /// Повторный запуск уже начатого изделия не перезапускает его и не сбрасывает
    /// прежние события — возвращает <see cref="TransitionOutcome.WrongStatus"/>.
    /// </summary>
    Task<(TransitionOutcome Outcome, ProductionPlanItem? Item)> StartAsync(string vin, string userName, CancellationToken ct);
}

public enum TransitionOutcome { Ok, VinNotFound, WrongStatus }
