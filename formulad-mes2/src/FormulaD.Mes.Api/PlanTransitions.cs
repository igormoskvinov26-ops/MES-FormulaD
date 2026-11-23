namespace FormulaD.Mes.Api;

public interface IPlanTransitions
{
    Task<(TransitionOutcome Outcome, ProductionPlanItem? Item)> StartAsync(string vin, string userName, CancellationToken ct);
    Task<(TransitionOutcome Outcome, ProductionPlanItem? Item)> CompleteAsync(string vin, string userName, CancellationToken ct);
    Task<(TransitionOutcome Outcome, ProductionPlanItem? Item)> FokAsync(string vin, string userName, CancellationToken ct);
    Task<(TransitionOutcome Outcome, ProductionPlanItem? Item)> SendToReworkAsync(string vin, string userName, CancellationToken ct);
    Task<(TransitionOutcome Outcome, ProductionPlanItem? Item)> FinishReworkAsync(string vin, string userName, CancellationToken ct);
}

public enum TransitionOutcome { Ok, VinNotFound, WrongStatus }
