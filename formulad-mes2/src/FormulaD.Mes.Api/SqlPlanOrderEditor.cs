using System.Data;
using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

/// <summary>
/// Перемещение изделия на другую позицию (SEQN) в dbo.tblProductionPlan.
/// Логика идентична Demo: набор номеров SEQN не меняется, меняется только привязка VIN → SEQN.
/// Все UPDATE выполняются в одной транзакции.
/// </summary>
public sealed class SqlPlanOrderEditor(SqlOptions options, IEventLog eventLog) : IPlanOrderEditor
{
    public async Task<MoveOutcome> MoveAsync(string vin, int toPosition, string userName, CancellationToken ct)
    {
        await using var connection = new SqlConnection(options.WriteConnectionString);
        await connection.OpenAsync(ct);
        await using var tx = (SqlTransaction)await connection.BeginTransactionAsync(ct);

        try
        {
            // ponytail: читаем все строки с SEQN, сортируем. На 300-500 строках это мгновенно.
            var ordered = new List<(string Vin, int Seqn)>();
            await using (var cmd = new SqlCommand(
                "SELECT [VIN], [SEQN] FROM [dbo].[tblProductionPlan] WHERE [SEQN] IS NOT NULL ORDER BY [SEQN]",
                connection, tx) { CommandTimeout = options.CommandTimeoutSeconds })
            await using (var reader = await cmd.ExecuteReaderAsync(ct))
            {
                while (await reader.ReadAsync(ct))
                    ordered.Add((reader.GetString(0), reader.GetInt32(1)));
            }

            var fromIndex = ordered.FindIndex(r => string.Equals(r.Vin, vin, StringComparison.OrdinalIgnoreCase));
            if (fromIndex < 0)
            {
                // VIN не в списке: либо не существует, либо без SEQN.
                var exists = await VinExistsAsync(connection, tx, vin, ct);
                await tx.RollbackAsync(ct);
                return exists ? MoveOutcome.NoPosition : MoveOutcome.VinNotFound;
            }

            var positions = ordered.Select(r => r.Seqn).ToList();
            var targetIndex = positions.IndexOf(toPosition);
            if (targetIndex < 0)
            {
                await tx.RollbackAsync(ct);
                return MoveOutcome.PositionNotFound;
            }

            var fromSeqn = ordered[fromIndex].Seqn;
            var moved = ordered[fromIndex];
            ordered.RemoveAt(fromIndex);
            ordered.Insert(targetIndex, moved);

            // UPDATE только те строки, у которых SEQN реально сменился.
            for (var i = 0; i < ordered.Count; i++)
            {
                var slot = positions[i];
                if (ordered[i].Seqn != slot)
                {
                    await using var upd = new SqlCommand(
                        "UPDATE [dbo].[tblProductionPlan] SET [SEQN] = @seqn WHERE [VIN] = @vin",
                        connection, tx) { CommandTimeout = options.CommandTimeoutSeconds };
                    upd.Parameters.Add("@seqn", SqlDbType.Int).Value = slot;
                    upd.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = ordered[i].Vin;
                    await upd.ExecuteNonQueryAsync(ct);
                }
            }

            await tx.CommitAsync(ct);
            eventLog.Record("ProductionPlan", vin, "Move", fromSeqn.ToString(), toPosition.ToString(), userName);
            return MoveOutcome.Ok;
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }

    private async Task<bool> VinExistsAsync(SqlConnection connection, SqlTransaction tx, string vin, CancellationToken ct)
    {
        await using var cmd = new SqlCommand(
            "SELECT 1 FROM [dbo].[tblProductionPlan] WHERE [VIN] = @vin",
            connection, tx) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = vin;
        return await cmd.ExecuteScalarAsync(ct) is not null;
    }
}
