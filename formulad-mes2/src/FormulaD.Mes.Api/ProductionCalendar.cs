using System.Globalization;
using System.Text.Json;

namespace FormulaD.Mes.Api;

public sealed record CalendarBreak(string From, string To);
public sealed record ControlPost(string Name, string AfterStation);
public sealed record CalendarSettings(int[] Workdays, string ShiftStart, string ShiftEnd, CalendarBreak[] Breaks, int PerShift, ControlPost[]? ControlPosts = null);
public sealed record CalendarDay(string Date, string Kind, string? From, string? To, string? Note);
public sealed record CalendarState(CalendarSettings Settings, IReadOnlyList<CalendarDay> Days);
public sealed record CalendarDayChange(string Date, string? Kind, string? From, string? To, string? Note);
public sealed record ApplyCalendarRequest(IReadOnlyList<CalendarDayChange> Changes);

public interface IProductionCalendarStore
{
    CalendarState Get();
    string? Apply(IReadOnlyList<CalendarDayChange> changes, string author, out CalendarState state);
    string? ApplySettings(CalendarSettings settings, string author, out CalendarState state);
}

public sealed class ProductionCalendarStore : IProductionCalendarStore
{
    public const int MaxChangesPerRequest = 400;
    public static readonly CalendarSettings DefaultSettings = new([1, 2, 3, 4, 5], "08:00", "17:00", [new("12:00", "13:00")], 8, []);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly Lock _gate = new();
    private readonly string? _path;
    private readonly IEventLog _eventLog;
    private readonly SortedDictionary<string, CalendarDay> _days = new(StringComparer.Ordinal);
    private CalendarSettings _settings = DefaultSettings;
    private sealed record StoredCalendar(CalendarSettings? Settings, List<CalendarDay>? Days);

    public ProductionCalendarStore(string? path, IEventLog eventLog)
    {
        _path = path; _eventLog = eventLog;
        if (path is not null && File.Exists(path))
        {
            var text = File.ReadAllText(path);
            using var doc = JsonDocument.Parse(text);
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
            { foreach (var d in JsonSerializer.Deserialize<List<CalendarDay>>(text, JsonOptions) ?? []) _days[d.Date] = d; }
            else
            {
                var stored = JsonSerializer.Deserialize<StoredCalendar>(text, JsonOptions);
                if (stored?.Settings is { } s && ValidateSettings(s) is null) _settings = s with { ControlPosts = s.ControlPosts ?? [] };
                foreach (var d in stored?.Days ?? []) _days[d.Date] = d;
            }
        }
    }

    public string? ApplySettings(CalendarSettings settings, string author, out CalendarState state)
    {
        lock (_gate)
        {
            state = Snapshot();
            var error = ValidateSettings(settings);
            if (error is not null) return error;
            var before = _settings;
            _settings = settings with { Workdays = settings.Workdays.Distinct().Order().ToArray(), Breaks = settings.Breaks.OrderBy(b => b.From, StringComparer.Ordinal).ToArray(), ControlPosts = (settings.ControlPosts ?? []).Select(p => new ControlPost(p.Name.Trim(), p.AfterStation.Trim())).ToArray() };
            _eventLog.Record("Calendar", "settings", "Settings", Describe(before), Describe(_settings), author);
            Save(); state = Snapshot(); return null;
        }
    }

    private static string Describe(CalendarSettings s) => $"{s.ShiftStart}–{s.ShiftEnd}, перерывы {string.Join(", ", s.Breaks.Select(b => $"{b.From}–{b.To}"))}, дни {string.Join("", s.Workdays)}, {s.PerShift} в смену";

