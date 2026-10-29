using System.Data;
using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

/// <summary>
/// Отметка печати JobCard: UPDATE PrintDate в dbo.tblProductionPlan.
/// Допустима в любом статусе, не меняет statusid/Status.
/// </summary>
public sealed class SqlJobCardPrinter(SqlOptions options, IEventLog eventLog) : IJobCardPrinter
{
    public async Task<ProductionPlanItem?> MarkPrintedAsync(string vin, string userName, CancellationToken ct)
    {
        await using var connection = new SqlConnection(options.WriteConnectionString);
        await connection.OpenAsync(ct);

        await using var cmd = new SqlCommand(
            "UPDATE [dbo].[tblProductionPlan] SET [PrintDate] = @now WHERE [VIN] = @vin",
            connection) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = vin;
        cmd.Parameters.Add("@now", SqlDbType.DateTime).Value = DateTime.Now;

        var rows = await cmd.ExecuteNonQueryAsync(ct);
        if (rows == 0) return null;

        eventLog.Record("ProductionPlan", vin, "Print", null, DateTime.Now.ToString("O"), userName);

        // Read back
        await using var read = new SqlCommand(
            $"SELECT {ProductionPlanSql.Columns} FROM [dbo].[tblProductionPlan] WHERE [VIN] = @vin",
            connection) { CommandTimeout = options.CommandTimeoutSeconds };
        read.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = vin;
        await using var reader = await read.ExecuteReaderAsync(CommandBehavior.SingleRow, ct);
        return await reader.ReadAsync(ct) ? SqlProductionPlanReader.Map(reader) : null;
    }
}
