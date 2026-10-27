namespace FormulaD.Mes.Api;

/// <summary>
/// Переходы изделия между статусами 0..4 (раздел 5, 9, 10, 13, 18 спецификации). Реализовано
/// ТОЛЬКО для демо-источника — запись в производственную базу требует отдельного разрешения
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

    /// <summary>
    /// Завершение сборки: 1 → 2. Допустим только из статуса 1 (раздел 13, [С]).
    /// Намеренно НЕ проверяет открытые NCP: автоматическая блокировка завершения по
    /// непрохождению ОТК не согласована спецификацией ([П], раздел 13) — изделие может
    /// завершиться с проблемой и уйти в Rework на следующем шаге. Блокировка стоит только
    /// на FOK (<see cref="FokAsync"/>), не здесь.
    /// </summary>
    Task<(TransitionOutcome Outcome, ProductionPlanItem? Item)> CompleteAsync(string vin, string userName, CancellationToken ct);

    /// <summary>
    /// Final OK: 2 → 3. Допустим только из статуса 2 (раздел 18, [С]). Проверка «нет ли
    /// незакрытой обязательной детали» — не здесь, а на уровне эндпоинта (раздел 16):
    /// этот метод ничего не знает про NCP, чтобы не завязывать производственный план на
    /// модуль несоответствий напрямую.
    /// </summary>
    Task<(TransitionOutcome Outcome, ProductionPlanItem? Item)> FokAsync(string vin, string userName, CancellationToken ct);

    /// <summary>
    /// Отправка в Rework: 2 → 4. Допустим только из статуса 2 (раздел 17, [С]). Строится
    /// ТОЛЬКО этот переход — прямой 1 → 4 (снять с линии незавершённым) не реализован,
    /// пока не согласован (В-07, docs/SPECIFICATION.md, раздел 10). Какое именно действие
    /// его вызывает, не согласовано (В-19) — по умолчанию это кнопка на экране FOK, когда
    /// изделие заблокировано незакрытой обязательной деталью (docs/DEVELOPMENT_PLAN.md, Этап 6).
    /// </summary>
    Task<(TransitionOutcome Outcome, ProductionPlanItem? Item)> SendToReworkAsync(string vin, string userName, CancellationToken ct);

    /// <summary>
    /// Завершение Rework: 4 → 2. Допустим только из статуса 4 (раздел 17, [С]). Как и у FOK,
    /// проверка незакрытой обязательной детали — на уровне эндпоинта, не здесь (раздел 277,
    /// [П]: переход должен повторно проверить отсутствие необходимых, но не установленных
    /// комплектующих).
    /// </summary>
    Task<(TransitionOutcome Outcome, ProductionPlanItem? Item)> FinishReworkAsync(string vin, string userName, CancellationToken ct);
}

public enum TransitionOutcome { Ok, VinNotFound, WrongStatus }
