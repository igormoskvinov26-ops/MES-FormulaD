namespace FormulaD.Mes.Api.IntegrationTests;

[Collection("SqlServer")]
public sealed class SqlNcpTests(SqlServerFixture db) : IAsyncLifetime
{
    public Task InitializeAsync() => db.ResetDataAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    private SqlNcpStore Sut => new(db.Options, new InMemoryEventLog());

    [Fact]
    public async Task GetPage_ReturnsSeedData()
    {
        var result = await Sut.GetPageAsync(new(null, null, 1, 50), CancellationToken.None);
        Assert.Equal(2, result.Total);
    }

    [Fact]
    public async Task GetTypes_ReturnsFromDiscrepancyList()
    {
        var types = await Sut.GetTypesAsync(CancellationToken.None);
        Assert.Equal(8, types.Count);
        Assert.Contains("Царапина", types);
    }

    [Fact]
    public async Task GetComponents_ReturnsList()
    {
        var components = await Sut.GetComponentsAsync(CancellationToken.None);
        Assert.Equal(15, components.Count);
        Assert.Contains(components, c => c.Code == "FRM-001");
    }

    [Fact]
    public async Task GetStations_ReturnsValues()
    {
        var stations = await Sut.GetStationsAsync(CancellationToken.None);
        Assert.NotEmpty(stations);
    }

    [Fact]
    public async Task Create_And_Close()
    {
        var (o1, created) = await Sut.CreateAsync(
            new CreateNcpRequest("DEMO-VIN-00001", "3", "FRM-001", 1, "Царапина", "тест"),
            "tester", CancellationToken.None);
        Assert.Equal(CreateNcpOutcome.Ok, o1);
        Assert.NotNull(created);
        Assert.Equal("Открыто", created.Status);
        Assert.Equal("DEMO-VIN-00001", created.Vin);

        var (o2, closed) = await Sut.CloseAsync(created.Id, "eng", new("Исправлено"), CancellationToken.None);
        Assert.Equal(NcpActionOutcome.Ok, o2);
        Assert.Equal("Закрыто", closed!.Status);
        Assert.NotNull(closed.ClosedAt);
    }

    [Fact]
    public async Task Create_UnknownVin_Rejected()
    {
        var (o, _) = await Sut.CreateAsync(
            new CreateNcpRequest("NO-SUCH", "3", "FRM-001", 1, "Царапина", null),
            "tester", CancellationToken.None);
        Assert.Equal(CreateNcpOutcome.VinNotFound, o);
    }

    [Fact]
    public async Task MissingRequiredParts_ReturnsOpenNcps()
    {
        // Seed has 1 open NCP for DEMO-VIN-00001
        var missing = await Sut.GetMissingRequiredPartsAsync("DEMO-VIN-00001", CancellationToken.None);
        Assert.Single(missing);
    }
}
