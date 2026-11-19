using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

public sealed class CalendarTests
{
    [Theory]
    [InlineData("/api/v1/calendar")]
    public async Task Calendar_Requires_Auth(string path)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task Put_Without_Auth_Is_Rejected()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var response = await factory.CreateClient().PutAsJsonAsync("/api/v1/calendar/days", new ApplyCalendarRequest([new("2026-11-09", "off", null, null, null)]));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Get_Returns_Default_Settings_And_No_Days()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var state = await client.GetFromJsonAsync<CalendarState>("/api/v1/calendar");
        Assert.NotNull(state);
        Assert.Equal(8, state.Settings.PerShift);
        Assert.Equal([1, 2, 3, 4, 5], state.Settings.Workdays);
        Assert.Empty(state.Days);
    }

    [Fact]
    public async Task Apply_Sets_Replaces_And_Resets_Days()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var set = await client.PutAsJsonAsync("/api/v1/calendar/days", new ApplyCalendarRequest([
            new("2026-11-09", "off", null, null, "Праздник"),
            new("2026-11-14", "work", "09:00", "15:00", "Перенос"),
        ]));
        Assert.Equal(HttpStatusCode.OK, set.StatusCode);
        var state = await set.Content.ReadFromJsonAsync<CalendarState>();
        Assert.Equal(2, state!.Days.Count);
        Assert.Equal("off", state.Days.Single(d => d.Date == "2026-11-09").Kind);
        Assert.Equal("15:00", state.Days.Single(d => d.Date == "2026-11-14").To);

        var reset = await client.PutAsJsonAsync("/api/v1/calendar/days", new ApplyCalendarRequest([new("2026-11-09", null, null, null, null)]));
        var after = await reset.Content.ReadFromJsonAsync<CalendarState>();
        Assert.Single(after!.Days);

        var persisted = await client.GetFromJsonAsync<CalendarState>("/api/v1/calendar");
        Assert.Single(persisted!.Days);
    }

    [Theory]
    [InlineData("2026-13-40", "off", null, null)]
    [InlineData("09.11.2026", "off", null, null)]
    [InlineData("2026-11-09", "holiday", null, null)]
    [InlineData("2026-11-09", "off", "08:00", "17:00")]
    [InlineData("2026-11-09", "work", "17:00", "08:00")]
    [InlineData("2026-11-09", "work", "08:00", null)]
    [InlineData("2026-11-09", "work", "8:00", "17:00")]
    [InlineData("1999-01-01", "off", null, null)]
    public async Task Invalid_Change_Is_Rejected_And_Nothing_Is_Saved(string date, string kind, string? from, string? to)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var response = await client.PutAsJsonAsync("/api/v1/calendar/days", new ApplyCalendarRequest([
            new("2026-11-10", "off", null, null, null), new(date, kind, from, to, null)]));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<CalendarState>("/api/v1/calendar"))!.Days); // «всё или ничего»
    }

    [Fact]
    public async Task Too_Many_Changes_And_Empty_Request_Are_Rejected()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var many = Enumerable.Range(0, ProductionCalendarStore.MaxChangesPerRequest + 1)
            .Select(i => new CalendarDayChange(new DateOnly(2026, 1, 1).AddDays(i).ToString("yyyy-MM-dd"), "off", null, null, null)).ToList();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/v1/calendar/days", new ApplyCalendarRequest(many))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/v1/calendar/days", new ApplyCalendarRequest([]))).StatusCode);
    }

    [Fact]
    public void File_Store_Survives_Restart()
    {
        var path = Path.Combine(Path.GetTempPath(), $"mes-calendar-{Guid.NewGuid():N}.json");
        try
        {
            var first = new ProductionCalendarStore(path, new InMemoryEventLog());
            Assert.Null(first.Apply([new("2026-12-31", "off", null, null, "Новый год")], "test", out _));

            var second = new ProductionCalendarStore(path, new InMemoryEventLog());
            Assert.Equal("Новый год", second.Get().Days.Single().Note);
        }
        finally { File.Delete(path); }
    }
}

public sealed class CalendarSettingsTests
{
    private static CalendarSettings Valid(Func<CalendarSettings, CalendarSettings>? edit = null)
    {
        var s = new CalendarSettings([1, 2, 3, 4, 5], "08:00", "17:00", [new CalendarBreak("12:00", "13:00")], 8);
        return edit is null ? s : edit(s);
    }

