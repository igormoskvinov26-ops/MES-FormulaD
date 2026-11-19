using System.Net.Http.Json;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

public sealed class EventLogTests
{
    [Fact]
    public void Record_And_Query_Round_Trips()
    {
        var log = new InMemoryEventLog();
        log.Record("Ncp", "NC-2026-0099", "Create", null, "Брак", "demo-operator");

        var all = log.Query(null, null, 10);

        Assert.Single(all);
        Assert.Equal("Ncp", all[0].EntityType);
        Assert.Equal("NC-2026-0099", all[0].EntityKey);
        Assert.Equal("Create", all[0].Action);
        Assert.Null(all[0].OldValue);
        Assert.Equal("Брак", all[0].NewValue);
        Assert.Equal("demo-operator", all[0].UserName);
    }

    [Fact]
    public void Query_Filters_By_Entity_Type_And_Key_And_Orders_Newest_First()
    {
        var log = new InMemoryEventLog();
        log.Record("ProductionPlan", "DEMO-VIN-00001", "Move", "25", "24", "a");
        log.Record("Ncp", "NC-1", "Create", null, "Брак", "a");
        log.Record("ProductionPlan", "DEMO-VIN-00001", "Move", "24", "23", "a");
        log.Record("ProductionPlan", "DEMO-VIN-00002", "Move", "26", "25", "a");

        var forVin1 = log.Query("ProductionPlan", "DEMO-VIN-00001", 10);

        Assert.Equal(2, forVin1.Count);
        Assert.Equal("24", forVin1[0].OldValue); // последняя запись (24->23) идёт первой
        Assert.Equal("25", forVin1[1].OldValue);
    }

    [Fact]
    public void Query_Respects_Limit()
    {
        var log = new InMemoryEventLog();
        for (var i = 0; i < 5; i++)
        {
            log.Record("Ncp", $"NC-{i}", "Create", null, null, "a");
        }

        Assert.Equal(2, log.Query(null, null, 2).Count);
    }
}

public sealed class FileEventLogTests
{
    private static string TempPath() => Path.Combine(Path.GetTempPath(), $"mes-events-{Guid.NewGuid():N}.jsonl");

    [Fact]
    public void Entries_Survive_Restart_And_Ids_Continue()
    {
        var path = TempPath();
        try
        {
            var first = new FileEventLog(path);
            first.Record("Ncp", "NC-1", "Create", null, "Брак", "a");
            first.Record("ProductionPlan", "V1", "Move", "25", "24", "b");

            var second = new FileEventLog(path);
            var all = second.Query(null, null, 10);
            Assert.Equal(2, all.Count);
            Assert.Equal("ProductionPlan", all[0].EntityType); // новые первыми
            second.Record("Ncp", "NC-2", "Close", null, null, "c");
            Assert.Equal(3, second.Query(null, null, 10)[0].Id);
            Assert.Equal(3, File.ReadAllLines(path).Length); // только добавление: прежние строки на месте
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void Corrupt_Line_Is_Skipped_And_Filters_Work()
    {
        var path = TempPath();
        try
        {
            var log = new FileEventLog(path);
            log.Record("Ncp", "NC-1", "Create", null, "x", "a");
            File.AppendAllText(path, "{обрыв записи\n");
            log.Record("Calendar", "2026-11-09", "Set", null, "выходной", "a");

            var reopened = new FileEventLog(path);
            Assert.Equal(2, reopened.Query(null, null, 10).Count);
            Assert.Single(reopened.Query("Calendar", null, 10));
            Assert.Single(reopened.Query(null, "NC-1", 10));
            Assert.Single(reopened.Query(null, null, 1));
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void Write_Failure_Does_Not_Break_The_Operation()
    {
        var blocker = TempPath();
        File.WriteAllText(blocker, "x");
        try
        {
            // путь «внутри файла»: каталог создать нельзя — запись в файл не удастся, но событие остаётся в памяти
            var log = new FileEventLog(Path.Combine(blocker, "sub", "log.jsonl"));
            log.Record("Ncp", "NC-1", "Create", null, null, "a");
            Assert.Single(log.Query(null, null, 10));
        }
        finally { File.Delete(blocker); }
    }
}

public sealed class EventLogEndpointTests
{
    [Fact]
    public async Task Events_Require_Auth()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        Assert.Equal(System.Net.HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync("/api/v1/events")).StatusCode);
    }

    [Fact]
    public async Task Events_Return_Newest_First_Filtered_And_Limited()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        await client.PostAsJsonAsync("/api/v1/production-plan/DEMO-VIN-00003/move", new { toPosition = 24 });
        await client.PutAsJsonAsync("/api/v1/calendar/days", new ApplyCalendarRequest([new("2026-11-09", "off", null, null, "Праздник")]));

        var all = await client.GetFromJsonAsync<List<EventLogEntry>>("/api/v1/events");
        Assert.Equal("Calendar", all![0].EntityType); // самое новое первым
        Assert.Contains(all, e => e.EntityType == "ProductionPlan" && e.EntityKey == "DEMO-VIN-00003" && e.Action == "Move");

        var plan = await client.GetFromJsonAsync<List<EventLogEntry>>("/api/v1/events?entityType=ProductionPlan&entityKey=DEMO-VIN-00003");
        Assert.All(plan!, e => Assert.Equal("ProductionPlan", e.EntityType));
        Assert.Single(await client.GetFromJsonAsync<List<EventLogEntry>>("/api/v1/events?limit=1") ?? []);
    }

    [Theory]
    [InlineData("limit=0")]
    [InlineData("limit=501")]
    public async Task Events_Reject_Bad_Limit(string query)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, (await client.GetAsync($"/api/v1/events?{query}")).StatusCode);
    }
}
