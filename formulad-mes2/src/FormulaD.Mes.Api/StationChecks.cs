namespace FormulaD.Mes.Api;

/// <summary>
/// Отметка проверки компонента на конкретном изделии (раздел 11.2 спецификации): «проверенная
/// позиция должна иметь сохраняемую отметку, связанную с конкретным изделием, станцией,
/// пользователем и временем». Станция здесь не хранится отдельно — она уже есть у компонента
/// в справочнике (<see cref="ComponentItem.Station"/>), дублировать её незачем.
/// </summary>
public sealed record ComponentCheck(string ComponentCode, bool Checked, string? CheckedBy, DateTime? CheckedAt);

public enum SetCheckOutcome { Ok, VinNotFound, ComponentNotFound }

public interface IStationChecks
{
    /// <summary>Отметки по изделию, ключ — код компонента. Компонент без отметки в словаре не
    /// значит ошибку — значит «ещё не проверялся» (раздел 203, [П]: история не стирается, но
    /// начальное состояние — просто отсутствие записи).</summary>
    Task<IReadOnlyDictionary<string, ComponentCheck>> GetForVinAsync(string vin, CancellationToken ct);

    Task<(SetCheckOutcome Outcome, ComponentCheck? Updated)> SetCheckedAsync(
        string vin, string componentCode, bool @checked, string author, CancellationToken ct);
}

/// <summary>Демо-хранилище отметок в памяти процесса — как и остальные писатели Этапов 1-4.</summary>
public sealed class DemoStationChecks : IStationChecks
{
    private readonly Lock _gate = new();
    private readonly Dictionary<string, ComponentCheck> _checks = new(StringComparer.OrdinalIgnoreCase);
    private readonly IProductionPlanReader _plan;
    private readonly INcpReader _components;
    private readonly IEventLog _eventLog;

    public DemoStationChecks(IProductionPlanReader plan, INcpReader components, IEventLog eventLog)
    {
        _plan = plan;
        _components = components;
        _eventLog = eventLog;
    }

    private static string Key(string vin, string code) => $"{vin.Trim().ToUpperInvariant()}|{code.Trim().ToUpperInvariant()}";

    public Task<IReadOnlyDictionary<string, ComponentCheck>> GetForVinAsync(string vin, CancellationToken ct)
    {
        var prefix = $"{vin.Trim().ToUpperInvariant()}|";
        lock (_gate)
        {
            IReadOnlyDictionary<string, ComponentCheck> result = _checks
                .Where(kv => kv.Key.StartsWith(prefix, StringComparison.Ordinal))
                .ToDictionary(kv => kv.Value.ComponentCode, kv => kv.Value, StringComparer.OrdinalIgnoreCase);
            return Task.FromResult(result);
        }
    }

    public async Task<(SetCheckOutcome, ComponentCheck?)> SetCheckedAsync(
        string vin, string componentCode, bool @checked, string author, CancellationToken ct)
    {
        if (await _plan.GetByVinAsync(vin, ct) is null)
        {
            return (SetCheckOutcome.VinNotFound, null);
        }
        var components = await _components.GetComponentsAsync(ct);
        var component = components.FirstOrDefault(c => string.Equals(c.Code, componentCode, StringComparison.OrdinalIgnoreCase));
        if (component is null)
        {
            return (SetCheckOutcome.ComponentNotFound, null);
        }

        lock (_gate)
        {
            var key = Key(vin, componentCode);
            var wasChecked = _checks.TryGetValue(key, out var existing) && existing.Checked;
            var updated = @checked
                ? new ComponentCheck(component.Code, true, author, DateTime.Now)
                : new ComponentCheck(component.Code, false, null, null);
            _checks[key] = updated;

            if (wasChecked != @checked)
            {
                _eventLog.Record("StationCheck", $"{vin}/{component.Code}", @checked ? "Checked" : "Unchecked",
                    wasChecked.ToString(), @checked.ToString(), author);
            }
            return (SetCheckOutcome.Ok, updated);
        }
    }
}
