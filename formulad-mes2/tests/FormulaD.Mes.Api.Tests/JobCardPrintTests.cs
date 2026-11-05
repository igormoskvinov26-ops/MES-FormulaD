using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

/// <summary>Печать JobCard — Этап 7. Только демо.</summary>
public sealed class JobCardPrintTests
{
    [Fact]
    public async Task Print_Requires_Authentication()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var response = await factory.CreateClient().PostAsync("/api/v1/production-plan/DEMO-VIN-00002/print", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("DEMO-VIN-00001")] // statusId 1
    [InlineData("DEMO-VIN-00002")] // statusId 0 — печать разрешена и до запуска
    [InlineData("DEMO-VIN-00004")] // statusId 3
    public async Task Print_Sets_PrintDate_Regardless_Of_Status(string vin)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var before = await client.GetFromJsonAsync<ProductionPlanItem>($"/api/v1/production-plan/{vin}");

        var response = await client.PostAsync($"/api/v1/production-plan/{vin}/print", null);
        response.EnsureSuccessStatusCode();
        var updated = await response.Content.ReadFromJsonAsync<ProductionPlanItem>();

        Assert.NotNull(updated);
        Assert.NotNull(updated.PrintDate);
        Assert.Equal(before!.StatusId, updated.StatusId);
    }

    [Fact]
    public async Task Print_Does_Not_Change_Status()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        await (await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00001/print", null)).Content.ReadAsStringAsync();
        var item = await client.GetFromJsonAsync<ProductionPlanItem>("/api/v1/production-plan/DEMO-VIN-00001");

        Assert.Equal(1, item!.StatusId);
    }

    [Fact]
    public async Task Print_Unknown_Vin_Returns_404()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-99999/print", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Print_Route_Exists_In_Sql_Mode()
    {
        using var factory = new SqlConfiguredFactory();
        var response = await factory.CreateClient().PostAsync("/api/v1/production-plan/DEMO-VIN-00001/print", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
