using System.Data;
using System.Globalization;
using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

/// <summary>
/// SQL-реализация входного контроля (разделы 19-24). Новые таблицы создаются автоматически
/// (EnsureTable) — в исходной схеме FormulaD их нет.
///
/// ponytail: таблицы поставщиков и нормативов тоже авто-создаются; наполнять через INSERT
/// или будущий UI справочников. Сессии Packing List — в памяти (эфемерные, как SqlPlanImport).
/// </summary>
public sealed class SqlIncomingInspection : IIncomingInspectionReader, IIncomingInspectionWriter
{
    public static readonly string[] DiscrepancyOutcomes = ["OK", "Брак", "Пересорт", "Недостача"];
    private static readonly string[] DateFormats = ["yyyy-MM-dd", "dd.MM.yyyy"];

    private readonly SqlOptions _options;
    private readonly IEventLog _eventLog;
    private volatile bool _tableEnsured;

    private readonly Lock _gate = new();
    private readonly Dictionary<string, PackingListSession> _sessions = new();

    public SqlIncomingInspection(SqlOptions options, IEventLog eventLog)
    {
        _options = options;
        _eventLog = eventLog;
    }

    // ── Reader ──────────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<SupplierRef>> GetSuppliersAsync(CancellationToken ct)
    {
        await using var conn = new SqlConnection(_options.ConnectionString);
        await conn.OpenAsync(ct);
        await EnsureTablesAsync(conn, ct);

        await using var cmd = new SqlCommand("""
            SELECT [Code], [Name], [IsParentPlant]
            FROM [dbo].[tblIncomingSupplier]
            ORDER BY [Code]
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds };

        var list = new List<SupplierRef>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
            list.Add(new SupplierRef(r.GetString(0), r.GetString(1), r.GetBoolean(2)));
        return list;
    }

    public async Task<IReadOnlyList<ComponentItem>> GetComponentsAsync(CancellationToken ct)
    {
        await using var conn = new SqlConnection(_options.ConnectionString);
        await conn.OpenAsync(ct);
        await EnsureTablesAsync(conn, ct);

        await using var cmd = new SqlCommand("""
            SELECT [ComponentCode], [ComponentName], [Station]
            FROM [dbo].[tblComponent]
            ORDER BY [ComponentCode]
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds };

        var list = new List<ComponentItem>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
            list.Add(new ComponentItem(r.GetString(0), r.GetString(1), r.IsDBNull(2) ? null : r.GetString(2)));
        return list;
    }

