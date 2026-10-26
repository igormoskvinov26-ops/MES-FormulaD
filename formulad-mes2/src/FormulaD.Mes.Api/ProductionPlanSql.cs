namespace FormulaD.Mes.Api;

/// <summary>
/// Тексты SELECT-запросов к dbo.tblProductionPlan. Вынесены отдельно, чтобы их
/// можно было проверить тестами без SQL Server.
/// Правила: явный белый список колонок (никакого SELECT *), только параметры,
/// без NOLOCK, пагинация OFFSET/FETCH, сортировка по VIN.
/// </summary>
internal static class ProductionPlanSql
{
    /// <summary>Белый список колонок. Менять только вместе с DTO и docs/DB_CONTRACT.md.</summary>
    internal const string Columns = """
        [VIN], [ID], [ModelArticle], [ModelName], [EngineNumber], [Color],
        [Status], [statusid], [PlannedShipmentDate], [StartDate], [CompleteDate], [FOK_date]
        """;

    /// <summary>
    /// Страница плана. COUNT(*) OVER() отдаёт общее число строк тем же запросом —
    /// второй round-trip ради total не нужен.
    /// </summary>
    internal static string Page(bool filterByVin, bool filterByStatus, bool statusIsNull) => $"""
        SELECT {Columns}, COUNT(*) OVER() AS [TotalRows]
        FROM [dbo].[tblProductionPlan]
        WHERE 1 = 1
        {(filterByVin ? "AND [VIN] LIKE @vin ESCAPE '\\'" : string.Empty)}
        {StatusPredicate(filterByStatus, statusIsNull)}
        ORDER BY [VIN] ASC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
        """;

    internal static string ByVin() => $"""
        SELECT {Columns}
        FROM [dbo].[tblProductionPlan]
        WHERE [VIN] = @vin;
        """;

    internal static string Statuses() => """
        SELECT DISTINCT [Status]
        FROM [dbo].[tblProductionPlan]
        ORDER BY [Status];
        """;

    private static string StatusPredicate(bool filterByStatus, bool statusIsNull) => filterByStatus
        ? statusIsNull ? "AND [Status] IS NULL" : "AND [Status] = @status"
        : string.Empty;

    /// <summary>Экранирует спецсимволы LIKE, чтобы '%' из ввода не превращался в маску.</summary>
    internal static string LikeContains(string value)
        => "%" + value.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_").Replace("[", "\\[") + "%";
}
