namespace FormulaD.Mes.Api.IntegrationTests;

[Collection("SqlServer")]
public sealed class SqlReaderTests(SqlServerFixture db) : IAsyncLifetime
{
    public Task InitializeAsync() => db.ResetDataAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    private SqlProductionPlanReader Sut => new(db.Options);

    [Fact]
    public async Task GetPage_ReturnsAll()
    {
        var result = await Sut.GetPageAsync(new(null, null, null, 1, 50), CancellationToken.None);
        Assert.Equal(6, result.Total);
        Assert.Equal(6, result.Items.Count);
    }

    [Fact]
    public async Task GetPage_Paging()
    {
        var p1 = await Sut.GetPageAsync(new(null, null, null, 1, 2), CancellationToken.None);
        Assert.Equal(2, p1.Items.Count);
        Assert.Equal(6, p1.Total);
    }

    [Fact]
    public async Task GetPage_FilterByVin_Prefix()
    {
        var result = await Sut.GetPageAsync(new("DEMO-VIN-00001", null, null, 1, 50), CancellationToken.None);
        Assert.Single(result.Items);
        Assert.Equal("DEMO-VIN-00001", result.Items[0].Vin);
    }

    [Fact]
    public async Task GetPage_FilterByStatusId()
    {
        var result = await Sut.GetPageAsync(new(null, null, 1, 1, 50), CancellationToken.None);
        Assert.All(result.Items, i => Assert.Equal(1, i.StatusId));
    }

    [Fact]
    public async Task GetPage_FilterByStatus()
    {
        var result = await Sut.GetPageAsync(new(null, "planned", null, 1, 50), CancellationToken.None);
        Assert.All(result.Items, i => Assert.Equal("planned", i.Status));
    }

    [Fact]
    public async Task GetByVin_Found()
    {
        var item = await Sut.GetByVinAsync("DEMO-VIN-00003", CancellationToken.None);
        Assert.NotNull(item);
        Assert.Equal("DEMO-VIN-00003", item.Vin);
        Assert.Equal(2, item.StatusId);
        Assert.Equal("complete", item.Status);
        Assert.NotNull(item.StartDate);
        Assert.NotNull(item.CompleteDate);
    }

    [Fact]
    public async Task GetByVin_NotFound()
    {
        var item = await Sut.GetByVinAsync("NO-SUCH-VIN", CancellationToken.None);
        Assert.Null(item);
    }

    [Fact]
    public async Task GetStatuses_ReturnsDistinctValues()
    {
        var statuses = await Sut.GetStatusesAsync(CancellationToken.None);
        Assert.NotEmpty(statuses);
        Assert.Contains("planned", statuses);
        Assert.Contains("in progress", statuses);
    }
}
