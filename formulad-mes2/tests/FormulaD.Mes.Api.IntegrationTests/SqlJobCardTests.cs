namespace FormulaD.Mes.Api.IntegrationTests;

[Collection("SqlServer")]
public sealed class SqlJobCardTests(SqlServerFixture db) : IAsyncLifetime
{
    public Task InitializeAsync() => db.ResetDataAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    private SqlJobCardPrinter Sut => new(db.Options, new InMemoryEventLog());

    [Fact]
    public async Task MarkPrinted_UpdatesDate()
    {
        var item = await Sut.MarkPrintedAsync("DEMO-VIN-00002", "tester", CancellationToken.None);
        Assert.NotNull(item);
        Assert.NotNull(item.PrintDate);
        Assert.Equal("DEMO-VIN-00002", item.Vin);
    }

    [Fact]
    public async Task MarkPrinted_MissingVin_ReturnsNull()
    {
        var item = await Sut.MarkPrintedAsync("NO-SUCH", "tester", CancellationToken.None);
        Assert.Null(item);
    }
}
