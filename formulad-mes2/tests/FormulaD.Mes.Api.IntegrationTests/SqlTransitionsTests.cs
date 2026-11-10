namespace FormulaD.Mes.Api.IntegrationTests;

[Collection("SqlServer")]
public sealed class SqlTransitionsTests(SqlServerFixture db) : IAsyncLifetime
{
    public Task InitializeAsync() => db.ResetDataAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    private SqlPlanTransitions Sut => new(db.Options, new InMemoryEventLog());

    [Fact]
    public async Task Start_Planned_Succeeds()
    {
        // DEMO-VIN-00002 is statusid=0 (planned)
        var (outcome, item) = await Sut.StartAsync("DEMO-VIN-00002", "tester", CancellationToken.None);
        Assert.Equal(TransitionOutcome.Ok, outcome);
        Assert.NotNull(item);
        Assert.Equal(1, item.StatusId);
        Assert.Equal("in progress", item.Status);
        Assert.NotNull(item.StartDate);
    }

    [Fact]
    public async Task Start_WrongStatus_Fails()
    {
        // DEMO-VIN-00001 is statusid=1 (in progress), can't start again
        var (outcome, item) = await Sut.StartAsync("DEMO-VIN-00001", "tester", CancellationToken.None);
        Assert.Equal(TransitionOutcome.WrongStatus, outcome);
        Assert.NotNull(item); // returned so caller can see current state
    }

    [Fact]
    public async Task Start_MissingVin_VinNotFound()
    {
        var (outcome, _) = await Sut.StartAsync("NO-SUCH-VIN", "tester", CancellationToken.None);
        Assert.Equal(TransitionOutcome.VinNotFound, outcome);
    }

    [Fact]
    public async Task Complete_Then_Fok_Chain()
    {
        // DEMO-VIN-00001: statusid=1 → complete (2) → FOK (3)
        var (o1, _) = await Sut.CompleteAsync("DEMO-VIN-00001", "tester", CancellationToken.None);
        Assert.Equal(TransitionOutcome.Ok, o1);

        var (o2, item) = await Sut.FokAsync("DEMO-VIN-00001", "tester", CancellationToken.None);
        Assert.Equal(TransitionOutcome.Ok, o2);
        Assert.Equal(3, item!.StatusId);
        Assert.NotNull(item.FokDate);
    }

    [Fact]
    public async Task Rework_Flow()
    {
        // DEMO-VIN-00003: statusid=2 → rework (4) → complete (2)
        var (o1, _) = await Sut.SendToReworkAsync("DEMO-VIN-00003", "tester", CancellationToken.None);
        Assert.Equal(TransitionOutcome.Ok, o1);

        var (o2, item) = await Sut.FinishReworkAsync("DEMO-VIN-00003", "tester", CancellationToken.None);
        Assert.Equal(TransitionOutcome.Ok, o2);
        Assert.Equal(2, item!.StatusId);
    }
}
