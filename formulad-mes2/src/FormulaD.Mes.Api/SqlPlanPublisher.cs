using System.Data;
using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

/// <summary>
/// INSERT новых строк плана в dbo.tblProductionPlan.
/// Все строки одной транзакцией: частично загруженный план не должен остаться.
/// </summary>
public sealed class SqlPlanPublisher(SqlOptions options, IEventLog eventLog) : IPlanPublisher
{
    public async Task<int> PublishAsync(IReadOnlyList<NewPlanRow> rows, string userName, CancellationToken ct)
    {
        if (rows.Count == 0) return 0;

        await using var connection = new SqlConnection(options.WriteConnectionString);
        await connection.OpenAsync(ct);
        await using var tx = (SqlTransaction)await connection.BeginTransactionAsync(ct);

        try
        {
            // ponytail: SEQN = MAX(SEQN)+1 per row, sequential. Fine for batch sizes under 1000.
            var nextSeqn = await GetNextSeqnAsync(connection, tx, ct);

            foreach (var row in rows)
            {
                await using var cmd = new SqlCommand("""
                    INSERT INTO [dbo].[tblProductionPlan]
                        ([VIN], [SEQN], [ModelArticle], [ModelName], [EngineNumber], [Color],
                         [SpecificationName], [Status], [statusid], [plannedstartdate], [PlannedShipmentDate])
                    VALUES
                        (@vin, @seqn, @modelArticle, @modelName, @engineNumber, @color,
                         @specificationName, @status, @statusid, @plannedStartDate, @plannedShipmentDate)
                    """, connection, tx) { CommandTimeout = options.CommandTimeoutSeconds };

                cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = row.Vin;
                cmd.Parameters.Add("@seqn", SqlDbType.Int).Value = nextSeqn++;
                cmd.Parameters.Add("@modelArticle", SqlDbType.NVarChar, 50).Value = (object?)row.ModelArticle ?? DBNull.Value;
                cmd.Parameters.Add("@modelName", SqlDbType.NVarChar, 100).Value = (object?)row.ModelName ?? DBNull.Value;
                cmd.Parameters.Add("@engineNumber", SqlDbType.NVarChar, 50).Value = (object?)row.EngineNumber ?? DBNull.Value;
                cmd.Parameters.Add("@color", SqlDbType.NVarChar, 50).Value = (object?)row.Color ?? DBNull.Value;
                cmd.Parameters.Add("@specificationName", SqlDbType.NVarChar, 100).Value = (object?)row.SpecificationName ?? DBNull.Value;
                cmd.Parameters.Add("@status", SqlDbType.NVarChar, 50).Value = "planned";
                cmd.Parameters.Add("@statusid", SqlDbType.Int).Value = 0;
                cmd.Parameters.Add("@plannedStartDate", SqlDbType.DateTime).Value = (object?)row.PlannedStartDate ?? DBNull.Value;
                cmd.Parameters.Add("@plannedShipmentDate", SqlDbType.DateTime).Value = (object?)row.PlannedShipmentDate ?? DBNull.Value;

                await cmd.ExecuteNonQueryAsync(ct);
            }

            await tx.CommitAsync(ct);
            eventLog.Record("ProductionPlan", $"{rows.Count} rows", "Import", null, $"{rows.Count} строк", userName);
            return rows.Count;
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }

    private async Task<int> GetNextSeqnAsync(SqlConnection connection, SqlTransaction tx, CancellationToken ct)
    {
        await using var cmd = new SqlCommand(
            "SELECT ISNULL(MAX([SEQN]), 0) + 1 FROM [dbo].[tblProductionPlan]",
            connection, tx) { CommandTimeout = options.CommandTimeoutSeconds };
        return (int)(await cmd.ExecuteScalarAsync(ct))!;
    }
}