    public async Task<PagedResult<Delivery>> GetDeliveriesAsync(int page, int pageSize, CancellationToken ct)
    {
        await using var conn = new SqlConnection(_options.ConnectionString);
        await conn.OpenAsync(ct);
        await EnsureTablesAsync(conn, ct);

        // Count
        int total;
        await using (var cmd = new SqlCommand(
            "SELECT COUNT(*) FROM [dbo].[tblIncomingDelivery]", conn) { CommandTimeout = _options.CommandTimeoutSeconds })
        {
            total = (int)await cmd.ExecuteScalarAsync(ct);
        }

        // Page of delivery IDs
        await using var pageCmd = new SqlCommand("""
            SELECT [Id], [SupplierCode], [SupplierName], [InvoiceNumber], [InvoiceDate],
                   [AccompanyingDocument], [CreatedAt], [CreatedBy]
            FROM [dbo].[tblIncomingDelivery]
            ORDER BY [CreatedAt] DESC
            OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds };
        pageCmd.Parameters.Add("@offset", SqlDbType.Int).Value = (page - 1) * pageSize;
        pageCmd.Parameters.Add("@size", SqlDbType.Int).Value = pageSize;

        var deliveries = new List<(string Id, string SupplierCode, string SupplierName, string InvoiceNumber,
            DateTime InvoiceDate, string? AccompanyingDoc, DateTime CreatedAt, string CreatedBy)>();
        await using (var r = await pageCmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
                deliveries.Add((r.GetString(0), r.GetString(1), r.GetString(2), r.GetString(3),
                    r.GetDateTime(4), r.IsDBNull(5) ? null : r.GetString(5), r.GetDateTime(6), r.GetString(7)));
        }

        var items = new List<Delivery>(deliveries.Count);
        foreach (var d in deliveries)
        {
            var packages = await LoadPackagesAsync(conn, d.Id, ct);
            items.Add(new Delivery(d.Id, d.SupplierCode, d.SupplierName, d.InvoiceNumber,
                d.InvoiceDate, d.AccompanyingDoc, d.CreatedAt, d.CreatedBy, packages));
        }

        return new PagedResult<Delivery>(items, page, pageSize, total);
    }

    public async Task<Delivery?> GetDeliveryAsync(string id, CancellationToken ct)
    {
        await using var conn = new SqlConnection(_options.ConnectionString);
        await conn.OpenAsync(ct);
        await EnsureTablesAsync(conn, ct);

        await using var cmd = new SqlCommand("""
            SELECT [SupplierCode], [SupplierName], [InvoiceNumber], [InvoiceDate],
                   [AccompanyingDocument], [CreatedAt], [CreatedBy]
            FROM [dbo].[tblIncomingDelivery]
            WHERE [Id] = @id
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@id", SqlDbType.NVarChar, 32).Value = id;

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return null;

        var packages = await LoadPackagesAsync(conn, id, ct);
        return new Delivery(id, r.GetString(0), r.GetString(1), r.GetString(2),
            r.GetDateTime(3), r.IsDBNull(4) ? null : r.GetString(4), r.GetDateTime(5), r.GetString(6), packages);
    }

    public async Task<Package?> GetPackageByHuAsync(string deliveryId, string hu, CancellationToken ct)
    {
        await using var conn = new SqlConnection(_options.ConnectionString);
        await conn.OpenAsync(ct);
        await EnsureTablesAsync(conn, ct);

        await using var cmd = new SqlCommand("""
            SELECT [Id], [HuNumber], [Status], [ClosedAt], [ClosedBy]
            FROM [dbo].[tblIncomingPackage]
            WHERE [DeliveryId] = @did AND [HuNumber] = @hu
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@did", SqlDbType.NVarChar, 32).Value = deliveryId;
        cmd.Parameters.Add("@hu", SqlDbType.NVarChar, 100).Value = hu.Trim();

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return null;

        var pkgId = r.GetInt32(0);
        var pkg = new Package(pkgId, deliveryId, r.GetString(1), r.GetString(2),
            r.IsDBNull(3) ? null : r.GetDateTime(3), r.IsDBNull(4) ? null : r.GetString(4),
            await LoadRowsAsync(conn, pkgId, ct));
        return pkg;
    }

    // ── Writer ──────────────────────────────────────────────────────────────

    public async Task<(CreateDeliveryOutcome, Delivery?)> CreateDeliveryAsync(CreateDeliveryRequest request, string author, CancellationToken ct)
    {
        await using var conn = new SqlConnection(_options.WriteConnectionString);
        await conn.OpenAsync(ct);
        await EnsureTablesAsync(conn, ct);

        // Validate supplier
        SupplierRef? supplier = null;
        await using (var cmd = new SqlCommand(
            "SELECT [Name], [IsParentPlant] FROM [dbo].[tblIncomingSupplier] WHERE [Code] = @code", conn)
        { CommandTimeout = _options.CommandTimeoutSeconds })
        {
            cmd.Parameters.Add("@code", SqlDbType.NVarChar, 50).Value = request.SupplierCode;
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
                supplier = new SupplierRef(request.SupplierCode, r.GetString(0), r.GetBoolean(1));
        }
        if (supplier is null)
            return (CreateDeliveryOutcome.SupplierNotFound, null);

        if (!TryParseDate(request.InvoiceDate, out var invoiceDate))
            return (CreateDeliveryOutcome.InvalidInvoiceDate, null);

        var id = Guid.NewGuid().ToString("N");
        await using (var cmd = new SqlCommand("""
            INSERT INTO [dbo].[tblIncomingDelivery]
                ([Id], [SupplierCode], [SupplierName], [InvoiceNumber], [InvoiceDate],
                 [AccompanyingDocument], [CreatedAt], [CreatedBy])
            VALUES (@id, @sc, @sn, @inv, @invDate, @doc, @at, @by)
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds })
        {
            cmd.Parameters.Add("@id", SqlDbType.NVarChar, 32).Value = id;
            cmd.Parameters.Add("@sc", SqlDbType.NVarChar, 50).Value = supplier.Code;
            cmd.Parameters.Add("@sn", SqlDbType.NVarChar, 200).Value = supplier.Name;
            cmd.Parameters.Add("@inv", SqlDbType.NVarChar, 100).Value = request.InvoiceNumber.Trim();
            cmd.Parameters.Add("@invDate", SqlDbType.DateTime).Value = invoiceDate;
            cmd.Parameters.Add("@doc", SqlDbType.NVarChar, 200).Value = (object?)Trim(request.AccompanyingDocument) ?? DBNull.Value;
            cmd.Parameters.Add("@at", SqlDbType.DateTime).Value = DateTime.Now;
            cmd.Parameters.Add("@by", SqlDbType.NVarChar, 50).Value = author;
            await cmd.ExecuteNonQueryAsync(ct);
        }

        var delivery = new Delivery(id, supplier.Code, supplier.Name,
            request.InvoiceNumber.Trim(), invoiceDate, Trim(request.AccompanyingDocument),
            DateTime.Now, author, []);
        _eventLog.Record("Delivery", id, "Create", null, $"{supplier.Name} / {request.InvoiceNumber.Trim()}", author);
        return (CreateDeliveryOutcome.Ok, delivery);
    }

