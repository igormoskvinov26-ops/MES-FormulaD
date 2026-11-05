using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

/// <summary>Rework (2 → 4 → 2) — Этап 6. Только демо.</summary>
public sealed class ReworkTests
{
    [Fact]
    public async Task Rework_Requires_Authentication()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var response = await factory.CreateClient().PostAsync("/api/v1/production-plan/DEMO-VIN-00003/rework", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Send_To_Rework_Succeeds_From_Status_2()
    {
        // DEMO-VIN-00003: statusId=2.
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00003/rework", null);
        response.EnsureSuccessStatusCode();
        var item = await response.Content.ReadFromJsonAsync<ProductionPlanItem>();

        Assert.NotNull(item);
        Assert.Equal(4, item.StatusId);
    }

    [Theory]
    [InlineData("DEMO-VIN-00001")] // statusId 1
    [InlineData("DEMO-VIN-00004")] // statusId 3
    public async Task Send_To_Rework_Rejects_Items_Not_In_Status_2(string vin)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsync($"/api/v1/production-plan/{vin}/rework", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Send_To_Rework_Unknown_Vin_Returns_404()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-99999/rework", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Finish_Rework_Succeeds_When_No_Missing_Parts()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        await (await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00003/rework", null)).Content.ReadAsStringAsync();

        var response = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00003/rework/finish", null);
        response.EnsureSuccessStatusCode();
        var item = await response.Content.ReadFromJsonAsync<ProductionPlanItem>();

        Assert.NotNull(item);
        Assert.Equal(2, item.StatusId);
    }

    [Fact]
    public async Task Finish_Rework_Is_Blocked_By_Missing_Part_And_Unblocks_After_Install()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        // DEMO-VIN-00001 стартует со статусом 1 с двумя открытыми NCP без детали — доводим
        // до статуса 2, затем в Rework (минуя завершение, которое не проверяет NCP).
        await (await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00001/complete", null)).Content.ReadAsStringAsync();
        await (await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00001/rework", null)).Content.ReadAsStringAsync();

        var blocked = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00001/rework/finish", null);
        Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);
        var body = await blocked.Content.ReadAsStringAsync();
        Assert.Contains("NC-2026-0001", body);
        Assert.Contains("NC-2026-0002", body);

        var unchanged = await client.GetFromJsonAsync<ProductionPlanItem>("/api/v1/production-plan/DEMO-VIN-00001");
        Assert.Equal(4, unchanged!.StatusId);

        // Физически устанавливаем обе детали прямо в окне Rework (раздел 17: можно отсюда).
        await client.PostAsJsonAsync("/api/v1/ncp/1/part-installed", new SetPartInstalledRequest(true));
        await client.PostAsJsonAsync("/api/v1/ncp/2/part-installed", new SetPartInstalledRequest(true));

        var unblocked = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00001/rework/finish", null);
        Assert.True(unblocked.IsSuccessStatusCode, await unblocked.Content.ReadAsStringAsync());

        var afterwards = await client.GetFromJsonAsync<ProductionPlanItem>("/api/v1/production-plan/DEMO-VIN-00001");
        Assert.Equal(2, afterwards!.StatusId);
        // После Rework изделие само доступно в очереди FOK — statusId=2 этого достаточно,
        // отдельного флага не требуется (раздел 275, [С]).
    }

    [Theory]
    [InlineData("DEMO-VIN-00001")] // statusId 1 — ещё не в Rework
    [InlineData("DEMO-VIN-00004")] // statusId 3
    public async Task Finish_Rework_Rejects_Items_Not_In_Status_4(string vin)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsync($"/api/v1/production-plan/{vin}/rework/finish", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Rework_Routes_Exist_In_Sql_Mode()
    {
        using var factory = new SqlConfiguredFactory();
        var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00003/rework", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00003/rework/finish", null)).StatusCode);
    }
}
