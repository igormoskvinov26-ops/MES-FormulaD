namespace FormulaD.Mes.Api;

/// <summary>Изделие производственного плана. Read-only проекция dbo.tblProductionPlan.</summary>
public sealed record ProductionPlanItem(
    string Vin,
    int Id,
    /// <summary>SEQN — порядок в плане сборки.</summary>
    int? Seqn,
    string? ModelArticle,
    string? ModelName,
    string? EngineNumber,
    string? Color,
    /// <summary>SpecificationName — комплектация.</summary>
    string? SpecificationName,
    string? Status,
    int? StatusId,
    DateTime? PrintDate,
    DateTime? PlannedStartDate,
    DateTime? PlannedCompleteDate,
    // ponytail: DateTime без зоны — SQL datetime не имеет зоны, конвертацию в UTC не делаем (см. API_CONTRACT.md)
    DateTime? PlannedShipmentDate,
    DateTime? StartDate,
    DateTime? CompleteDate,
    DateTime? FokDate);

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);

/// <summary>
/// <paramref name="StatusId"/> — числовой статус 0..4 из раздела 5 спецификации
/// (docs/SPECIFICATION.md), отдельно от строкового <paramref name="Status"/> из реальной
/// базы: их не путать, они фильтруют по разным колонкам (statusid и Status).
/// </summary>
public sealed record ProductionPlanQuery(string? Vin, string? Status, int? StatusId, int Page, int PageSize);

/// <summary>
/// Пользователь из dbo.tblUser. Пароля нет: прод опознаёт по доменной учётке Windows,
/// а таблица отвечает только за «пускать ли» (IsActive) и «что можно» (UserRole).
/// </summary>
public sealed record MesUser(int Id, string Login, string? FullName, string? Role);

public sealed record LoginRequest(string Login);

/// <summary>Запрос на перемещение изделия в плане. Только для демо-источника.</summary>
public sealed record MoveRequest(int ToPosition);

/// <summary>Запрос отметки/снятия проверки компонента на станции (Этап 5). Только для демо-источника.</summary>
public sealed record SetCheckRequest(bool Checked);
