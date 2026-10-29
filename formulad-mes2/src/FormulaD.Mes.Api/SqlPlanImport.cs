using System.Data;
using System.Globalization;
using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

/// <summary>
/// SQL-реализация импорта плана. Справочники моделей/цветов/комплектаций извлекаются
/// из существующих данных tblProductionPlan (DISTINCT). Сессии загрузки — в памяти
/// (эфемерные, пропадают при рестарте — это ожидаемо, раздел 6.1).
/// Финальный INSERT делегируется <see cref="IPlanPublisher"/> (уже SqlPlanPublisher).
///
/// ponytail: справочники из DISTINCT — ленивый, но правильный подход: не нужна
/// отдельная таблица моделей, а список растёт автоматически с данными.
/// Если бизнес потребует фиксированный справочник — добавить таблицу.
/// </summary>
public sealed class SqlPlanImport : IPlanImport
{
    private static readonly string[] DateFormats = ["yyyy-MM-dd", "dd.MM.yyyy", "yyyy-MM-ddTHH:mm:ss"];

    private readonly SqlOptions _options;
    private readonly IProductionPlanReader _plan;
    private readonly IPlanPublisher _publisher;
    private readonly IEventLog _eventLog;
    private readonly Lock _gate = new();
    private readonly Dictionary<string, ImportSession> _sessions = new();

    public SqlPlanImport(SqlOptions options, IProductionPlanReader plan, IPlanPublisher publisher, IEventLog eventLog)
    {
        _options = options;
        _plan = plan;
        _publisher = publisher;
        _eventLog = eventLog;
    }

    public async Task<PlanReference> GetReferenceAsync(CancellationToken ct)
    {
        await using var conn = new SqlConnection(_options.ConnectionString);
        await conn.OpenAsync(ct);

        var models = new List<ModelRef>();
        await using (var cmd = new SqlCommand("""
            SELECT DISTINCT [ModelArticle], [ModelName]
            FROM [dbo].[tblProductionPlan]
            WHERE [ModelArticle] IS NOT NULL AND [ModelArticle] <> ''
            ORDER BY [ModelArticle]
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds })
        {
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
                models.Add(new ModelRef(r.GetString(0), r.IsDBNull(1) ? r.GetString(0) : r.GetString(1)));
        }

        var colors = new List<string>();
        await using (var cmd = new SqlCommand("""
            SELECT DISTINCT [Color]
            FROM [dbo].[tblProductionPlan]
            WHERE [Color] IS NOT NULL AND [Color] <> ''
            ORDER BY [Color]
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds })
        {
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
                colors.Add(r.GetString(0));
        }

        var specs = new List<string>();
        await using (var cmd = new SqlCommand("""
            SELECT DISTINCT [SpecificationName]
            FROM [dbo].[tblProductionPlan]
            WHERE [SpecificationName] IS NOT NULL AND [SpecificationName] <> ''
            ORDER BY [SpecificationName]
            """, conn) { CommandTimeout = _options.CommandTimeoutSeconds })
        {
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
                specs.Add(r.GetString(0));
        }

        return new PlanReference(models, colors, specs);
    }

    public async Task<ImportSession> StageAsync(IReadOnlyList<ImportRawRow> rows, string source, string userName, CancellationToken ct)
    {
        var reference = await GetReferenceAsync(ct);
        var validated = await ValidateAllAsync(rows, reference, ct);
        var session = new ImportSession(Guid.NewGuid().ToString("N"), DateTime.Now, userName, source, validated);
        lock (_gate)
        {
            _sessions[session.Id] = session;
        }
        _eventLog.Record("PlanImport", session.Id, "Stage", null, $"{session.TotalCount} строк, {session.ErrorCount} с ошибками", userName);
        return session;
    }

    public Task<ImportSession?> GetSessionAsync(string sessionId, CancellationToken ct)
    {
        lock (_gate)
        {
            return Task.FromResult(_sessions.GetValueOrDefault(sessionId));
        }
    }

    public async Task<ImportSession?> ReplaceRowAsync(string sessionId, int rowNumber, ImportRawRow updated, string userName, CancellationToken ct)
    {
        ImportSession? existing;
        lock (_gate)
        {
            _sessions.TryGetValue(sessionId, out existing);
        }
        if (existing is null || existing.Rows.All(r => r.RowNumber != rowNumber))
            return null;

        var reference = await GetReferenceAsync(ct);
        var rawRows = existing.Rows
            .Select(r => r.RowNumber == rowNumber ? updated : r.Row)
            .ToList();
        var validated = await ValidateAllAsync(rawRows, reference, ct);
        var session = existing with { Rows = validated };
        lock (_gate)
        {
            _sessions[sessionId] = session;
        }
        _eventLog.Record("PlanImport", sessionId, "EditRow", null, $"строка {rowNumber}", userName);
        return session;
    }

