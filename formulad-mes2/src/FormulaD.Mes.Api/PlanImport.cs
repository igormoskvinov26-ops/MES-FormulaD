using System.Globalization;
using System.Text.Json;

namespace FormulaD.Mes.Api;

public sealed record ModelRef(string Article, string Name);

/// <summary>
/// Сырая строка импорта — всё строками, как пришло из файла/вставки (раздел 6.1 спецификации).
/// Разбор и типизация дат происходят при проверке, не при приёме: неверный формат даты —
/// тоже ошибка строки, а не повод отбросить её молча.
/// </summary>
public sealed record ImportRawRow(
    string? Vin,
    string? ModelArticle,
    string? EngineNumber,
    string? Color,
    string? SpecificationName,
    string? PlannedStartDate,
    string? PlannedCompleteDate,
    string? PlannedShipmentDate);

public sealed record ImportRowResult(int RowNumber, ImportRawRow Row, IReadOnlyList<string> Errors)
{
    public bool IsValid => Errors.Count == 0;
}

/// <summary>Сессия загрузки (раздел 6.1, [П]): номер, кто и когда начал, источник, строки с ошибками.</summary>
public sealed record ImportSession(
    string Id,
    DateTime CreatedAt,
    string CreatedBy,
    string Source,
    IReadOnlyList<ImportRowResult> Rows)
{
    public int TotalCount => Rows.Count;
    public int ErrorCount => Rows.Count(r => !r.IsValid);
}

public sealed record PlanReference(IReadOnlyList<ModelRef> Models, IReadOnlyList<string> Colors, IReadOnlyList<string> Specifications);

public sealed record StageImportRequest(IReadOnlyList<ImportRawRow> Rows, string Source);

public enum PublishOutcome { Ok, SessionNotFound, HasErrors }

/// <summary>Готовая к вставке строка плана — даты уже разобраны, название модели уже найдено
/// по артикулу. Собирается только из строк без единой ошибки валидации.</summary>
public sealed record NewPlanRow(
    string Vin,
    string ModelArticle,
    string ModelName,
    string EngineNumber,
    string Color,
    string SpecificationName,
    DateTime? PlannedStartDate,
    DateTime? PlannedCompleteDate,
    DateTime? PlannedShipmentDate);

/// <summary>
/// Публикация провалидированных строк в основной план. Отдельный интерфейс, а не часть
/// <see cref="IPlanImport"/>: публиковать умеет только то, что и так хранит список изделий
/// (<c>DemoProductionPlanReader</c>) — держать вторую копию списка здесь было бы лишним
/// источником истины. Публикатор ничего не знает про справочники и проверки — ему приходят
/// уже готовые строки.
/// </summary>
public interface IPlanPublisher
{
    /// <summary>Добавляет строки в конец очереди одной операцией под общей блокировкой
    /// (раздел 6.3, [П]: «одной транзакцией, частично загруженный план не должен остаться»).</summary>
    Task<int> PublishAsync(IReadOnlyList<NewPlanRow> rows, string userName, CancellationToken ct);
}

/// <summary>
/// Импорт производственного плана (раздел 6 спецификации, Этап 8 плана разработки). Источник
/// сырых строк (файл, вставка, в будущем — 1С, см. docs/INTEGRATION_1C.md) эту часть не
/// волнует: сюда уже приходит разобранный список строк одинаковой формы, дальше конвейер общий.
/// Реализовано ТОЛЬКО для демо-источника.
/// </summary>
public interface IPlanImport
{
    Task<PlanReference> GetReferenceAsync(CancellationToken ct);
    Task<ImportSession> StageAsync(IReadOnlyList<ImportRawRow> rows, string source, string userName, CancellationToken ct);
    Task<ImportSession?> GetSessionAsync(string sessionId, CancellationToken ct);

    /// <summary>Исправление строки «прямо в строке» (раздел 6.2) — заменяет сырую строку и
    /// заново проверяет ВСЮ сессию (простой и надёжный способ не упустить ошибки дублей
    /// VIN/двигателя между строками после правки).</summary>
    Task<ImportSession?> ReplaceRowAsync(string sessionId, int rowNumber, ImportRawRow updated, string userName, CancellationToken ct);

    Task<(PublishOutcome Outcome, int Published)> PublishAsync(string sessionId, string userName, CancellationToken ct);
}

