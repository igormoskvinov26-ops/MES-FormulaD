using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api.IntegrationTests;

[Collection("SqlServer")]
public sealed class SqlPublisherTests(SqlServerFixture db) : IAsyncLifetime
{
    public Task InitializeAsync() => db.ResetDataAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    private SqlPlanPublisher Sut => new(db.Options, new InMemoryEventLog());

    [Fact]
    public async Task Publish_InsertsRows()
    {
        var rows = new NewPlanRow[]
        {
            new("TEST-NEW-001", "ART-1", "Model A", "ENG-100", "Red", "Spec A", null, null, null),
        };

        var count = await Sut.PublishAsync(rows, "tester", CancellationToken.None);
        Assert.Equal(1, count);

        // Verify
        await using var conn = new SqlConnection(db.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new SqlCommand(
            "SELECT [VIN], [SEQN] FROM [dbo].[tblProductionPlan] WHERE [VIN] = 'TEST-NEW-001'", conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal("TEST-NEW-001", reader.GetString(0));
        Assert.False(reader.IsDBNull(1)); // SEQN assigned
    }

    [Fact]
    public async Task Publish_EmptyList_NoOp()
    {
        var count = await Sut.PublishAsync([], "tester", CancellationToken.None);
        Assert.Equal(0, count);
    }
}
