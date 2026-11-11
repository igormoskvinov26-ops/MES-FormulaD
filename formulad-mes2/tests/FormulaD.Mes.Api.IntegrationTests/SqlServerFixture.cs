using Microsoft.Data.SqlClient;
using Testcontainers.MsSql;

namespace FormulaD.Mes.Api.IntegrationTests;

/// <summary>
/// Shared SQL Server container for all integration tests. Spins up once,
/// seeds schema + test data, provides connection strings.
/// ponytail: one container per test run, reset data between tests via DELETE.
/// </summary>
public sealed class SqlServerFixture : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder()
        .WithImage("mcr.microsoft.com/mssql/server:2022-latest")
        .Build();

    public string ConnectionString { get; private set; } = default!;

    public SqlOptions Options => new(
        ReadConnectionString,
        ConnectionString,
        15);

    private string ReadConnectionString
    {
        get
        {
            var b = new SqlConnectionStringBuilder(ConnectionString)
            {
                ApplicationIntent = ApplicationIntent.ReadOnly,
                ApplicationName = "IntegrationTests (read-only)"
            };
            return b.ConnectionString;
        }
    }

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        var cs = _container.GetConnectionString();
        var builder = new SqlConnectionStringBuilder(cs)
        {
            TrustServerCertificate = true,
            ApplicationName = "IntegrationTests"
        };
        ConnectionString = builder.ConnectionString;

        await SeedAsync();
    }

    public async Task DisposeAsync()
    {
        await _container.DisposeAsync();
    }

    private async Task SeedAsync()
    {
        var seedSql = await File.ReadAllTextAsync(
            Path.Combine(AppContext.BaseDirectory, "seed.sql"));

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync();

        // sqlcmd-style: split on GO
        foreach (var batch in SplitBatches(seedSql))
        {
            if (string.IsNullOrWhiteSpace(batch)) continue;
            await using var cmd = new SqlCommand(batch, conn);
            cmd.CommandTimeout = 30;
            await cmd.ExecuteNonQueryAsync();
        }
    }

    private static IEnumerable<string> SplitBatches(string sql)
    {
        // Split on lines that are just "GO" (case-insensitive)
        var batch = new System.Text.StringBuilder();
        foreach (var line in sql.Split('\n'))
        {
            if (line.Trim().Equals("GO", StringComparison.OrdinalIgnoreCase))
            {
                yield return batch.ToString();
                batch.Clear();
            }
            else
            {
                batch.AppendLine(line);
            }
        }
        if (batch.Length > 0) yield return batch.ToString();
    }

    /// <summary>
    /// Reset mutable data so tests don't bleed into each other.
    /// Keeps reference data (components, discrepancies, suppliers).
    /// </summary>
    public async Task ResetDataAsync()
    {
        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync();

        // Order matters: FKs
        var deletes = new[]
        {
            "DELETE FROM [dbo].[tblIncomingPackingRow]",
            "DELETE FROM [dbo].[tblIncomingPackage]",
            "DELETE FROM [dbo].[tblIncomingDelivery]",
            "DELETE FROM [dbo].[tblComponentCheck]",
            "DELETE FROM [dbo].[tblNCP]",
            "DELETE FROM [dbo].[tblProductionPlan]",
        };

        foreach (var sql in deletes)
        {
            await using var cmd = new SqlCommand(sql, conn) { CommandTimeout = 10 };
            await cmd.ExecuteNonQueryAsync();
        }

        // Re-insert plan rows from seed
        await using var reseed = new SqlCommand("""
            SET IDENTITY_INSERT [dbo].[tblProductionPlan] ON;

            INSERT INTO [dbo].[tblProductionPlan]
                ([VIN], [ID], [SEQN], [ModelArticle], [ModelName], [EngineNumber], [Color],
                 [SpecificationName], [Status], [statusid], [PrintDate], [plannedstartdate],
                 [PlannedShipmentDate], [StartDate], [CompleteDate], [FOK_date])
            VALUES
                ('DEMO-VIN-00001', 1001, 23, 'DEMO-800',  N'Квадроцикл 800 · ДЕМО',  'DEMO-ENGINE-01', N'Серый',
                 N'Pathcross 1000 LTD · ДЕМО', 'in progress', 1,
                 '2026-10-12', '2026-10-12', '2026-11-15', '2026-10-20T09:00:00', NULL, NULL),
                ('DEMO-VIN-00002', 1002, 24, 'DEMO-800',  N'Квадроцикл 800 · ДЕМО',  'DEMO-ENGINE-02', N'Красный',
                 N'Pathcross 1000 LTD · ДЕМО', 'planned', 0,
                 '2026-10-12', '2026-10-14', '2026-11-17', NULL, NULL, NULL),
                ('DEMO-VIN-00003', 1003, 25, 'DEMO-1000', N'Квадроцикл 1000 · ДЕМО', 'DEMO-ENGINE-03', N'Чёрный',
                 N'Pathcross MAX 1000 ARMY29CST YIT ST4 диджитал · ДЕМО', 'complete', 2,
                 '2026-10-10', '2026-10-11', '2026-11-13', '2026-10-18T09:30:00', '2026-10-24T16:00:00', NULL),
                ('DEMO-VIN-00004', 1004, 26, 'DEMO-800',  N'Квадроцикл 800 · ДЕМО',  'DEMO-ENGINE-04', N'Белый',
                 N'Pathcross 1000 LTD · ДЕМО', 'FOK', 3,
                 '2026-10-09', '2026-10-10', NULL, '2026-10-16T09:00:00', '2026-10-19T16:00:00', '2026-10-21T10:00:00'),
                ('DEMO-VIN-00005', 1005, NULL, 'DEMO-700', N'Квадроцикл 700 · ДЕМО', 'DEMO-ENGINE-05', NULL,
                 NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
                ('DEMO-VIN-00006', 1006, 28, NULL, NULL, 'DEMO-ENGINE-06', N'Синий',
                 N'Pathcross MAX 1000 ARMY29CST YIT ST4 диджитал · ДЕМО', 'custom_unknown', 88,
                 '2026-10-23', NULL, NULL, NULL, NULL, NULL);

            SET IDENTITY_INSERT [dbo].[tblProductionPlan] OFF;

            INSERT INTO [dbo].[tblNCP] ([VIN], [StationID], [ComponentID], [Quantity], [DiscrepancyTypeID], [Comment], [Status], [CreatedBy], [CreatedAt])
            VALUES
                ('DEMO-VIN-00001', 3, 4, 1, 3, N'Не хватает болтов крепления', 1, 'test-user', '2026-10-21T10:00:00'),
                ('DEMO-VIN-00003', 7, 10, 1, 1, N'Царапина на левом крыле', 2, 'test-user', '2026-10-22T14:00:00');
            """, conn) { CommandTimeout = 15 };
        await reseed.ExecuteNonQueryAsync();
    }
}

[CollectionDefinition("SqlServer")]
public class SqlServerCollection : ICollectionFixture<SqlServerFixture>;
