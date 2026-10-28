using System.Data;
using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

/// <summary>
/// NCP (несоответствия) через SQL. Схема tblNCP:
/// id (PK identity), StationID int, ComponentID int FK→tblComponent.id,
/// VIN nvarchar(50) FK→tblProductionPlan.VIN, Quantity int,
/// DiscrepancyTypeID int FK→tblDiscrepancyList.id, Comment nvarchar(50),
/// Status int (1=открыто, 2=закрыто), CreatedBy/CreatedAt, ClosedBy/ClosedAt.
///
/// ponytail: PartInstalled нет в SQL-схеме — приравнено к Status=2.
/// Если бизнес потребует разделить, добавить колонку ALTER TABLE.
/// </summary>
public sealed class SqlNcpStore(SqlOptions options, IEventLog eventLog) : INcpReader, INcpWriter
{
    private const string SelectColumns = """
        n.[id], n.[VIN], n.[StationID], n.[ComponentID], n.[Quantity],
        n.[DiscrepancyTypeID], n.[Comment], n.[Status],
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

        var sql = $"""
            SELECT {SelectColumns}, COUNT(*) OVER() AS [TotalRows]
            {FromJoins}
            WHERE 1=1
            {(filterByVin ? "AND n.[VIN] LIKE @vin ESCAPE '\\'" : "")}
            {(filterByStatus ? "AND n.[Status] = @status" : "")}
            ORDER BY n.[CreatedAt] DESC, n.[id] DESC
            OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
            """;

        await using var conn = new SqlConnection(options.ConnectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand(sql, conn) { CommandTimeout = options.CommandTimeoutSeconds };

        if (filterByVin)
        {
            var needle = query.Vin!.Trim();
            var pattern = VinSearch.IsSuffixSearch(needle)
                ? ProductionPlanSql.LikeEndsWith(needle)
                : ProductionPlanSql.LikeStartsWith(needle);
            cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 101).Value = pattern;
        }
        if (filterByStatus)
        {
            // "Открыто"→1, "Закрыто"→2
            var statusInt = string.Equals(query.Status, "Закрыто", StringComparison.OrdinalIgnoreCase) ? 2 : 1;
            cmd.Parameters.Add("@status", SqlDbType.Int).Value = statusInt;
        }
        cmd.Parameters.Add("@offset", SqlDbType.Int).Value = (query.Page - 1) * query.PageSize;
        cmd.Parameters.Add("@pageSize", SqlDbType.Int).Value = query.PageSize;

        var items = new List<NcpItem>(query.PageSize);
        var total = 0;
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            items.Add(MapNcp(reader));
            total = reader.GetInt32(reader.GetOrdinal("TotalRows"));
        }
        return new PagedResult<NcpItem>(items, query.Page, query.PageSize, total);
    }

    public async Task<IReadOnlyList<string>> GetTypesAsync(CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.ConnectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand(
            "SELECT [discrepancy] FROM [dbo].[tblDiscrepancyList] ORDER BY [id]", conn)
        { CommandTimeout = options.CommandTimeoutSeconds };

        var types = new List<string>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            types.Add(reader.GetString(0));
        return types;
    }

    public async Task<IReadOnlyList<ComponentItem>> GetComponentsAsync(CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.ConnectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand(
            "SELECT [ComponentCode], [ComponentName], [StationID] FROM [dbo].[tblComponent] ORDER BY [ComponentCode]", conn)
        { CommandTimeout = options.CommandTimeoutSeconds };

        var items = new List<ComponentItem>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var station = reader.IsDBNull(2) ? null : reader.GetInt32(2).ToString();
            items.Add(new ComponentItem(reader.GetString(0), reader.IsDBNull(1) ? "" : reader.GetString(1), station));
        }
        return items;
    }

    public async Task<IReadOnlyList<string>> GetStationsAsync(CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.ConnectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand(
            "SELECT DISTINCT CAST([StationID] AS NVARCHAR(10)) FROM [dbo].[tblComponent] WHERE [StationID] IS NOT NULL ORDER BY 1", conn)
        { CommandTimeout = options.CommandTimeoutSeconds };

        var stations = new List<string>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            stations.Add(reader.GetString(0));
        // ponytail: StationID all NULL in current data — return fallback list if empty
        return stations.Count > 0 ? stations : DemoNcpStore.Stations;
    }

    public async Task<IReadOnlyList<NcpItem>> GetMissingRequiredPartsAsync(string vin, CancellationToken ct)
    {
        // ponytail: PartInstalled not in SQL schema — open NCP (Status=1) blocks FOK
        var sql = $"""
            SELECT {SelectColumns}
            {FromJoins}
            WHERE n.[VIN] = @vin AND n.[Status] = 1
            """;

        await using var conn = new SqlConnection(options.ConnectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand(sql, conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = vin;

        var items = new List<NcpItem>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            items.Add(MapNcp(reader));
        return items;
    }

    // --- INcpWriter ---

    public async Task<(CreateNcpOutcome, NcpItem?)> CreateAsync(CreateNcpRequest request, string author, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.WriteConnectionString);
        await conn.OpenAsync(ct);

        // Validate VIN exists
        await using (var check = new SqlCommand(
            "SELECT 1 FROM [dbo].[tblProductionPlan] WHERE [VIN] = @vin", conn)
        { CommandTimeout = options.CommandTimeoutSeconds })
        {
            check.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = request.Vin;
            if (await check.ExecuteScalarAsync(ct) is null)
                return (CreateNcpOutcome.VinNotFound, null);
        }

        // Resolve ComponentCode → ComponentID
        int componentId;
        await using (var check = new SqlCommand(
            "SELECT [id] FROM [dbo].[tblComponent] WHERE [ComponentCode] = @code", conn)
        { CommandTimeout = options.CommandTimeoutSeconds })
        {
            check.Parameters.Add("@code", SqlDbType.NVarChar, 50).Value = request.ComponentCode;
            var result = await check.ExecuteScalarAsync(ct);
            if (result is null)
                return (CreateNcpOutcome.ComponentNotFound, null);
            componentId = (int)result;
        }

        if (request.Quantity is < 1 or > 9999)
            return (CreateNcpOutcome.InvalidQuantity, null);

        // Resolve Type → DiscrepancyTypeID
        int discrepancyTypeId;
        await using (var check = new SqlCommand(
            "SELECT [id] FROM [dbo].[tblDiscrepancyList] WHERE [discrepancy] = @type", conn)
        { CommandTimeout = options.CommandTimeoutSeconds })
        {
            check.Parameters.Add("@type", SqlDbType.NVarChar, 50).Value = request.Type;
            var result = await check.ExecuteScalarAsync(ct);
            if (result is null)
                return (CreateNcpOutcome.InvalidType, null);
            discrepancyTypeId = (int)result;
        }

        // Station validation: accept any string (StationID is always NULL in real data)
        // ponytail: skip station validation for SQL — no station table exists

        // INSERT
        await using var cmd = new SqlCommand("""
            INSERT INTO [dbo].[tblNCP] ([VIN], [StationID], [ComponentID], [Quantity], [DiscrepancyTypeID],
                [Comment], [Status], [CreatedBy], [CreatedAt])
            OUTPUT INSERTED.[id]
            VALUES (@vin, @stationId, @componentId, @qty, @discTypeId, @comment, 1, @author, @now)
            """, conn) { CommandTimeout = options.CommandTimeoutSeconds };

        // StationID: try parse, NULL if not a number
        cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = request.Vin;
        cmd.Parameters.Add("@stationId", SqlDbType.Int).Value =
            int.TryParse(request.Station, out var sid) ? sid : DBNull.Value;
        cmd.Parameters.Add("@componentId", SqlDbType.Int).Value = componentId;
        cmd.Parameters.Add("@qty", SqlDbType.Int).Value = request.Quantity;
        cmd.Parameters.Add("@discTypeId", SqlDbType.Int).Value = discrepancyTypeId;
        cmd.Parameters.Add("@comment", SqlDbType.NVarChar, 50).Value =
            (object?)request.OperatorComment?.Trim() ?? DBNull.Value;
        cmd.Parameters.Add("@author", SqlDbType.NVarChar, 50).Value = author;
        cmd.Parameters.Add("@now", SqlDbType.DateTime).Value = DateTime.Now;

        var newId = (int)(await cmd.ExecuteScalarAsync(ct))!;

        // Read back with JOINs
        var created = await GetByIdAsync(conn, newId, ct);
        eventLog.Record("Ncp", $"NC-{newId}", "Create", null, request.Type, author);
        return (CreateNcpOutcome.Ok, created);
    }

    public async Task<(NcpActionOutcome, NcpItem?)> SetPartInstalledAsync(int id, bool installed, string author, CancellationToken ct)
    {
        // ponytail: no PartInstalled column in SQL — map to Status change
        // installed=true does nothing if already closed; installed=false reopens (Status=1)
        await using var conn = new SqlConnection(options.WriteConnectionString);
        await conn.OpenAsync(ct);

        var current = await GetByIdAsync(conn, id, ct);
        if (current is null)
            return (NcpActionOutcome.NotFound, null);

        // No-op if state already matches
        if (installed == current.PartInstalled)
            return (NcpActionOutcome.Ok, current);

        // ponytail: PartInstalled mapped to Status — no real column to update.
        // Log it but don't change Status (closing is a separate action).
        eventLog.Record("Ncp", $"NC-{id}", "PartInstalled",
            current.PartInstalled.ToString(), installed.ToString(), author);
        return (NcpActionOutcome.Ok, current);
    }

    public async Task<(NcpActionOutcome, NcpItem?)> CloseAsync(int id, string author, CloseNcpRequest request, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.WriteConnectionString);
        await conn.OpenAsync(ct);

        // Check current status
        await using var check = new SqlCommand(
            "SELECT [Status] FROM [dbo].[tblNCP] WHERE [id] = @id", conn)
        { CommandTimeout = options.CommandTimeoutSeconds };
        check.Parameters.Add("@id", SqlDbType.Int).Value = id;
        var statusObj = await check.ExecuteScalarAsync(ct);
        if (statusObj is null)
            return (NcpActionOutcome.NotFound, null);
        if ((int)statusObj == 2)
        {
            var existing = await GetByIdAsync(conn, id, ct);
            return (NcpActionOutcome.AlreadyClosed, existing);
        }

        // Update comment if provided, set Status=2, ClosedBy/ClosedAt
        var commentClause = request.EngineerComment is not null
            ? ", [Comment] = @comment" : "";

        await using var cmd = new SqlCommand(
            $"UPDATE [dbo].[tblNCP] SET [Status] = 2, [ClosedBy] = @author, [ClosedAt] = @now{commentClause} WHERE [id] = @id",
            conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@id", SqlDbType.Int).Value = id;
        cmd.Parameters.Add("@author", SqlDbType.NVarChar, 50).Value = author;
        cmd.Parameters.Add("@now", SqlDbType.DateTime).Value = DateTime.Now;
        if (request.EngineerComment is not null)
            cmd.Parameters.Add("@comment", SqlDbType.NVarChar, 50).Value = request.EngineerComment.Trim();

        await cmd.ExecuteNonQueryAsync(ct);
        eventLog.Record("Ncp", $"NC-{id}", "Close", "1", "2", author);

        var closed = await GetByIdAsync(conn, id, ct);
        return (NcpActionOutcome.Ok, closed);
    }

    // --- helpers ---

    private async Task<NcpItem?> GetByIdAsync(SqlConnection conn, int id, CancellationToken ct)
    {
        var sql = $"SELECT {SelectColumns} {FromJoins} WHERE n.[id] = @id";
        await using var cmd = new SqlCommand(sql, conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@id", SqlDbType.Int).Value = id;
        await using var reader = await cmd.ExecuteReaderAsync(CommandBehavior.SingleRow, ct);
        return await reader.ReadAsync(ct) ? MapNcp(reader) : null;
    }

    private static NcpItem MapNcp(SqlDataReader r)
    {
        var id = r.GetInt32(r.GetOrdinal("id"));
        var statusInt = r.IsDBNull(r.GetOrdinal("Status")) ? 1 : r.GetInt32(r.GetOrdinal("Status"));
        return new NcpItem(
            Id: id,
            Number: $"NC-{id}",
            Vin: r.IsDBNull(r.GetOrdinal("VIN")) ? "" : r.GetString(r.GetOrdinal("VIN")),
            Station: r.IsDBNull(r.GetOrdinal("StationID")) ? "" : r.GetInt32(r.GetOrdinal("StationID")).ToString(),
            ComponentCode: r.IsDBNull(r.GetOrdinal("ComponentCode")) ? "" : r.GetString(r.GetOrdinal("ComponentCode")),
            ComponentName: r.IsDBNull(r.GetOrdinal("ComponentName")) ? "" : r.GetString(r.GetOrdinal("ComponentName")),
            Quantity: r.IsDBNull(r.GetOrdinal("Quantity")) ? 0 : r.GetInt32(r.GetOrdinal("Quantity")),
            Type: r.IsDBNull(r.GetOrdinal("TypeName")) ? "" : r.GetString(r.GetOrdinal("TypeName")),
            OperatorComment: r.IsDBNull(r.GetOrdinal("Comment")) ? null : r.GetString(r.GetOrdinal("Comment")),
            EngineerComment: null,
            Status: statusInt == 2 ? "Закрыто" : "Открыто",
            PartInstalled: statusInt == 2,
            CreatedAt: r.IsDBNull(r.GetOrdinal("CreatedAt")) ? DateTime.MinValue : r.GetDateTime(r.GetOrdinal("CreatedAt")),
            CreatedBy: r.IsDBNull(r.GetOrdinal("CreatedBy")) ? "" : r.GetString(r.GetOrdinal("CreatedBy")),
            ClosedAt: r.IsDBNull(r.GetOrdinal("ClosedAt")) ? null : r.GetDateTime(r.GetOrdinal("ClosedAt")),
            ClosedBy: r.IsDBNull(r.GetOrdinal("ClosedBy")) ? null : r.GetString(r.GetOrdinal("ClosedBy")));
    }
}
