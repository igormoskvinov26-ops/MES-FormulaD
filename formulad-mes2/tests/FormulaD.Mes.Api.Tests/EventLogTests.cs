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
