using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

/// <summary>Завершение сборки (1 → 2) — docs/DEVELOPMENT_PLAN.md, Этап 4. Только демо.</summary>
public sealed class CompleteTests
{
    [Fact]
    public async Task Complete_Requires_Authentication()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var response = await factory.CreateClient().PostAsync("/api/v1/production-plan/DEMO-VIN-00001/complete", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Complete_Transitions_Status_1_To_2_And_Sets_CompleteDate()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var before = await client.GetFromJsonAsync<ProductionPlanItem>("/api/v1/production-plan/DEMO-VIN-00001");
        Assert.Equal(1, before!.StatusId);
        Assert.Null(before.CompleteDate);

        var response = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00001/complete", null);
        response.EnsureSuccessStatusCode();
        var completed = await response.Content.ReadFromJsonAsync<ProductionPlanItem>();

        Assert.NotNull(completed);
        Assert.Equal(2, completed.StatusId);
        Assert.Equal("complete", completed.Status);
        Assert.NotNull(completed.CompleteDate);
    }

    [Fact]
    public async Task Complete_Is_Not_Blocked_By_Open_Ncp()
    {
        // DEMO-VIN-00001 несёт две открытые NCP с неустановленной деталью (NC-2026-0001/2) —
        // завершение сборки по разделу 13 ([П]) ими не блокируется, в отличие от FOK.
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00001/complete", null);

        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("DEMO-VIN-00002")] // statusId 0 — ещё не запущено
    [InlineData("DEMO-VIN-00003")] // statusId 2 — уже завершено
    public async Task Complete_Rejects_Items_Not_In_Status_1(string vin)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsync($"/api/v1/production-plan/{vin}/complete", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Complete_Unknown_Vin_Returns_404()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-99999/complete", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Complete_Route_Exists_In_Sql_Mode()
    {
        using var factory = new SqlConfiguredFactory();
        var response = await factory.CreateClient().PostAsync("/api/v1/production-plan/DEMO-VIN-00001/complete", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