    [Fact]
    public async Task Settings_Require_Auth()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().PutAsJsonAsync("/api/v1/calendar/settings", Valid())).StatusCode);
    }

    [Fact]
    public async Task Settings_Are_Saved_Normalised_And_Returned_By_Get()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var response = await client.PutAsJsonAsync("/api/v1/calendar/settings", Valid(s => s with
        {
            Workdays = [6, 1, 3, 3], ShiftStart = "07:30", ShiftEnd = "19:30", PerShift = 12,
            Breaks = [new CalendarBreak("15:00", "15:30"), new CalendarBreak("12:00", "13:00")],
        }));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var state = await client.GetFromJsonAsync<CalendarState>("/api/v1/calendar");
        Assert.Equal([1, 3, 6], state!.Settings.Workdays);
        Assert.Equal("07:30", state.Settings.ShiftStart);
        Assert.Equal(12, state.Settings.PerShift);
        Assert.Equal(["12:00", "15:00"], state.Settings.Breaks.Select(b => b.From).ToArray());
    }

    public static IEnumerable<object[]> Invalid() =>
    [
        [Valid(s => s with { Workdays = [] })],
        [Valid(s => s with { Workdays = [0, 1] })],
        [Valid(s => s with { Workdays = [8] })],
        [Valid(s => s with { ShiftStart = "17:00", ShiftEnd = "08:00" })],
        [Valid(s => s with { ShiftStart = "8:00" })],
        [Valid(s => s with { Breaks = [new CalendarBreak("07:00", "08:30")] })],
        [Valid(s => s with { Breaks = [new CalendarBreak("13:00", "12:00")] })],
        [Valid(s => s with { Breaks = [new CalendarBreak("12:00", "13:00"), new CalendarBreak("12:30", "13:30")] })],
        [Valid(s => s with { Breaks = [new CalendarBreak("08:00", "17:00")] })],
        [Valid(s => s with { Breaks = Enumerable.Range(9, 5).Select(h => new CalendarBreak($"{h:00}:00", $"{h:00}:10")).ToArray() })],
        [Valid(s => s with { PerShift = 0 })],
        [Valid(s => s with { PerShift = 501 })],
        [Valid(s => s with { PerShift = 500, ShiftStart = "08:00", ShiftEnd = "10:00", Breaks = [] })],
    ];

    [Theory]
    [MemberData(nameof(Invalid))]
    public async Task Invalid_Settings_Are_Rejected_And_Previous_Kept(CalendarSettings bad)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/v1/calendar/settings", bad)).StatusCode);
        Assert.Equal(8, (await client.GetFromJsonAsync<CalendarState>("/api/v1/calendar"))!.Settings.PerShift);
    }

    [Fact]
    public void File_Store_Keeps_Settings_And_Days_And_Reads_The_Old_Days_Only_Format()
    {
        var path = Path.Combine(Path.GetTempPath(), $"mes-calendar-{Guid.NewGuid():N}.json");
        try
        {
            var first = new ProductionCalendarStore(path, new InMemoryEventLog());
            Assert.Null(first.ApplySettings(Valid(s => s with { PerShift = 6 }), "test", out _));
            Assert.Null(first.Apply([new("2026-12-31", "off", null, null, "Новый год")], "test", out _));

            var second = new ProductionCalendarStore(path, new InMemoryEventLog());
            Assert.Equal(6, second.Get().Settings.PerShift);
            Assert.Single(second.Get().Days);

            // файл прежнего формата (только список дней) читается, настройки — по умолчанию
            File.WriteAllText(path, "[{\"date\":\"2026-05-01\",\"kind\":\"off\",\"from\":null,\"to\":null,\"note\":null}]");
            var legacy = new ProductionCalendarStore(path, new InMemoryEventLog());
            Assert.Equal(8, legacy.Get().Settings.PerShift);
            Assert.Equal("2026-05-01", legacy.Get().Days.Single().Date);
        }
        finally { File.Delete(path); }
    }
}

public sealed class ControlPostSettingsTests
{
    private static CalendarSettings With(ControlPost[]? posts)
        => new([1, 2, 3, 4, 5], "08:00", "17:00", [new CalendarBreak("12:00", "13:00")], 8, posts);

    [Fact]
    public async Task Control_Posts_Are_Saved_Trimmed_And_Default_Is_Empty()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        Assert.Empty((await client.GetFromJsonAsync<CalendarState>("/api/v1/calendar"))!.Settings.ControlPosts!);

        var response = await client.PutAsJsonAsync("/api/v1/calendar/settings", With([new ControlPost(" Пост 1 ", " 4 "), new ControlPost("Пост 2", "8")]));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var posts = (await client.GetFromJsonAsync<CalendarState>("/api/v1/calendar"))!.Settings.ControlPosts!;
        Assert.Equal(["Пост 1", "Пост 2"], posts.Select(p => p.Name).ToArray());
        Assert.Equal(["4", "8"], posts.Select(p => p.AfterStation).ToArray());
    }

    [Fact]
    public async Task Settings_Without_Control_Posts_Field_Are_Accepted_As_No_Posts()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var response = await client.PutAsJsonAsync("/api/v1/calendar/settings",
            new { workdays = new[] { 1, 2 }, shiftStart = "08:00", shiftEnd = "17:00", breaks = Array.Empty<object>(), perShift = 8 });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    public static IEnumerable<object[]> Invalid() =>
    [
        [With([new ControlPost("", "4")])],
        [With([new ControlPost("   ", "4")])],
        [With([new ControlPost(new string('я', 41), "4")])],
        [With([new ControlPost("Пост", "")])],
        [With([new ControlPost("Пост", "12345678901")])],
        [With(Enumerable.Range(1, 11).Select(i => new ControlPost($"П{i}", "1")).ToArray())],
    ];

    [Theory]
    [MemberData(nameof(Invalid))]
    public async Task Invalid_Control_Posts_Are_Rejected(CalendarSettings bad)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/v1/calendar/settings", bad)).StatusCode);
    }
}
