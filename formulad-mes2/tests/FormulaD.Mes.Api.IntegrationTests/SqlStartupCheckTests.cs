using Microsoft.Extensions.Logging;

namespace FormulaD.Mes.Api.IntegrationTests;

[Collection("SqlServer")]
public sealed class SqlStartupCheckTests(SqlServerFixture db)
{
    [Fact]
    public async Task RunAsync_SucceedsOnSeededDb()
    {
        // Should not throw — all 10 tables + __SchemaVersion exist
        await SqlStartupCheck.RunAsync(db.Options, new LoggerFactory().CreateLogger("test"), CancellationToken.None);
    }
}
