using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

/// <summary>Запуск в производство (0 → 1) — docs/DEVELOPMENT_PLAN.md, Этап 3. Только демо.</summary>
public sealed class StartTests
{
    [Fact]
    public async Task Start_Requires_Authentication()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var response = await factory.CreateClient().PostAsync("/api/v1/production-plan/DEMO-VIN-00002/start", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Start_Transitions_Status_0_To_1_And_Sets_StartDate()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var before = await client.GetFromJsonAsync<ProductionPlanItem>("/api/v1/production-plan/DEMO-VIN-00002");
        Assert.Equal(0, before!.StatusId);
        Assert.Null(before.StartDate);

        var response = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00002/start", null);
        response.EnsureSuccessStatusCode();
        var started = await response.Content.ReadFromJsonAsync<ProductionPlanItem>();

        Assert.NotNull(started);
        Assert.Equal(1, started.StatusId);
        Assert.Equal("in progress", started.Status);
        Assert.NotNull(started.StartDate);
    }

    [Fact]
    public async Task Repeated_Start_Does_Not_Restart_And_Keeps_Original_StartDate()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var first = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00002/start", null);
        var started = await first.Content.ReadFromJsonAsync<ProductionPlanItem>();

        var second = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00002/start", null);
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);

        var unchanged = await client.GetFromJsonAsync<ProductionPlanItem>("/api/v1/production-plan/DEMO-VIN-00002");
        Assert.Equal(started!.StartDate, unchanged!.StartDate);
    }

    [Theory]
    [InlineData("DEMO-VIN-00001")] // statusId 1 — уже в работе
    [InlineData("DEMO-VIN-00003")] // statusId 2 — завершено
    [InlineData("DEMO-VIN-00005")] // statusId null — без статуса
    public async Task Start_Rejects_Items_Not_In_Status_0(string vin)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsync($"/api/v1/production-plan/{vin}/start", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Start_Unknown_Vin_Returns_404()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-99999/start", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Start_Route_Exists_In_Sql_Mode()
    {
        using var factory = new SqlConfiguredFactory();
        var response = await factory.CreateClient().PostAsync("/api/v1/production-plan/DEMO-VIN-00002/start", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Pending_Start_List_Filters_By_StatusId_Not_Status_String()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var page = await client.GetFromJsonAsync<PagedResult<ProductionPlanItem>>("/api/v1/production-plan?statusId=0&pageSize=100");

        Assert.NotNull(page);
        Assert.Equal(1, page.Total);
        Assert.Equal("DEMO-VIN-00002", page.Items[0].Vin);
    }
}
