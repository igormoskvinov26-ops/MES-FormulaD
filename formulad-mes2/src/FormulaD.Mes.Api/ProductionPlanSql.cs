namespace FormulaD.Mes.Api;

internal static class ProductionPlanSql
{
    internal const string Columns = """
        p.[VIN], p.[ID], p.[SEQN], p.[ModelArticle], p.[ModelName], p.[EngineNumber], p.[ChassisNumber], p.[Color],
        p.[SpecificationName], p.[Status], p.[statusid], p.[PrintDate], p.[plannedstartdate],
        p.[PlannedShipmentDate], p.[StartDate], p.[CompleteDate], p.[FOK_date],
        (SELECT COUNT(*) FROM [dbo].[tblNCP] n WHERE n.[VIN] = p.[VIN] AND n.[PartInstalled] = 0) AS [OpenNcpCount]
        """;

    internal static string Page(bool filterByVin, bool filterByStatus, bool statusIsNull, bool filterByStatusId) => $"""
        SELECT {Columns}, COUNT(*) OVER() AS [TotalRows]
        FROM [dbo].[tblProductionPlan] p
        WHERE 1 = 1
        {(filterByVin ? "AND p.[VIN] LIKE @vin ESCAPE '\\\\'" : string.Empty)}
        {StatusPredicate(filterByStatus, statusIsNull)}
        {(filterByStatusId ? "AND p.[statusid] = @statusId" : string.Empty)}
        ORDER BY {OrderBy}
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
        """;

    internal const string OrderBy = "CASE WHEN p.[SEQN] IS NULL THEN 1 ELSE 0 END, p.[SEQN] ASC, p.[VIN] ASC";

    internal static string ByVin() => $"""
        SELECT {Columns}
        FROM [dbo].[tblProductionPlan] p
        WHERE p.[VIN] = @vin;
        """;

    internal static string Statuses() => """
        SELECT DISTINCT [Status]
        FROM [dbo].[tblProductionPlan]
        ORDER BY [Status];
        """;

    private static string StatusPredicate(bool filterByStatus, bool statusIsNull) => filterByStatus
        ? statusIsNull ? "AND p.[Status] IS NULL" : "AND p.[Status] = @status"
        : string.Empty;

    internal static string LikeStartsWith(string value) => Escape(value) + "%";
    internal static string LikeEndsWith(string value) => "%" + Escape(value);

    private static string Escape(string value)
        => value.Replace("\\\\", "\\\\\\\\").Replace("%", "\\\\%").Replace("_", "\\\\_").Replace("[", "\\\\[");
}
