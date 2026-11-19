using Xunit;

namespace FormulaD.Mes.Api.Tests;

public class SchemaMigratorTests
{
    [Theory]
    [InlineData("0001_create_app_tables.sql", 1)]
    [InlineData("0002_add_event_log.sql", 2)]
    [InlineData("0100_big_change.sql", 100)]
    [InlineData("no_number.sql", 0)]
    [InlineData("", 0)]
    [InlineData("abc.sql", 0)]
    [InlineData("0001_create_app_tables.rollback.sql", 1)]
    public void ParseVersion_ExtractsLeadingDigits(string fileName, int expected)
    {
        Assert.Equal(expected, SchemaMigrator.ParseVersion(fileName));
    }
}