    public async Task<bool> AddComponentAsync(AddComponentRequest request, CancellationToken ct)
    {
        var code = request.Code?.Trim();
        var name = request.Name?.Trim();
        if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(name))
            return false;

        await using var conn = new SqlConnection(_options.WriteConnectionString);
        await conn.OpenAsync(ct);
        await EnsureTablesAsync(conn, ct);

        // Check if exists
        await using (var check = new SqlCommand(
            "SELECT 1 FROM [dbo].[tblComponent] WHERE [ComponentCode] = @code", conn)
        { CommandTimeout = _options.CommandTimeoutSeconds })
        {
            check.Parameters.Add("@code", SqlDbType.NVarChar, 50).Value = code;
            if (await check.ExecuteScalarAsync(ct) is not null)
                return false;
        }

        await using var cmd = new SqlCommand("""
            INSERT INTO [dbo].[tblComponent] ([ComponentCode], [ComponentName])
            VALUES (@code, @name)
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@code", SqlDbType.NVarChar, 50).Value = code;
        cmd.Parameters.Add("@name", SqlDbType.NVarChar, 200).Value = name;
        await cmd.ExecuteNonQueryAsync(ct);
        _eventLog.Record("Component", code, "Add", null, name, "система");
        return true;
    }

    public async Task<PackingListSession?> StagePackingListAsync(string deliveryId, IReadOnlyList<PackingListRawRow> rows, string userName, CancellationToken ct)
    {
        if (await GetDeliveryAsync(deliveryId, ct) is null)
            return null;

        var components = await GetComponentsAsync(ct);
        var quotas = await GetQuotasAsync(ct);
        var validated = ValidateAll(rows, components.ToList(), quotas);
        var session = new PackingListSession(Guid.NewGuid().ToString("N"), deliveryId, DateTime.Now, userName, validated);
        lock (_gate)
        {
            _sessions[session.Id] = session;
        }
        _eventLog.Record("PackingList", session.Id, "Stage", null, $"{session.TotalCount} строк, {session.ErrorCount} с ошибками", userName);
        return session;
    }

    public Task<PackingListSession?> GetSessionAsync(string sessionId, CancellationToken ct)
    {
        lock (_gate)
        {
            return Task.FromResult(_sessions.GetValueOrDefault(sessionId));
        }
    }

    public async Task<PackingListSession?> ReplaceRowAsync(string sessionId, int rowNumber, PackingListRawRow updated, string userName, CancellationToken ct)
    {
        PackingListSession? existing;
        lock (_gate)
        {
            _sessions.TryGetValue(sessionId, out existing);
        }
        if (existing is null || existing.Rows.All(r => r.RowNumber != rowNumber))
            return null;

        var components = await GetComponentsAsync(ct);
        var quotas = await GetQuotasAsync(ct);
        var rawRows = existing.Rows.Select(r => r.RowNumber == rowNumber ? updated : r.Row).ToList();
        var validated = ValidateAll(rawRows, components.ToList(), quotas);
        var session = existing with { Rows = validated };
        lock (_gate)
        {
            _sessions[sessionId] = session;
        }
        _eventLog.Record("PackingList", sessionId, "EditRow", null, $"строка {rowNumber}", userName);
        return session;
    }

    public async Task<(ConfirmPackingListOutcome, Delivery?)> ConfirmSessionAsync(string sessionId, string userName, CancellationToken ct)
    {
        PackingListSession? session;
        lock (_gate)
        {
            _sessions.TryGetValue(sessionId, out session);
        }
        if (session is null)
            return (ConfirmPackingListOutcome.SessionNotFound, null);
        if (session.ErrorCount > 0)
            return (ConfirmPackingListOutcome.HasErrors, null);

        await using var conn = new SqlConnection(_options.WriteConnectionString);
        await conn.OpenAsync(ct);
        await EnsureTablesAsync(conn, ct);

        // Verify delivery still exists
        var deliveryId = session.DeliveryId;
        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);

        try
        {
            var components = await GetComponentsInternalAsync(conn, tx, ct);
            var quotas = await GetQuotasInternalAsync(conn, tx, ct);

            foreach (var group in session.Rows.GroupBy(r => r.Row.PackageNumber!.Trim(), StringComparer.OrdinalIgnoreCase))
            {
                // Check if package with this HU already exists for this delivery
                int? existingPkgId = null;
                await using (var check = new SqlCommand(
                    "SELECT [Id] FROM [dbo].[tblIncomingPackage] WHERE [DeliveryId] = @did AND [HuNumber] = @hu", conn, tx)
                { CommandTimeout = _options.CommandTimeoutSeconds })
                {
                    check.Parameters.Add("@did", SqlDbType.NVarChar, 32).Value = deliveryId;
                    check.Parameters.Add("@hu", SqlDbType.NVarChar, 100).Value = group.Key;
                    var result = await check.ExecuteScalarAsync(ct);
                    if (result is int id) existingPkgId = id;
                }

                int packageId;
                if (existingPkgId is not null)
                {
                    packageId = existingPkgId.Value;
                }
                else
                {
                    await using var ins = new SqlCommand("""
                        INSERT INTO [dbo].[tblIncomingPackage] ([DeliveryId], [HuNumber], [Status])
                        VALUES (@did, @hu, @status);
                        SELECT SCOPE_IDENTITY();
                        """, conn, tx) { CommandTimeout = _options.CommandTimeoutSeconds };
                    ins.Parameters.Add("@did", SqlDbType.NVarChar, 32).Value = deliveryId;
                    ins.Parameters.Add("@hu", SqlDbType.NVarChar, 100).Value = group.Key;
                    ins.Parameters.Add("@status", SqlDbType.NVarChar, 20).Value = PackageStatuses.Open;
                    packageId = Convert.ToInt32(await ins.ExecuteScalarAsync(ct));
                }

                foreach (var rowResult in group)
                {
                    var raw = rowResult.Row;
                    var article = raw.Article!.Trim();
                    var component = components.First(c => string.Equals(c.Code, article, StringComparison.OrdinalIgnoreCase));
                    var plannedQty = int.Parse(raw.Quantity!.Trim(), CultureInfo.InvariantCulture);
                    var required = ComputeRequiredQuantity(component.Code, plannedQty, quotas);
                    TryParseDecimal(raw.NetWeight, out var netW);
                    TryParseDecimal(raw.GrossWeight, out var grossW);

                    await using var rowCmd = new SqlCommand("""
                        INSERT INTO [dbo].[tblIncomingPackingRow]
                            ([PackageId], [ComponentCode], [ComponentName], [PlannedQuantity],
                             [NetWeight], [GrossWeight], [Batch], [RequiredQuantity],
                             [OkQuantity], [DefectQuantity], [MismatchQuantity], [ShortageQuantity])
                        VALUES (@pid, @code, @name, @qty, @nw, @gw, @batch, @req, 0, 0, 0, 0)
                        """, conn, tx) { CommandTimeout = _options.CommandTimeoutSeconds };
                    rowCmd.Parameters.Add("@pid", SqlDbType.Int).Value = packageId;
                    rowCmd.Parameters.Add("@code", SqlDbType.NVarChar, 50).Value = component.Code;
                    rowCmd.Parameters.Add("@name", SqlDbType.NVarChar, 200).Value = component.Name;
                    rowCmd.Parameters.Add("@qty", SqlDbType.Int).Value = plannedQty;
                    rowCmd.Parameters.Add("@nw", SqlDbType.Decimal).Value = raw.NetWeight is not null ? (object)netW : DBNull.Value;
                    rowCmd.Parameters.Add("@gw", SqlDbType.Decimal).Value = raw.GrossWeight is not null ? (object)grossW : DBNull.Value;
                    rowCmd.Parameters.Add("@batch", SqlDbType.NVarChar, 100).Value = (object?)Trim(raw.Batch) ?? DBNull.Value;
                    rowCmd.Parameters.Add("@req", SqlDbType.Int).Value = required;
                    await rowCmd.ExecuteNonQueryAsync(ct);
                }
            }

            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }

        lock (_gate)
        {
            _sessions.Remove(sessionId);
        }
        _eventLog.Record("PackingList", sessionId, "Confirm", null, $"{session.TotalCount} строк в поставку {deliveryId}", userName);

        var delivery = await GetDeliveryAsync(deliveryId, ct);
        return (ConfirmPackingListOutcome.Ok, delivery);
    }

    public async Task<(RowResultOutcome, Package?)> RecordRowResultAsync(
        int packageId, int rowId, RecordRowResultRequest request, string userName, CancellationToken ct)
    {
        if (!DiscrepancyOutcomes.Contains(request.Outcome, StringComparer.Ordinal))
            return (RowResultOutcome.InvalidOutcome, null);
        if (request.Quantity < 1)
            return (RowResultOutcome.InvalidQuantity, null);

        await using var conn = new SqlConnection(_options.WriteConnectionString);
        await conn.OpenAsync(ct);
        await EnsureTablesAsync(conn, ct);

        var (pkg, row) = await LoadPackageAndRowAsync(conn, packageId, rowId, ct);
        if (pkg is null || row is null)
            return (RowResultOutcome.NotFound, null);
        if (pkg.Status == PackageStatuses.Closed)
            return (RowResultOutcome.PackageClosed, null);
        if (row.CheckedQuantity + request.Quantity > row.RequiredQuantity)
            return (RowResultOutcome.ExceedsRequired, null);

        var col = request.Outcome switch
        {
            "OK" => "[OkQuantity]",
            "Брак" => "[DefectQuantity]",
            "Пересорт" => "[MismatchQuantity]",
            _ => "[ShortageQuantity]",
        };

        var sql = $"UPDATE [dbo].[tblIncomingPackingRow] SET {col} = {col} + @qty";
        if (request.Outcome != "OK" && !string.IsNullOrWhiteSpace(request.Reason))
            sql += ", [DiscrepancyReason] = @reason";
        sql += " WHERE [Id] = @id";

        await using var cmd = new SqlCommand(sql, conn) { CommandTimeout = _options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@qty", SqlDbType.Int).Value = request.Quantity;
        cmd.Parameters.Add("@id", SqlDbType.Int).Value = rowId;
        if (request.Outcome != "OK" && !string.IsNullOrWhiteSpace(request.Reason))
            cmd.Parameters.Add("@reason", SqlDbType.NVarChar, 500).Value = request.Reason.Trim();
        await cmd.ExecuteNonQueryAsync(ct);

        _eventLog.Record("PackingListRow", $"{packageId}/{rowId}", "Check", null, $"{request.Outcome} +{request.Quantity}", userName);

        var updated = await LoadFullPackageAsync(conn, packageId, ct);
        return (RowResultOutcome.Ok, updated);
    }

    public async Task<(QuotaOutcome, Package?)> IncreaseQuotaAsync(
        int packageId, int rowId, IncreaseQuotaRequest request, string userName, CancellationToken ct)
    {
        await using var conn = new SqlConnection(_options.WriteConnectionString);
        await conn.OpenAsync(ct);
        await EnsureTablesAsync(conn, ct);

        var (pkg, row) = await LoadPackageAndRowAsync(conn, packageId, rowId, ct);
        if (pkg is null || row is null)
            return (QuotaOutcome.NotFound, null);
        if (pkg.Status == PackageStatuses.Closed)
            return (QuotaOutcome.PackageClosed, null);
        if (request.NewRequiredQuantity <= row.RequiredQuantity || request.NewRequiredQuantity > row.PlannedQuantity)
            return (QuotaOutcome.InvalidQuantity, null);

        await using var cmd = new SqlCommand(
            "UPDATE [dbo].[tblIncomingPackingRow] SET [RequiredQuantity] = @req WHERE [Id] = @id", conn)
        { CommandTimeout = _options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@req", SqlDbType.Int).Value = request.NewRequiredQuantity;
        cmd.Parameters.Add("@id", SqlDbType.Int).Value = rowId;
        await cmd.ExecuteNonQueryAsync(ct);

        _eventLog.Record("PackingListRow", $"{packageId}/{rowId}", "IncreaseQuota",
            row.RequiredQuantity.ToString(), $"{request.NewRequiredQuantity} ({request.Comment.Trim()})", userName);

        var updated = await LoadFullPackageAsync(conn, packageId, ct);
        return (QuotaOutcome.Ok, updated);
    }

    public async Task<(PackageActionOutcome, Package?)> ClosePackageAsync(int packageId, string userName, CancellationToken ct)
    {
        await using var conn = new SqlConnection(_options.WriteConnectionString);
        await conn.OpenAsync(ct);
        await EnsureTablesAsync(conn, ct);

        var pkg = await LoadFullPackageAsync(conn, packageId, ct);
        if (pkg is null)
            return (PackageActionOutcome.NotFound, null);
        if (pkg.Status == PackageStatuses.Closed)
            return (PackageActionOutcome.AlreadyClosed, pkg);
        if (!pkg.IsComplete)
            return (PackageActionOutcome.NotComplete, pkg);

        await using var cmd = new SqlCommand("""
            UPDATE [dbo].[tblIncomingPackage]
            SET [Status] = @status, [ClosedAt] = @at, [ClosedBy] = @by
            WHERE [Id] = @id
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@status", SqlDbType.NVarChar, 20).Value = PackageStatuses.Closed;
        cmd.Parameters.Add("@at", SqlDbType.DateTime).Value = DateTime.Now;
        cmd.Parameters.Add("@by", SqlDbType.NVarChar, 50).Value = userName;
        cmd.Parameters.Add("@id", SqlDbType.Int).Value = packageId;
        await cmd.ExecuteNonQueryAsync(ct);

        _eventLog.Record("Package", packageId.ToString(), "Close", null,
            pkg.HasIssues ? "проверено, с замечаниями" : "проверено, без замечаний", userName);

        return (PackageActionOutcome.Ok, await LoadFullPackageAsync(conn, packageId, ct));
    }

