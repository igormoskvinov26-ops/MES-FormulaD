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

public sealed record ProductionPlanQuery(string? Vin, string? Status, int Page, int PageSize);

public sealed record DevAuthLoginRequest(string Username, string Password);

public sealed record DevAuthOptions(bool Enabled, string? Username, string? Password)
{
    public bool HasCredentials => !string.IsNullOrEmpty(Username) && !string.IsNullOrEmpty(Password);
    public bool CanLogIn => Enabled && HasCredentials;

    public bool Matches(string? username, string? password)
        => CanLogIn
           && string.Equals(username, Username, StringComparison.Ordinal)
           && System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
               System.Text.Encoding.UTF8.GetBytes(password ?? string.Empty),
               System.Text.Encoding.UTF8.GetBytes(Password!));
}