public sealed class DemoPlanImport : IPlanImport
{
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web) { PropertyNameCaseInsensitive = true };

    private static readonly string[] DateFormats = ["yyyy-MM-dd", "dd.MM.yyyy", "yyyy-MM-ddTHH:mm:ss"];

    private readonly Lazy<PlanReference> _reference;
    private readonly IProductionPlanReader _plan;
    private readonly IPlanPublisher _publisher;
    private readonly IEventLog _eventLog;
    private readonly Lock _gate = new();
    private readonly Dictionary<string, ImportSession> _sessions = new();

    public DemoPlanImport(string modelsPath, string colorsPath, string specificationsPath,
        IProductionPlanReader plan, IPlanPublisher publisher, IEventLog eventLog)
    {
        _reference = new(() => new PlanReference(
            Load<ModelRef>(modelsPath), Load<string>(colorsPath), Load<string>(specificationsPath)));
        _plan = plan;
        _publisher = publisher;
        _eventLog = eventLog;
    }

    private static List<T> Load<T>(string path)
    {
        using var stream = File.OpenRead(path);
        return JsonSerializer.Deserialize<List<T>>(stream, JsonOptions)
               ?? throw new InvalidOperationException($"Демо-справочник пуст или нечитаем: {path}");
    }

    public Task<PlanReference> GetReferenceAsync(CancellationToken ct) => Task.FromResult(_reference.Value);

    public async Task<ImportSession> StageAsync(IReadOnlyList<ImportRawRow> rows, string source, string userName, CancellationToken ct)
    {
        var validated = await ValidateAllAsync(rows, ct);
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
        {
            return null;
        }

        var rawRows = existing.Rows
            .Select(r => r.RowNumber == rowNumber ? updated : r.Row)
            .ToList();
        var validated = await ValidateAllAsync(rawRows, ct);
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
        {
            return (PublishOutcome.SessionNotFound, 0);
        }
        if (session.ErrorCount > 0)
        {
            return (PublishOutcome.HasErrors, 0);
        }

        var reference = _reference.Value;
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
            // Сессию убираем сразу: повторное нажатие «Опубликовать» для того же id
            // получит «загрузка не найдена», а не второй набор строк (раздел 6.3, [П]).
            _sessions.Remove(sessionId);
        }
        _eventLog.Record("PlanImport", sessionId, "Publish", null, $"{published} строк", userName);
        return (PublishOutcome.Ok, published);
    }

    private async Task<IReadOnlyList<ImportRowResult>> ValidateAllAsync(IReadOnlyList<ImportRawRow> rows, CancellationToken ct)
    {
        var reference = _reference.Value;
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
        {
            errors.Add("VIN не указан");
        }
        else if (vin.Length > 50)
        {
            errors.Add("VIN длиннее 50 символов");
        }
        else
        {
            if (!seenVins.Add(vin))
            {
                errors.Add("VIN повторяется в этой загрузке");
            }
            // Раздел 6.3, В-09: совпадение с уже существующим изделием — всегда ошибка.
            if (await _plan.GetByVinAsync(vin, ct) is not null)
            {
                errors.Add("VIN уже есть в производственном плане");
            }
        }

        var engine = row.EngineNumber?.Trim();
        if (string.IsNullOrEmpty(engine))
        {
            errors.Add("Номер двигателя не указан");
        }
        else if (engine.Length > 50)
        {
            errors.Add("Номер двигателя длиннее 50 символов");
        }
        else if (!seenEngines.Add(engine))
        {
            errors.Add("Номер двигателя повторяется в этой загрузке");
        }

        var article = row.ModelArticle?.Trim();
        if (string.IsNullOrEmpty(article))
        {
            errors.Add("Модель не указана");
        }
        else if (!reference.Models.Any(m => string.Equals(m.Article, article, StringComparison.OrdinalIgnoreCase)))
        {
            errors.Add($"Неизвестный артикул модели «{article}»");
        }

        var color = row.Color?.Trim();
        if (string.IsNullOrEmpty(color))
        {
            errors.Add("Цвет не указан");
        }
        else if (!reference.Colors.Contains(color, StringComparer.OrdinalIgnoreCase))
        {
            errors.Add($"Цвет «{color}» отсутствует в справочнике");
        }

        var spec = row.SpecificationName?.Trim();
        if (string.IsNullOrEmpty(spec))
        {
            errors.Add("Комплектация не указана");
        }
        else if (!reference.Specifications.Contains(spec, StringComparer.OrdinalIgnoreCase))
        {
            errors.Add($"Комплектация «{spec}» отсутствует в справочнике");
        }

        ValidateOptionalDate(row.PlannedStartDate, "Дата старта (план)", errors);
        ValidateOptionalDate(row.PlannedCompleteDate, "Дата завершения (план)", errors);
        ValidateOptionalDate(row.PlannedShipmentDate, "Дата отгрузки (план)", errors);

        return errors;
    }

    private static void ValidateOptionalDate(string? value, string label, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(value)) return; // плановые даты необязательны
        if (!TryParseDate(value, out _))
        {
            errors.Add($"{label}: не распознана дата «{value}»");
        }
    }

    internal static bool TryParseDate(string? value, out DateTime result)
        => DateTime.TryParseExact(value?.Trim(), DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out result);
}
