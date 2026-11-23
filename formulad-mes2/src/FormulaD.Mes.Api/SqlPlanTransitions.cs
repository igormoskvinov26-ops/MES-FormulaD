using System.Data;
using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

public sealed class SqlPlanTransitions(SqlOptions options, IEventLog eventLog) : IPlanTransitions
{
    public Task<(TransitionOutcome, ProductionPlanItem?)> StartAsync(string vin, string userName, CancellationToken ct)
        => TransitionAsync(vin, 0, 1, "in progress", "StartDate", "Start", userName, ct);
    public Task<(TransitionOutcome, ProductionPlanItem?)> CompleteAsync(string vin, string userName, CancellationToken ct)
        => TransitionAsync(vin, 1, 2, "complete", "CompleteDate", "Complete", userName, ct);
    public Task<(TransitionOutcome, ProductionPlanItem?)> FokAsync(string vin, string userName, CancellationToken ct)
        => TransitionAsync(vin, 2, 3, "FOK", "FOK_date", "FOK", userName, ct);
    public Task<(TransitionOutcome, ProductionPlanItem?)> SendToReworkAsync(string vin, string userName, CancellationToken ct)
        => TransitionAsync(vin, 2, 4, "rework", "reworkdate", "SendToRework", userName, ct);
    public Task<(TransitionOutcome, ProductionPlanItem?)> FinishReworkAsync(string vin, string userName, CancellationToken ct)
        => TransitionAsync(vin, 4, 2, "complete", "reworkcompletedate", "FinishRework", userName, ct);

    private async Task<(TransitionOutcome, ProductionPlanItem?)> TransitionAsync(
        string vin, int fromStatusId, int toStatusId, string toStatus, string dateColumn,
        string eventName, string userName, CancellationToken ct)
    {
        await using var connection = new SqlConnection(options.WriteConnectionString);
        await connection.OpenAsync(ct);
        await using var cmd = new SqlCommand($"""
            UPDATE [dbo].[tblProductionPlan]
            SET [statusid] = @toStatusId, [Status] = @toStatus, [{dateColumn}] = @now
            WHERE [VIN] = @vin AND [statusid] = @fromStatusId;
            """, connection) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = vin;
        cmd.Parameters.Add("@fromStatusId", SqlDbType.Int).Value = fromStatusId;
        cmd.Parameters.Add("@toStatusId", SqlDbType.Int).Value = toStatusId;
        cmd.Parameters.Add("@toStatus", SqlDbType.NVarChar, 50).Value = toStatus;
        cmd.Parameters.Add("@now", SqlDbType.DateTime).Value = DateTime.Now;
        var rows = await cmd.ExecuteNonQueryAsync(ct);
        if (rows > 0)
        {
            var item = await ReadBackAsync(connection, vin, ct);
            eventLog.Record("ProductionPlan", vin, eventName, $"statusid={fromStatusId}", $"statusid={toStatusId}", userName);
            return (TransitionOutcome.Ok, item);
        }
        var item2 = await ReadBackAsync(connection, vin, ct);
        return item2 is null ? (TransitionOutcome.VinNotFound, null) : (TransitionOutcome.WrongStatus, item2);
    }

    private async Task<ProductionPlanItem?> ReadBackAsync(SqlConnection connection, string vin, CancellationToken ct)
    {
        await using var cmd = new SqlCommand($"SELECT {ProductionPlanSql.Columns} FROM [dbo].[tblProductionPlan] WHERE [VIN] = @vin;", connection)
        { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = vin;
        await using var reader = await cmd.ExecuteReaderAsync(CommandBehavior.SingleRow, ct);
        return await reader.ReadAsync(ct) ? SqlProductionPlanReader.Map(reader) : null;
    }
}