    public async Task<(PackageActionOutcome, Package?)> ReopenPackageAsync(int packageId, ReopenRequest request, string userName, CancellationToken ct)
    {
        await using var conn = new SqlConnection(_options.WriteConnectionString);
        await conn.OpenAsync(ct);
        await EnsureTablesAsync(conn, ct);

        var pkg = await LoadFullPackageAsync(conn, packageId, ct);
        if (pkg is null)
            return (PackageActionOutcome.NotFound, null);
        if (pkg.Status == PackageStatuses.Open)
            return (PackageActionOutcome.NotClosed, pkg);

        await using var cmd = new SqlCommand("""
            UPDATE [dbo].[tblIncomingPackage]
            SET [Status] = @status, [ClosedAt] = NULL, [ClosedBy] = NULL
            WHERE [Id] = @id
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@status", SqlDbType.NVarChar, 20).Value = PackageStatuses.Open;
        cmd.Parameters.Add("@id", SqlDbType.Int).Value = packageId;
        await cmd.ExecuteNonQueryAsync(ct);

        _eventLog.Record("Package", packageId.ToString(), "Reopen", "Closed", request.Comment.Trim(), userName);

        return (PackageActionOutcome.Ok, await LoadFullPackageAsync(conn, packageId, ct));
    }

    // ── Internal helpers ────────────────────────────────────────────────────

    private async Task<IReadOnlyList<Package>> LoadPackagesAsync(SqlConnection conn, string deliveryId, CancellationToken ct)
    {
        await using var cmd = new SqlCommand("""
            SELECT [Id], [HuNumber], [Status], [ClosedAt], [ClosedBy]
            FROM [dbo].[tblIncomingPackage]
            WHERE [DeliveryId] = @did
            ORDER BY [Id]
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@did", SqlDbType.NVarChar, 32).Value = deliveryId;

        var packages = new List<(int Id, string Hu, string Status, DateTime? ClosedAt, string? ClosedBy)>();
        await using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
                packages.Add((r.GetInt32(0), r.GetString(1), r.GetString(2),
                    r.IsDBNull(3) ? null : r.GetDateTime(3), r.IsDBNull(4) ? null : r.GetString(4)));
        }

        var result = new List<Package>(packages.Count);
        foreach (var p in packages)
        {
            var rows = await LoadRowsAsync(conn, p.Id, ct);
            result.Add(new Package(p.Id, deliveryId, p.Hu, p.Status, p.ClosedAt, p.ClosedBy, rows));
        }
        return result;
    }

