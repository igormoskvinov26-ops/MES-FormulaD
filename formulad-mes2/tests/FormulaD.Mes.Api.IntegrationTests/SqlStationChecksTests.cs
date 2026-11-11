namespace FormulaD.Mes.Api.IntegrationTests;

[Collection("SqlServer")]
public sealed class SqlStationChecksTests(SqlServerFixture db) : IAsyncLifetime
{
    public Task InitializeAsync() => db.ResetDataAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    private SqlStationChecks Sut => new(db.Options, new InMemoryEventLog());

    [Fact]
    public async Task GetForVin_Empty_Initially()
    {
        var checks = await Sut.GetForVinAsync("DEMO-VIN-00001", CancellationToken.None);
        Assert.Empty(checks);
    }

    [Fact]
    public async Task Check_Then_Uncheck()
    {
        var (o1, c1) = await Sut.SetCheckedAsync("DEMO-VIN-00001", "FRM-001", true, "tester", CancellationToken.None);
        Assert.Equal(SetCheckOutcome.Ok, o1);
        Assert.True(c1!.Checked);
        Assert.Equal("tester", c1.CheckedBy);
        Assert.NotNull(c1.CheckedAt);

        var checks = await Sut.GetForVinAsync("DEMO-VIN-00001", CancellationToken.None);
        Assert.Single(checks);
        Assert.True(checks["FRM-001"].Checked);

        // Uncheck
        var (o2, c2) = await Sut.SetCheckedAsync("DEMO-VIN-00001", "FRM-001", false, "tester", CancellationToken.None);
        Assert.Equal(SetCheckOutcome.Ok, o2);
        Assert.False(c2!.Checked);
        Assert.Null(c2.CheckedBy);
    }

    [Fact]
    public async Task RejectUnknownVin()
    {
        var (o, _) = await Sut.SetCheckedAsync("NO-SUCH", "FRM-001", true, "tester", CancellationToken.None);
        Assert.Equal(SetCheckOutcome.VinNotFound, o);
    }

    [Fact]
    public async Task RejectUnknownComponent()
    {
        var (o, _) = await Sut.SetCheckedAsync("DEMO-VIN-00001", "NOPE-999", true, "tester", CancellationToken.None);
        Assert.Equal(SetCheckOutcome.ComponentNotFound, o);
    }
}