    internal static string? ValidateSettings(CalendarSettings s)
    {
        if (s.Workdays is null || s.Workdays.Length == 0 || s.Workdays.Any(d => d is < 1 or > 7)) return "Рабочие дни: номера 1 (пн) … 7 (вс), хотя бы один.";
        if (!TimeOnly.TryParseExact(s.ShiftStart, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var start)
            || !TimeOnly.TryParseExact(s.ShiftEnd, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var end))
            return "Смена: начало и конец в формате ЧЧ:ММ.";
        if (start >= end) return "Начало смены должно быть раньше конца.";
        var breaks = s.Breaks ?? [];
        if (breaks.Length > 4) return "Перерывов не больше четырёх.";
        var parsed = new List<(TimeOnly From, TimeOnly To)>();
        foreach (var b in breaks)
        {
            if (!TimeOnly.TryParseExact(b.From, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var bf)
                || !TimeOnly.TryParseExact(b.To, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var bt))
                return "Перерыв: начало и конец в формате ЧЧ:ММ.";
            if (bf >= bt) return "Начало перерыва должно быть раньше конца.";
            if (bf < start || bt > end) return "Перерыв должен быть внутри смены.";
            parsed.Add((bf, bt));
        }
        parsed.Sort();
        for (var i = 1; i < parsed.Count; i++) if (parsed[i].From < parsed[i - 1].To) return "Перерывы не должны пересекаться.";
        var workMinutes = (end - start).TotalMinutes - parsed.Sum(p => (p.To - p.From).TotalMinutes);
        if (workMinutes <= 0) return "В смене не остаётся рабочего времени.";
        if (s.PerShift is < 1 or > 500) return "Изделий в смену: от 1 до 500.";
        if (s.PerShift > workMinutes) return "Изделий в смену не может быть больше, чем рабочих минут.";
        var posts = s.ControlPosts ?? [];
        if (posts.Length > 10) return "Постов контроля не больше десяти.";
        foreach (var post in posts)
        {
            if (string.IsNullOrWhiteSpace(post.Name) || post.Name.Trim().Length > 40) return "Пост контроля: название от 1 до 40 символов.";
            if (string.IsNullOrWhiteSpace(post.AfterStation) || post.AfterStation.Trim().Length > 10) return "Пост контроля: укажите станцию.";
        }
        return null;
    }

    public CalendarState Get() { lock (_gate) return Snapshot(); }

    public string? Apply(IReadOnlyList<CalendarDayChange> changes, string author, out CalendarState state)
    {
        lock (_gate)
        {
            state = Snapshot();
            if (changes.Count == 0) return "Нет изменений.";
            if (changes.Count > MaxChangesPerRequest) return $"Не более {MaxChangesPerRequest} изменений за раз.";
            foreach (var change in changes) { var error = Validate(change); if (error is not null) return $"{change.Date}: {error}"; }
            foreach (var change in changes)
            {
                _days.TryGetValue(change.Date, out var before);
                if (change.Kind is null) { _days.Remove(change.Date); if (before is not null) _eventLog.Record("Calendar", change.Date, "Reset", Describe(before), null, author); }
                else
                {
                    var after = new CalendarDay(change.Date, change.Kind, change.Kind == "work" ? change.From : null, change.Kind == "work" ? change.To : null, string.IsNullOrWhiteSpace(change.Note) ? null : change.Note.Trim());
                    _days[change.Date] = after;
                    _eventLog.Record("Calendar", change.Date, "Set", before is null ? null : Describe(before), Describe(after), author);
                }
            }
            Save(); state = Snapshot(); return null;
        }
    }

    private static string Describe(CalendarDay d) => d.Kind == "off" ? "выходной" : d.From is null ? "рабочий" : $"рабочий {d.From}–{d.To}";

    internal static string? Validate(CalendarDayChange c)
    {
        if (!DateOnly.TryParseExact(c.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) || date.Year is < 2000 or > 2100) return "Дата должна быть в формате ГГГГ-ММ-ДД (2000–2100).";
        if (c.Kind is null) return null;
        if (c.Kind is not ("off" or "work")) return "Тип дня: «офф» или «work».";
        if (c.Note is { Length: > 100 }) return "Примечание не длиннее 100 символов.";
        if (c.Kind == "off") return c.From is null && c.To is null ? null : "У выходного дня часы не задаются.";
        if (c.From is null && c.To is null) return null;
        if (!TimeOnly.TryParseExact(c.From, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var from)
            || !TimeOnly.TryParseExact(c.To, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var to))
            return "Часы работы — в формате ЧЧ:ММ, оба значения сразу.";
        return from < to ? null : "Начало рабочего дня должно быть раньше конца.";
    }

    private CalendarState Snapshot() => new(_settings, _days.Values.ToList());

    private void Save()
    {
        if (_path is null) return;
        var dir = Path.GetDirectoryName(Path.GetFullPath(_path)); if (dir is not null) Directory.CreateDirectory(dir);
        var temp = _path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(new StoredCalendar(_settings, _days.Values.ToList()), JsonOptions));
        File.Move(temp, _path, overwrite: true);
    }
}
