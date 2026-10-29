using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

/// <summary>Final OK (2 → 3) и блокировка по незакрытой детали — Этап 4. Только демо.</summary>
public sealed class FokTests
{
    [Fact]
    public async Task Fok_Requires_Authentication()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var response = await factory.CreateClient().PostAsync("/api/v1/production-plan/DEMO-VIN-00003/fok", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Fok_Succeeds_When_No_Missing_Parts()
    {
        // DEMO-VIN-00003: statusId=2, единственная NCP закрыта и PartInstalled=true.
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00003/fok", null);
        response.EnsureSuccessStatusCode();
        var item = await response.Content.ReadFromJsonAsync<ProductionPlanItem>();

        Assert.NotNull(item);
        Assert.Equal(3, item.StatusId);
        Assert.Equal("FOK", item.Status);
        Assert.NotNull(item.FokDate);
    }

    [Fact]
    public async Task Fok_Is_Blocked_By_Missing_Part_Even_Though_Status_Is_Eligible()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        // DEMO-VIN-00001 стартует со статусом 1 (в работе) с двумя открытыми NCP без детали.
        // Доводим его до статуса 2 (завершение сборки их не блокирует — CompleteTests), затем
        // убеждаемся, что именно FOK блокируется, а не раньше.
        var complete = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00001/complete", null);
        complete.EnsureSuccessStatusCode();

        var response = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00001/fok", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("NC-2026-0001", body);
        Assert.Contains("NC-2026-0002", body);

        // Статус не должен был измениться на 3 при отказе.
        var unchanged = await client.GetFromJsonAsync<ProductionPlanItem>("/api/v1/production-plan/DEMO-VIN-00001");
        Assert.Equal(2, unchanged!.StatusId);
    }

    [Fact]
    public async Task Fok_Unblocks_After_Part_Installed_Is_Confirmed()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        await (await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00001/complete", null)).Content.ReadAsStringAsync();

        // Закрываем только физическую проблему (id=1, id=2) — отметка установки детали,
        // НЕ закрытие заявки: раздел 16 — это разные состояния, проверяем, что блокирует
        // именно PartInstalled.
        await client.PostAsJsonAsync("/api/v1/ncp/1/part-installed", new SetPartInstalledRequest(true));
        await client.PostAsJsonAsync("/api/v1/ncp/2/part-installed", new SetPartInstalledRequest(true));

        var response = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00001/fok", null);

        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("DEMO-VIN-00001")] // statusId 1 — ещё не завершено
    [InlineData("DEMO-VIN-00004")] // statusId 3 — уже FOK
    public async Task Fok_Rejects_Items_Not_In_Status_2(string vin)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsync($"/api/v1/production-plan/{vin}/fok", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Fok_Unknown_Vin_Returns_404()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-99999/fok", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Fok_Route_Exists_In_Sql_Mode()
    {
        using var factory = new SqlConfiguredFactory();
        var response = await factory.CreateClient().PostAsync("/api/v1/production-plan/DEMO-VIN-00003/fok", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Missing_Parts_Endpoint_Lists_Blocking_Ncp_For_Proactive_Ui_Check()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var clean = await client.GetFromJsonAsync<List<NcpItem>>("/api/v1/ncp/missing-parts?vin=DEMO-VIN-00003");
        Assert.Empty(clean!);

        var blocked = await client.GetFromJsonAsync<List<NcpItem>>("/api/v1/ncp/missing-parts?vin=DEMO-VIN-00001");
        Assert.Equal(2, blocked!.Count);
    }
}
