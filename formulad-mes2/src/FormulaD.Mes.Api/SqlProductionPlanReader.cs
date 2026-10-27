using System.Data;
using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

/// <summary>
/// Чтение производственного плана из TEST-экземпляра SQL Server.
/// Только SELECT, только параметры, без NOLOCK и без динамических имён объектов.
/// Класс физически не содержит кода изменения данных.
/// </summary>
public sealed class SqlProductionPlanReader(SqlOptions options) : IProductionPlanReader
{
    public async Task<PagedResult<ProductionPlanItem>> GetPageAsync(ProductionPlanQuery query, CancellationToken ct)
    {
        var filterByVin = !string.IsNullOrWhiteSpace(query.Vin);
        var filterByStatus = query.Status is not null;
        var statusIsNull = query.Status is { Length: 0 };

        await using var connection = await OpenAsync(ct);
        await using var command = new SqlCommand(ProductionPlanSql.Page(filterByVin, filterByStatus, statusIsNull), connection)
        {
            CommandTimeout = options.CommandTimeoutSeconds,
        };

        if (filterByVin)
        {
            command.Parameters.Add("@vin", SqlDbType.NVarChar, 101).Value = ProductionPlanSql.LikeStartsWith(query.Vin!.Trim());
        }
        if (filterByStatus && !statusIsNull)
        {
            command.Parameters.Add("@status", SqlDbType.NVarChar, 50).Value = query.Status!;
        }
        command.Parameters.Add("@offset", SqlDbType.Int).Value = (query.Page - 1) * query.PageSize;
        command.Parameters.Add("@pageSize", SqlDbType.Int).Value = query.PageSize;

        var items = new List<ProductionPlanItem>(query.PageSize);
        var total = 0;

        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleResult, ct);
        while (await reader.ReadAsync(ct))
        {
            items.Add(Map(reader));
            total = reader.GetInt32(reader.GetOrdinal("TotalRows"));
        }

        return new PagedResult<ProductionPlanItem>(items, query.Page, query.PageSize, total);
    }

    public async Task<ProductionPlanItem?> GetByVinAsync(string vin, CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = new SqlCommand(ProductionPlanSql.ByVin(), connection)
        {
            CommandTimeout = options.CommandTimeoutSeconds,
        };
        command.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = vin;

        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, ct);
        return await reader.ReadAsync(ct) ? Map(reader) : null;
    }

    public async Task<IReadOnlyList<string?>> GetStatusesAsync(CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = new SqlCommand(ProductionPlanSql.Statuses(), connection)
        {
            CommandTimeout = options.CommandTimeoutSeconds,
        };

        var statuses = new List<string?>();
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleResult, ct);
        while (await reader.ReadAsync(ct))
        {
            statuses.Add(reader.IsDBNull(0) ? null : reader.GetString(0));
        }
        return statuses;
    }

    private async Task<SqlConnection> OpenAsync(CancellationToken ct)
    {
        var connection = new SqlConnection(options.ConnectionString);
        await connection.OpenAsync(ct);
        return connection;
    }

    private static ProductionPlanItem Map(SqlDataReader reader) => new(
        Vin: reader.GetString(reader.GetOrdinal("VIN")),
        Id: reader.GetInt32(reader.GetOrdinal("ID")),
        ModelArticle: GetNullableString(reader, "ModelArticle"),
        ModelName: GetNullableString(reader, "ModelName"),
        EngineNumber: GetNullableString(reader, "EngineNumber"),
        Color: GetNullableString(reader, "Color"),
        Status: GetNullableString(reader, "Status"),
        StatusId: GetNullableInt(reader, "statusid"),
        // datetime без зоны отдаём как есть: политика часовых поясов не согласована.
        PlannedShipmentDate: GetNullableDate(reader, "PlannedShipmentDate"),
        StartDate: GetNullableDate(reader, "StartDate"),
        CompleteDate: GetNullableDate(reader, "CompleteDate"),
        FokDate: GetNullableDate(reader, "FOK_date"));

    private static string? GetNullableString(SqlDataReader reader, string column)
    {
        var ordinal = reader.GetOrdinal(column);
        return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    }

    private static int? GetNullableInt(SqlDataReader reader, string column)
    {
        var ordinal = reader.GetOrdinal(column);
        return reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);
    }

    private static DateTime? GetNullableDate(SqlDataReader reader, string column)
    {
        var ordinal = reader.GetOrdinal(column);
        return reader.IsDBNull(ordinal) ? null : reader.GetDateTime(ordinal);
    }
}