    private async Task<IReadOnlyList<PackingListRow>> LoadRowsAsync(SqlConnection conn, int packageId, CancellationToken ct)
    {
        await using var cmd = new SqlCommand("""
            SELECT [Id], [ComponentCode], [ComponentName], [PlannedQuantity],
                   [NetWeight], [GrossWeight], [Batch], [RequiredQuantity],
                   [OkQuantity], [DefectQuantity], [MismatchQuantity], [ShortageQuantity], [DiscrepancyReason]
            FROM [dbo].[tblIncomingPackingRow]
            WHERE [PackageId] = @pid
            ORDER BY [Id]
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@pid", SqlDbType.Int).Value = packageId;

        var rows = new List<PackingListRow>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            rows.Add(new PackingListRow(
                r.GetInt32(0), r.GetString(1), r.GetString(2), r.GetInt32(3),
                r.IsDBNull(4) ? null : r.GetDecimal(4), r.IsDBNull(5) ? null : r.GetDecimal(5),
                r.IsDBNull(6) ? null : r.GetString(6), r.GetInt32(7),
                r.GetInt32(8), r.GetInt32(9), r.GetInt32(10), r.GetInt32(11),
                r.IsDBNull(12) ? null : r.GetString(12)));
        }
        return rows;
    }

    private async Task<Package?> LoadFullPackageAsync(SqlConnection conn, int packageId, CancellationToken ct)
    {
        await using var cmd = new SqlCommand("""
            SELECT [DeliveryId], [HuNumber], [Status], [ClosedAt], [ClosedBy]
            FROM [dbo].[tblIncomingPackage]
            WHERE [Id] = @id
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@id", SqlDbType.Int).Value = packageId;

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return null;

        var deliveryId = r.GetString(0);
        var hu = r.GetString(1);
        var status = r.GetString(2);
        var closedAt = r.IsDBNull(3) ? (DateTime?)null : r.GetDateTime(3);
        var closedBy = r.IsDBNull(4) ? null : r.GetString(4);
        await r.CloseAsync();

        var rows = await LoadRowsAsync(conn, packageId, ct);
        return new Package(packageId, deliveryId, hu, status, closedAt, closedBy, rows);
    }

    private async Task<(Package?, PackingListRow?)> LoadPackageAndRowAsync(SqlConnection conn, int packageId, int rowId, CancellationToken ct)
    {
        var pkg = await LoadFullPackageAsync(conn, packageId, ct);
        if (pkg is null) return (null, null);
        var row = pkg.Rows.FirstOrDefault(r => r.Id == rowId);
        return (pkg, row);
    }

    private async Task<List<InspectionQuotaRef>> GetQuotasAsync(CancellationToken ct)
    {
        await using var conn = new SqlConnection(_options.ConnectionString);
        await conn.OpenAsync(ct);
        await EnsureTablesAsync(conn, ct);
        return await GetQuotasInternalAsync(conn, null, ct);
    }

    private async Task<List<InspectionQuotaRef>> GetQuotasInternalAsync(SqlConnection conn, SqlTransaction? tx, CancellationToken ct)
    {
        await using var cmd = new SqlCommand(
            "SELECT [ComponentCode], [Percent], [FixedCount] FROM [dbo].[tblInspectionQuota]", conn, tx!)
        { CommandTimeout = _options.CommandTimeoutSeconds };

        var list = new List<InspectionQuotaRef>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
            list.Add(new InspectionQuotaRef(r.GetString(0), r.IsDBNull(1) ? null : r.GetInt32(1), r.IsDBNull(2) ? null : r.GetInt32(2)));
        return list;
    }

    private async Task<List<ComponentItem>> GetComponentsInternalAsync(SqlConnection conn, SqlTransaction tx, CancellationToken ct)
    {
        await using var cmd = new SqlCommand(
            "SELECT [ComponentCode], [ComponentName], [Station] FROM [dbo].[tblComponent]", conn, tx)
        { CommandTimeout = _options.CommandTimeoutSeconds };

        var list = new List<ComponentItem>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
            list.Add(new ComponentItem(r.GetString(0), r.GetString(1), r.IsDBNull(2) ? null : r.GetString(2)));
        return list;
    }

    // ── Validation (same logic as Demo) ─────────────────────────────────────

    private List<PackingListRowResult> ValidateAll(IReadOnlyList<PackingListRawRow> rows, List<ComponentItem> components, List<InspectionQuotaRef> quotas)
    {
        var results = new List<PackingListRowResult>(rows.Count);
        for (var i = 0; i < rows.Count; i++)
        {
            var errors = ValidateRow(rows[i], components, quotas, out var preview);
            results.Add(new PackingListRowResult(i + 1, rows[i], errors, preview));
        }
        return results;
    }

    private static List<string> ValidateRow(PackingListRawRow row, List<ComponentItem> components, List<InspectionQuotaRef> quotas, out int? previewRequired)
    {
        var errors = new List<string>();
        previewRequired = null;

        if (string.IsNullOrWhiteSpace(row.PackageNumber))
            errors.Add("Номер упаковки (HU) не указан");

        var article = row.Article?.Trim();
        ComponentItem? component = null;
        if (string.IsNullOrEmpty(article))
            errors.Add("Артикул не указан");
        else
        {
            component = components.FirstOrDefault(c => string.Equals(c.Code, article, StringComparison.OrdinalIgnoreCase));
            if (component is null)
                errors.Add($"Артикул «{article}» не найден в справочнике — добавьте его в справочник");
        }

        var quantityText = row.Quantity?.Trim();
        int? quantity = null;
        if (string.IsNullOrEmpty(quantityText))
            errors.Add("Количество не указано");
        else if (!int.TryParse(quantityText, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedQuantity) || parsedQuantity < 1)
            errors.Add("Количество должно быть положительным целым числом");
        else
            quantity = parsedQuantity;

        ValidateOptionalDecimal(row.NetWeight, "Вес нетто", errors);
        ValidateOptionalDecimal(row.GrossWeight, "Вес брутто", errors);

        if (component is not null && quantity is not null)
            previewRequired = ComputeRequiredQuantity(component.Code, quantity.Value, quotas);

        return errors;
    }

    private static int ComputeRequiredQuantity(string componentCode, int plannedQuantity, List<InspectionQuotaRef> quotas)
    {
        var quota = quotas.FirstOrDefault(q => string.Equals(q.ComponentCode, componentCode, StringComparison.OrdinalIgnoreCase));
        if (quota?.FixedCount is int fixedCount)
            return Math.Clamp(fixedCount, 0, plannedQuantity);
        var percent = quota?.Percent ?? 100;
        var required = (int)Math.Ceiling(plannedQuantity * percent / 100.0);
        return Math.Clamp(required, 0, plannedQuantity);
    }

    private static void ValidateOptionalDecimal(string? value, string label, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        if (!TryParseDecimal(value, out _))
            errors.Add($"{label}: не распознано число «{value}»");
    }

    private static bool TryParseDecimal(string? value, out decimal result)
        => decimal.TryParse(value?.Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out result);

    private static bool TryParseDate(string? value, out DateTime result)
        => DateTime.TryParseExact(value?.Trim(), DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out result);

    private static string? Trim(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    // ── EnsureTable ─────────────────────────────────────────────────────────

    // ponytail: auto-create all incoming inspection tables. Idempotent, cheap after first call.
    private async Task EnsureTablesAsync(SqlConnection conn, CancellationToken ct)
    {
        if (_tableEnsured) return;

        await using var cmd = new SqlCommand("""
            IF OBJECT_ID(N'[dbo].[tblIncomingSupplier]', N'U') IS NULL
            BEGIN
                CREATE TABLE [dbo].[tblIncomingSupplier] (
                    [Code] nvarchar(50) NOT NULL,
                    [Name] nvarchar(200) NOT NULL,
                    [IsParentPlant] bit NOT NULL DEFAULT 0,
                    CONSTRAINT [PK_tblIncomingSupplier] PRIMARY KEY ([Code])
                );
            END

            IF OBJECT_ID(N'[dbo].[tblInspectionQuota]', N'U') IS NULL
            BEGIN
                CREATE TABLE [dbo].[tblInspectionQuota] (
                    [ComponentCode] nvarchar(50) NOT NULL,
                    [Percent] int NULL,
                    [FixedCount] int NULL,
                    CONSTRAINT [PK_tblInspectionQuota] PRIMARY KEY ([ComponentCode])
                );
            END

            IF OBJECT_ID(N'[dbo].[tblIncomingDelivery]', N'U') IS NULL
            BEGIN
                CREATE TABLE [dbo].[tblIncomingDelivery] (
                    [Id] nvarchar(32) NOT NULL,
                    [SupplierCode] nvarchar(50) NOT NULL,
                    [SupplierName] nvarchar(200) NOT NULL,
                    [InvoiceNumber] nvarchar(100) NOT NULL,
                    [InvoiceDate] datetime NOT NULL,
                    [AccompanyingDocument] nvarchar(200) NULL,
                    [CreatedAt] datetime NOT NULL,
                    [CreatedBy] nvarchar(50) NOT NULL,
                    CONSTRAINT [PK_tblIncomingDelivery] PRIMARY KEY ([Id])
                );
            END

            IF OBJECT_ID(N'[dbo].[tblIncomingPackage]', N'U') IS NULL
            BEGIN
                CREATE TABLE [dbo].[tblIncomingPackage] (
                    [Id] int IDENTITY(1,1) NOT NULL,
                    [DeliveryId] nvarchar(32) NOT NULL,
                    [HuNumber] nvarchar(100) NOT NULL,
                    [Status] nvarchar(20) NOT NULL DEFAULT 'Open',
                    [ClosedAt] datetime NULL,
                    [ClosedBy] nvarchar(50) NULL,
                    CONSTRAINT [PK_tblIncomingPackage] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_tblIncomingPackage_Delivery] FOREIGN KEY ([DeliveryId])
                        REFERENCES [dbo].[tblIncomingDelivery]([Id])
                );
            END

            IF OBJECT_ID(N'[dbo].[tblIncomingPackingRow]', N'U') IS NULL
            BEGIN
                CREATE TABLE [dbo].[tblIncomingPackingRow] (
                    [Id] int IDENTITY(1,1) NOT NULL,
                    [PackageId] int NOT NULL,
                    [ComponentCode] nvarchar(50) NOT NULL,
                    [ComponentName] nvarchar(200) NOT NULL,
                    [PlannedQuantity] int NOT NULL,
                    [NetWeight] decimal(18,4) NULL,
                    [GrossWeight] decimal(18,4) NULL,
                    [Batch] nvarchar(100) NULL,
                    [RequiredQuantity] int NOT NULL,
                    [OkQuantity] int NOT NULL DEFAULT 0,
                    [DefectQuantity] int NOT NULL DEFAULT 0,
                    [MismatchQuantity] int NOT NULL DEFAULT 0,
                    [ShortageQuantity] int NOT NULL DEFAULT 0,
                    [DiscrepancyReason] nvarchar(500) NULL,
                    CONSTRAINT [PK_tblIncomingPackingRow] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_tblIncomingPackingRow_Package] FOREIGN KEY ([PackageId])
                        REFERENCES [dbo].[tblIncomingPackage]([Id])
                );
            END
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds };
        await cmd.ExecuteNonQueryAsync(ct);
        _tableEnsured = true;
    }
}
