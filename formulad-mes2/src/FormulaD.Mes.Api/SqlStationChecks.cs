using System.Data;
using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

public sealed class SqlStationChecks(SqlOptions options, IEventLog eventLog) : IStationChecks
{
    public async Task<IReadOnlyDictionary<string, ComponentCheck>> GetForVinAsync(string vin, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.ConnectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand("""
            SELECT [ComponentCode], [Checked], [CheckedBy], [CheckedAt]
            FROM [dbo].[tblComponentCheck]
            WHERE [VIN] = @vin
            """, conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = vin;
        var result = new Dictionary<string, ComponentCheck>(StringComparer.OrdinalIgnoreCase);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var code = reader.GetString(0);
            result[code] = new ComponentCheck(code, reader.GetBoolean(1),
                reader.IsDBNull(2) ? null : reader.GetString(2),
                reader.IsDBNull(3) ? null : reader.GetDateTime(3));
        }
        return result;
    }

    public async Task<(SetCheckOutcome, ComponentCheck?)> SetCheckedAsync(
        string vin, string componentCode, bool @checked, string author, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.WriteConnectionString);
        await conn.OpenAsync(ct);
        await using (var check = new SqlCommand(
            "SELECT 1 FROM [dbo].[tblProductionPlan] WHERE [VIN] = @vin", conn)
        { CommandTimeout = options.CommandTimeoutSeconds })
        {
            check.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = vin;
            if (await check.ExecuteScalarAsync(ct) is null) return (SetCheckOutcome.VinNotFound, null);
        }
        await using (var check = new SqlCommand(
            "SELECT 1 FROM [dbo].[tblComponent] WHERE [ComponentCode] = @code", conn)
        { CommandTimeout = options.CommandTimeoutSeconds })
        {
            check.Parameters.Add("@code", SqlDbType.NVarChar, 50).Value = componentCode;
            if (await check.ExecuteScalarAsync(ct) is null) return (SetCheckOutcome.ComponentNotFound, null);
        }
        await using var cmd = new SqlCommand("""
            MERGE [dbo].[tblComponentCheck] AS t
            USING (SELECT @vin AS VIN, @code AS ComponentCode) AS s
            ON t.[VIN] = s.VIN AND t.[ComponentCode] = s.ComponentCode
            WHEN MATCHED THEN
                UPDATE SET [Checked] = @checked, [CheckedBy] = @checkedBy, [CheckedAt] = @checkedAt
            WHEN NOT MATCHED THEN
                INSERT ([VIN], [ComponentCode], [Checked], [CheckedBy], [CheckedAt])
                VALUES (@vin, @code, @checked, @checkedBy, @checkedAt);
            """, conn) { CommandTimeout = options.CommandTimeoutSeconds };
        var now = @checked ? DateTime.Now : (DateTime?)null;
        cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = vin;
        cmd.Parameters.Add("@code", SqlDbType.NVarChar, 50).Value = componentCode;
        cmd.Parameters.Add("@checked", SqlDbType.Bit).Value = @checked;
        cmd.Parameters.Add("@checkedBy", SqlDbType.NVarChar, 50).Value = @checked ? author : (object)DBNull.Value;
        cmd.Parameters.Add("@checkedAt", SqlDbType.DateTime).Value = (object?)now ?? DBNull.Value;
        await cmd.ExecuteNonQueryAsync(ct);
        eventLog.Record("StationCheck", $"{vin}/{componentCode}", @checked ? "Checked" : "Unchecked", null, @checked.ToString(), author);
        return (SetCheckOutcome.Ok, new ComponentCheck(componentCode, @checked, @checked ? author : null, now));
    }
}
