namespace FormulaD.Mes.Api.IntegrationTests;

[Collection("SqlServer")]
public sealed class SqlMoveTests(SqlServerFixture db) : IAsyncLifetime
{
    public Task InitializeAsync() => db.ResetDataAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    private SqlPlanOrderEditor Sut => new(db.Options, new InMemoryEventLog());

    [Fact]
    public async Task Move_SwapPositions()
    {
        // DEMO-VIN-00001 has SEQN=23, DEMO-VIN-00002 has SEQN=24
        var result = await Sut.MoveAsync("DEMO-VIN-00001", 24, "tester", CancellationToken.None);
        Assert.Equal(MoveOutcome.Ok, result);

        // Verify the swap via reader
        var reader = new SqlProductionPlanReader(db.Options);
        var item1 = await reader.GetByVinAsync("DEMO-VIN-00001", CancellationToken.None);
        var item2 = await reader.GetByVinAsync("DEMO-VIN-00002", CancellationToken.None);
        Assert.Equal(24, item1!.Seqn);
        Assert.Equal(23, item2!.Seqn);
    }

    [Fact]
    public async Task Move_MissingVin()
    {
        var result = await Sut.MoveAsync("NO-SUCH", 23, "tester", CancellationToken.None);
        Assert.Equal(MoveOutcome.VinNotFound, result);
    }

    [Fact]
    public async Task Move_NoPosition()
    {
        // DEMO-VIN-00005 has SEQN=NULL
        var result = await Sut.MoveAsync("DEMO-VIN-00005", 23, "tester", CancellationToken.None);
        Assert.Equal(MoveOutcome.NoPosition, result);
    }

    [Fact]
    public async Task Move_InvalidPosition()
    {
        var result = await Sut.MoveAsync("DEMO-VIN-00001", 9999, "tester", CancellationToken.None);
        Assert.Equal(MoveOutcome.PositionNotFound, result);
    }
}
