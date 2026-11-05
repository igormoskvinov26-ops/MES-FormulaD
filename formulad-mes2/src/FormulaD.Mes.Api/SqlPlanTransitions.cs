using System.Data;
using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

/// <summary>
/// Переходы статусов в dbo.tblProductionPlan через UPDATE.
/// Каждый переход: проверяет текущий statusid, обновляет statusid + Status + дату,
/// возвращает обновлённую строку. Один UPDATE с WHERE по VIN и statusid — атомарно.
/// </summary>
public sealed class SqlPlanTransitions(SqlOptions options, IEventLog eventLog) : IPlanTransitions
{
    // ponytail: строковые значения Status взяты из Demo-реализации.
    // Сверить с реальными данными TEST-базы — если отличаются, поправить здесь.

    public Task<(TransitionOutcome, ProductionPlanItem?)> StartAsync(string vin, string userName, CancellationToken ct)
        => TransitionAsync(vin, fromStatusId: 0, toStatusId: 1, "in progress", "StartDate", "Start", userName, ct);

    public Task<(TransitionOutcome, ProductionPlanItem?)> CompleteAsync(string vin, string userName, CancellationToken ct)
        => TransitionAsync(vin, fromStatusId: 1, toStatusId: 2, "complete", "CompleteDate", "Complete", userName, ct);

    public Task<(TransitionOutcome, ProductionPlanItem?)> FokAsync(string vin, string userName, CancellationToken ct)
        => TransitionAsync(vin, fromStatusId: 2, toStatusId: 3, "FOK", "FOK_date", "FOK", userName, ct);

    public Task<(TransitionOutcome, ProductionPlanItem?)> SendToReworkAsync(string vin, string userName, CancellationToken ct)
        => TransitionAsync(vin, fromStatusId: 2, toStatusId: 4, "rework", "reworkdate", "SendToRework", userName, ct);

    public Task<(TransitionOutcome, ProductionPlanItem?)> FinishReworkAsync(string vin, string userName, CancellationToken ct)
        => TransitionAsync(vin, fromStatusId: 4, toStatusId: 2, "complete", "reworkcompletedate", "FinishRework", userName, ct);

    private async Task<(TransitionOutcome, ProductionPlanItem?)> TransitionAsync(
        string vin, int fromStatusId, int toStatusId, string toStatus, string dateColumn,
        string eventName, string userName, CancellationToken ct)
    {
        await using var connection = new SqlConnection(options.WriteConnectionString);
        await connection.OpenAsync(ct);

        // UPDATE с WHERE statusid = @from — если 0 строк обновлено, либо VIN нет, либо статус не тот.
        var sql = $"""
            UPDATE [dbo].[tblProductionPlan]
            SET [statusid] = @toStatusId, [Status] = @toStatus, [{dateColumn}] = @now
            WHERE [VIN] = @vin AND [statusid] = @fromStatusId;
            """;

        await using var cmd = new SqlCommand(sql, connection) { CommandTimeout = options.CommandTimeoutSeconds };
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

        // Различаем VinNotFound и WrongStatus: проверяем, есть ли VIN вообще.
        var item2 = await ReadBackAsync(connection, vin, ct);
        if (item2 is null)
            return (TransitionOutcome.VinNotFound, null);
        return (TransitionOutcome.WrongStatus, item2);
    }

    private async Task<ProductionPlanItem?> ReadBackAsync(SqlConnection connection, string vin, CancellationToken ct)
    {
        var sql = $"""
            SELECT {ProductionPlanSql.Columns}
            FROM [dbo].[tblProductionPlan]
            WHERE [VIN] = @vin;
            """;
        await using var cmd = new SqlCommand(sql, connection) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = vin;
        await using var reader = await cmd.ExecuteReaderAsync(CommandBehavior.SingleRow, ct);
        return await reader.ReadAsync(ct) ? SqlProductionPlanReader.Map(reader) : null;
    }
}