    public async Task<(PublishOutcome, int)> PublishAsync(string sessionId, string userName, CancellationToken ct)
    {
        ImportSession? session;
        lock (_gate)
        {
            _sessions.TryGetValue(sessionId, out session);
        }
        if (session is null)
            return (PublishOutcome.SessionNotFound, 0);
        if (session.ErrorCount > 0)
            return (PublishOutcome.HasErrors, 0);

        var reference = await GetReferenceAsync(ct);
        var newRows = session.Rows.Select(r =>
        {
            var row = r.Row;
            var model = reference.Models.First(m => string.Equals(m.Article, row.ModelArticle!.Trim(), StringComparison.OrdinalIgnoreCase));
            TryParseDate(row.PlannedStartDate, out var start);
            TryParseDate(row.PlannedCompleteDate, out var complete);
            TryParseDate(row.PlannedShipmentDate, out var shipment);
            return new NewPlanRow(
                row.Vin!.Trim(), model.Article, model.Name, row.EngineNumber!.Trim(), row.Color!.Trim(), row.SpecificationName!.Trim(),
                string.IsNullOrWhiteSpace(row.PlannedStartDate) ? null : start,
                string.IsNullOrWhiteSpace(row.PlannedCompleteDate) ? null : complete,
                string.IsNullOrWhiteSpace(row.PlannedShipmentDate) ? null : shipment);
        }).ToList();

        var published = await _publisher.PublishAsync(newRows, userName, ct);
        lock (_gate)
        {
            _sessions.Remove(sessionId);
        }
        _eventLog.Record("PlanImport", sessionId, "Publish", null, $"{published} строк", userName);
        return (PublishOutcome.Ok, published);
    }

    private async Task<IReadOnlyList<ImportRowResult>> ValidateAllAsync(
        IReadOnlyList<ImportRawRow> rows, PlanReference reference, CancellationToken ct)
    {
        var seenVins = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenEngines = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var results = new List<ImportRowResult>(rows.Count);

        for (var i = 0; i < rows.Count; i++)
        {
            var errors = await ValidateRowAsync(rows[i], reference, seenVins, seenEngines, ct);
            results.Add(new ImportRowResult(i + 1, rows[i], errors));
        }
        return results;
    }

    private async Task<List<string>> ValidateRowAsync(
        ImportRawRow row, PlanReference reference, HashSet<string> seenVins, HashSet<string> seenEngines, CancellationToken ct)
    {
        var errors = new List<string>();

        var vin = row.Vin?.Trim();
        if (string.IsNullOrEmpty(vin))
            errors.Add("VIN не указан");
        else if (vin.Length > 50)
            errors.Add("VIN длиннее 50 символов");
        else
        {
            if (!seenVins.Add(vin))
                errors.Add("VIN повторяется в этой загрузке");
            if (await _plan.GetByVinAsync(vin, ct) is not null)
                errors.Add("VIN уже есть в производственном плане");
        }

        var engine = row.EngineNumber?.Trim();
        if (string.IsNullOrEmpty(engine))
            errors.Add("Номер двигателя не указан");
        else if (engine.Length > 50)
            errors.Add("Номер двигателя длиннее 50 символов");
        else if (!seenEngines.Add(engine))
            errors.Add("Номер двигателя повторяется в этой загрузке");

        var article = row.ModelArticle?.Trim();
        if (string.IsNullOrEmpty(article))
            errors.Add("Модель не указана");
        else if (!reference.Models.Any(m => string.Equals(m.Article, article, StringComparison.OrdinalIgnoreCase)))
            errors.Add($"Неизвестный артикул модели «{article}»");

        var color = row.Color?.Trim();
        if (string.IsNullOrEmpty(color))
            errors.Add("Цвет не указан");
        else if (!reference.Colors.Contains(color, StringComparer.OrdinalIgnoreCase))
            errors.Add($"Цвет «{color}» отсутствует в справочнике");

        var spec = row.SpecificationName?.Trim();
        if (string.IsNullOrEmpty(spec))
            errors.Add("Комплектация не указана");
        else if (!reference.Specifications.Contains(spec, StringComparer.OrdinalIgnoreCase))
            errors.Add($"Комплектация «{spec}» отсутствует в справочнике");

        ValidateOptionalDate(row.PlannedStartDate, "Дата старта (план)", errors);
        ValidateOptionalDate(row.PlannedCompleteDate, "Дата завершения (план)", errors);
        ValidateOptionalDate(row.PlannedShipmentDate, "Дата отгрузки (план)", errors);

        return errors;
    }

    private static void ValidateOptionalDate(string? value, string label, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        if (!TryParseDate(value, out _))
            errors.Add($"{label}: не распознана дата «{value}»");
    }

    internal static bool TryParseDate(string? value, out DateTime result)
        => DateTime.TryParseExact(value?.Trim(), DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out result);
}
