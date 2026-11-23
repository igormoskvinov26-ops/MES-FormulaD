using System.Data;
using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

public sealed class SqlNcpStore(SqlOptions options, IEventLog eventLog) : INcpReader, INcpWriter
{
    private const string SelectColumns = """
        n.[id], n.[VIN], n.[StationID], n.[ComponentID], n.[Quantity],
        n.[DiscrepancyTypeID], n.[Comment], n.[Status], n.[PartInstalled],
        n.[CreatedBy], n.[CreatedAt], n.[ClosedBy], n.[ClosedAt],
        c.[ComponentCode], c.[ComponentName],
        d.[discrepancy] AS [TypeName]
        """;
    private const string FromJoins = """
        FROM [dbo].[tblNCP] n
        LEFT JOIN [dbo].[tblComponent] c ON c.[id] = n.[ComponentID]
        LEFT JOIN [dbo].[tblDiscrepancyList] d ON d.[id] = n.[DiscrepancyTypeID]
        """;

    public async Task<PagedResult<NcpItem>> GetPageAsync(NcpQuery query, CancellationToken ct)
    {
        var filterByVin = !string.IsNullOrWhiteSpace(query.Vin);
        var filterByStatus = !string.IsNullOrEmpty(query.Status);
        var filterByType = !string.IsNullOrEmpty(query.Type);
        var filterByStation = !string.IsNullOrEmpty(query.Station);
        var sql = $"""
            SELECT {SelectColumns}, COUNT(*) OVER() AS [TotalRows]
            {FromJoins}
            WHERE 1=1
            {(filterByVin ? "AND n.[VIN] LIKE @vin ESCAPE '\\\\' " : "")}
            {(filterByStatus ? "AND n.[Status] = @status" : "")}
            {(filterByType ? "AND n.[Type] = @type" : "")}
            {(filterByStation ? "AND n.[StationID] = @station" : "")}
            ORDER BY n.[CreatedAt] DESC, n.[id] DESC
            OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
            """;
        await using var conn = new SqlConnection(options.ConnectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand(sql, conn) { CommandTimeout = options.CommandTimeoutSeconds };
        if (filterByVin) { var n = query.Vin!.Trim(); var p = VinSearch.IsSuffixSearch(n) ? ProductionPlanSql.LikeEndsWith(n) : ProductionPlanSql.LikeStartsWith(n); cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 101).Value = p; }
        if (filterByStatus) { var s = string.Equals(query.Status, "Закрыто", StringComparison.OrdinalIgnoreCase) ? 2 : 1; cmd.Parameters.Add("@status", SqlDbType.Int).Value = s; }
        if (filterByType) cmd.Parameters.Add("@type", SqlDbType.NVarChar, 100).Value = query.Type;
        if (filterByStation) cmd.Parameters.Add("@station", SqlDbType.NVarChar, 50).Value = query.Station;
        cmd.Parameters.Add("@offset", SqlDbType.Int).Value = (query.Page - 1) * query.PageSize;
        cmd.Parameters.Add("@pageSize", SqlDbType.Int).Value = query.PageSize;
        var items = new List<NcpItem>(query.PageSize); var total = 0;
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) { items.Add(MapNcp(reader)); total = reader.GetInt32(reader.GetOrdinal("TotalRows")); }
        return new PagedResult<NcpItem>(items, query.Page, query.PageSize, total);
    }

    public async Task<IReadOnlyList<string>> GetTypesAsync(CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.ConnectionString); await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand("SELECT [discrepancy] FROM [dbo].[tblDiscrepancyList] ORDER BY [id]", conn) { CommandTimeout = options.CommandTimeoutSeconds };
        var types = new List<string>(); await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) types.Add(r.GetString(0));
        return types;
    }

    public async Task<IReadOnlyList<ComponentItem>> GetComponentsAsync(CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.ConnectionString); await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand("SELECT [ComponentCode], [ComponentName], [StationID], [model_ids] FROM [dbo].[tblComponent] ORDER BY [ComponentCode]", conn) { CommandTimeout = options.CommandTimeoutSeconds };
        var items = new List<ComponentItem>(); await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var station = r.IsDBNull(2) ? null : r.GetInt32(2).ToString();
            string[]? modelIds = null;
            if (!r.IsDBNull(3)) { var raw = r.GetString(3); if (!string.IsNullOrWhiteSpace(raw)) modelIds = System.Text.Json.JsonSerializer.Deserialize<string[]>(raw); }
            items.Add(new ComponentItem(r.GetString(0), r.IsDBNull(1) ? "" : r.GetString(1), station, modelIds));
        }
        return items;
    }

    public async Task UpdateComponentAsync(string code, UpdateComponentRequest request, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.ConnectionString); await conn.OpenAsync(ct);
        var stationId = request.Station is null ? (object)DBNull.Value : int.Parse(request.Station);
        var modelIdsJson = request.ModelIds?.Length > 0 ? System.Text.Json.JsonSerializer.Serialize(request.ModelIds) : (object)DBNull.Value;
        await using var cmd = new SqlCommand("UPDATE [dbo].[tblComponent] SET [StationID] = @s, [model_ids] = @m WHERE [ComponentCode] = @c", conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.AddWithValue("@s", stationId); cmd.Parameters.AddWithValue("@m", modelIdsJson); cmd.Parameters.AddWithValue("@c", code);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<IReadOnlyList<string>> GetStationsAsync(CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.ConnectionString); await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand("SELECT DISTINCT CAST([StationID] AS NVARCHAR(10)) FROM [dbo].[tblComponent] WHERE [StationID] IS NOT NULL ORDER BY 1", conn) { CommandTimeout = options.CommandTimeoutSeconds };
        var stations = new List<string>(); await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) stations.Add(r.GetString(0));
        return stations.Count > 0 ? stations : DemoNcpStore.Stations;
    }

    public async Task<IReadOnlyList<NcpItem>> GetMissingRequiredPartsAsync(string vin, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.ConnectionString); await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand($"SELECT {SelectColumns} {FromJoins} WHERE n.[VIN] = @vin AND n.[PartInstalled] = 0", conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = vin;
        var items = new List<NcpItem>(); await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) items.Add(MapNcp(r));
        return items;
    }

    public async Task<(CreateNcpOutcome, NcpItem?)> CreateAsync(CreateNcpRequest request, string author, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.WriteConnectionString); await conn.OpenAsync(ct);
        await using (var check = new SqlCommand("SELECT 1 FROM [dbo].[tblProductionPlan] WHERE [VIN] = @vin", conn) { CommandTimeout = options.CommandTimeoutSeconds })
        { check.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = request.Vin; if (await check.ExecuteScalarAsync(ct) is null) return (CreateNcpOutcome.VinNotFound, null); }
        int componentId;
        await using (var check = new SqlCommand("SELECT [id] FROM [dbo].[tblComponent] WHERE [ComponentCode] = @code", conn) { CommandTimeout = options.CommandTimeoutSeconds })
        { check.Parameters.Add("@code", SqlDbType.NVarChar, 50).Value = request.ComponentCode; var r = await check.ExecuteScalarAsync(ct); if (r is null) return (CreateNcpOutcome.ComponentNotFound, null); componentId = (int)r; }
        if (request.Quantity is < 1 or > 9999) return (CreateNcpOutcome.InvalidQuantity, null);
        int discrepancyTypeId;
        await using (var check = new SqlCommand("SELECT [id] FROM [dbo].[tblDiscrepancyList] WHERE [discrepancy] = @type", conn) { CommandTimeout = options.CommandTimeoutSeconds })
        { check.Parameters.Add("@type", SqlDbType.NVarChar, 50).Value = request.Type; var r = await check.ExecuteScalarAsync(ct); if (r is null) return (CreateNcpOutcome.InvalidType, null); discrepancyTypeId = (int)r; }
        await using var cmd = new SqlCommand("""
            INSERT INTO [dbo].[tblNCP] ([VIN],[StationID],[ComponentID],[Quantity],[DiscrepancyTypeID],[Comment],[Status],[CreatedBy],[CreatedAt])
            OUTPUT INSERTED.[id]
            VALUES (@vin,@stationId,@componentId,@qty,@discTypeId,@comment,1,@author,@now)
            """, conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = request.Vin;
        cmd.Parameters.Add("@stationId", SqlDbType.Int).Value = int.TryParse(request.Station, out var sid) ? sid : (object)DBNull.Value;
        cmd.Parameters.Add("@componentId", SqlDbType.Int).Value = componentId;
        cmd.Parameters.Add("@qty", SqlDbType.Int).Value = request.Quantity;
        cmd.Parameters.Add("@discTypeId", SqlDbType.Int).Value = discrepancyTypeId;
        cmd.Parameters.Add("@comment", SqlDbType.NVarChar, 50).Value = (object?)request.OperatorComment?.Trim() ?? DBNull.Value;
        cmd.Parameters.Add("@author", SqlDbType.NVarChar, 50).Value = author;
        cmd.Parameters.Add("@now", SqlDbType.DateTime).Value = DateTime.Now;
        var newId = (int)(await cmd.ExecuteScalarAsync(ct))!;
        var created = await GetByIdAsync(conn, newId, ct);
        eventLog.Record("Ncp", $"NC-{newId}", "Create", null, request.Type, author);
        return (CreateNcpOutcome.Ok, created);
    }

    public async Task<(NcpActionOutcome, NcpItem?)> SetPartInstalledAsync(int id, bool installed, string author, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.WriteConnectionString); await conn.OpenAsync(ct);
        var current = await GetByIdAsync(conn, id, ct);
        if (current is null) return (NcpActionOutcome.NotFound, null);
        if (installed == current.PartInstalled) return (NcpActionOutcome.Ok, current);
        await using var cmd = new SqlCommand("UPDATE [dbo].[tblNCP] SET [PartInstalled] = @val WHERE [id] = @id", conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@val", SqlDbType.Bit).Value = installed;
        cmd.Parameters.Add("@id", SqlDbType.Int).Value = id;
        await cmd.ExecuteNonQueryAsync(ct);
        eventLog.Record("Ncp", $"NC-{id}", "PartInstalled", current.PartInstalled.ToString(), installed.ToString(), author);
        return (NcpActionOutcome.Ok, current with { PartInstalled = installed });
    }

    public async Task<(NcpActionOutcome, NcpItem?)> CloseAsync(int id, string author, CloseNcpRequest request, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.WriteConnectionString); await conn.OpenAsync(ct);
        await using var check = new SqlCommand("SELECT [Status] FROM [dbo].[tblNCP] WHERE [id] = @id", conn) { CommandTimeout = options.CommandTimeoutSeconds };
        check.Parameters.Add("@id", SqlDbType.Int).Value = id;
        var statusObj = await check.ExecuteScalarAsync(ct);
        if (statusObj is null) return (NcpActionOutcome.NotFound, null);
        if ((int)statusObj == 2) { var existing = await GetByIdAsync(conn, id, ct); return (NcpActionOutcome.AlreadyClosed, existing); }
        var commentClause = request.EngineerComment is not null ? ", [Comment] = @comment" : "";
        await using var cmd = new SqlCommand($"UPDATE [dbo].[tblNCP] SET [Status] = 2, [ClosedBy] = @author, [ClosedAt] = @now{commentClause} WHERE [id] = @id", conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@id", SqlDbType.Int).Value = id;
        cmd.Parameters.Add("@author", SqlDbType.NVarChar, 50).Value = author;
        cmd.Parameters.Add("@now", SqlDbType.DateTime).Value = DateTime.Now;
        if (request.EngineerComment is not null) cmd.Parameters.Add("@comment", SqlDbType.NVarChar, 50).Value = request.EngineerComment.Trim();
        await cmd.ExecuteNonQueryAsync(ct);
        eventLog.Record("Ncp", $"NC-{id}", "Close", "1", "2", author);
        return (NcpActionOutcome.Ok, await GetByIdAsync(conn, id, ct));
    }

    private async Task<NcpItem?> GetByIdAsync(SqlConnection conn, int id, CancellationToken ct)
    {
        await using var cmd = new SqlCommand($"SELECT {SelectColumns} {FromJoins} WHERE n.[id] = @id", conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@id", SqlDbType.Int).Value = id;
        await using var r = await cmd.ExecuteReaderAsync(CommandBehavior.SingleRow, ct);
        return await r.ReadAsync(ct) ? MapNcp(r) : null;
    }

    public async Task<IReadOnlyList<StationCount>> GetStationCountsAsync(DateTime from, DateTime to, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.ConnectionString); await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand("""
            SELECT CAST([StationID] AS NVARCHAR(10)) AS Station, COUNT(*) AS Cnt
            FROM [dbo].[tblNCP] WHERE [CreatedAt] >= @from AND [CreatedAt] < @to AND [StationID] IS NOT NULL
            GROUP BY [StationID] ORDER BY Cnt DESC
            """, conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@from", SqlDbType.DateTime).Value = from;
        cmd.Parameters.Add("@to", SqlDbType.DateTime).Value = to;
        var result = new List<StationCount>(); await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) result.Add(new StationCount(r.GetString(0), r.GetInt32(1)));
        return result;
    }

    public async Task<IReadOnlyList<TypeCount>> GetTypeCountsAsync(DateTime from, DateTime to, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.ConnectionString); await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand("""
            SELECT d.[discrepancy], COUNT(*) AS Cnt FROM [dbo].[tblNCP] n
            LEFT JOIN [dbo].[tblDiscrepancyList] d ON d.[id] = n.[DiscrepancyTypeID]
            WHERE n.[CreatedAt] >= @from AND n.[CreatedAt] < @to GROUP BY d.[discrepancy] ORDER BY Cnt DESC
            """, conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@from", SqlDbType.DateTime).Value = from;
        cmd.Parameters.Add("@to", SqlDbType.DateTime).Value = to;
        var result = new List<TypeCount>(); await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) result.Add(new TypeCount(r.IsDBNull(0) ? "" : r.GetString(0), r.GetInt32(1)));
        return result;
    }

    private static NcpItem MapNcp(SqlDataReader r)
    {
        var id = r.GetInt32(r.GetOrdinal("id"));
        var statusInt = r.IsDBNull(r.GetOrdinal("Status")) ? 1 : r.GetInt32(r.GetOrdinal("Status"));
        return new NcpItem(id, $"NC-{id}",
            r.IsDBNull(r.GetOrdinal("VIN")) ? "" : r.GetString(r.GetOrdinal("VIN")),
            r.IsDBNull(r.GetOrdinal("StationID")) ? "" : r.GetInt32(r.GetOrdinal("StationID")).ToString(),
            r.IsDBNull(r.GetOrdinal("ComponentCode")) ? "" : r.GetString(r.GetOrdinal("ComponentCode")),
            r.IsDBNull(r.GetOrdinal("ComponentName")) ? "" : r.GetString(r.GetOrdinal("ComponentName")),
            r.IsDBNull(r.GetOrdinal("Quantity")) ? 0 : r.GetInt32(r.GetOrdinal("Quantity")),
            r.IsDBNull(r.GetOrdinal("TypeName")) ? "" : r.GetString(r.GetOrdinal("TypeName")),
            r.IsDBNull(r.GetOrdinal("Comment")) ? null : r.GetString(r.GetOrdinal("Comment")), null,
            statusInt == 2 ? "Закрыто" : "Открыто",
            !r.IsDBNull(r.GetOrdinal("PartInstalled")) && r.GetBoolean(r.GetOrdinal("PartInstalled")),
            r.IsDBNull(r.GetOrdinal("CreatedAt")) ? DateTime.MinValue : r.GetDateTime(r.GetOrdinal("CreatedAt")),
            r.IsDBNull(r.GetOrdinal("CreatedBy")) ? "" : r.GetString(r.GetOrdinal("CreatedBy")),
            r.IsDBNull(r.GetOrdinal("ClosedAt")) ? null : r.GetDateTime(r.GetOrdinal("ClosedAt")),
            r.IsDBNull(r.GetOrdinal("ClosedBy")) ? null : r.GetString(r.GetOrdinal("ClosedBy")));
    }
}
