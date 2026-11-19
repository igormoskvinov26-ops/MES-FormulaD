using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

/// <summary>Сквозные сценарии жизненного цикла изделия и сессии пользователя.</summary>
public sealed class LifecycleTests
{
    [Fact]
    public async Task Full_Happy_Path_Start_Complete_Fok()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        // DEMO-VIN-00002: statusId=0 — «Ожидает».
        var start = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00002/start", null);
        start.EnsureSuccessStatusCode();
        var after1 = await start.Content.ReadFromJsonAsync<ProductionPlanItem>();
        Assert.Equal(1, after1!.StatusId);

        var complete = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00002/complete", null);
        complete.EnsureSuccessStatusCode();
        var after2 = await complete.Content.ReadFromJsonAsync<ProductionPlanItem>();
        Assert.Equal(2, after2!.StatusId);

        var fok = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00002/fok", null);
        fok.EnsureSuccessStatusCode();
        var after3 = await fok.Content.ReadFromJsonAsync<ProductionPlanItem>();
        Assert.Equal(3, after3!.StatusId);
        Assert.NotNull(after3.FokDate);
    }

    [Fact]
    public async Task Rework_Then_Fok_Works()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        // DEMO-VIN-00003: statusId=2. Send to rework, finish, then FOK.
        (await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00003/rework", null))
            .EnsureSuccessStatusCode();
        (await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00003/rework/finish", null))
            .EnsureSuccessStatusCode();

        var item = await client.GetFromJsonAsync<ProductionPlanItem>("/api/v1/production-plan/DEMO-VIN-00003");
        Assert.Equal(2, item!.StatusId);

        var fok = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00003/fok", null);
        fok.EnsureSuccessStatusCode();
        var final = await fok.Content.ReadFromJsonAsync<ProductionPlanItem>();
        Assert.Equal(3, final!.StatusId);
    }

    [Fact]
    public async Task Auth_Me_Returns_Current_User()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.GetAsync("/api/v1/auth/me");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains(ApiFactory.Login, body);
    }

    [Fact]
    public async Task Logout_Returns_Success()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var logout = await client.PostAsync("/api/v1/auth/logout", null);
        Assert.True(logout.IsSuccessStatusCode);
    }

    [Fact]
    public async Task Logout_Without_Session_Does_Not_Fail()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = factory.CreateClient();

        var logout = await client.PostAsync("/api/v1/auth/logout", null);
        // Logout without a session should not crash.
        Assert.True(logout.IsSuccessStatusCode || logout.StatusCode == HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Ncp_Components_Lists_Items_With_Station()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var components = await client.GetFromJsonAsync<List<ComponentItem>>("/api/v1/ncp/components");
        Assert.NotNull(components);
        Assert.NotEmpty(components);
        Assert.All(components, c => Assert.False(string.IsNullOrEmpty(c.Code)));
    }

    [Fact]
    public async Task Incoming_Unknown_Delivery_Returns_404()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.GetAsync("/api/v1/incoming-inspection/deliveries/nonexistent-id");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Incoming_Unknown_Package_Actions_Return_404()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var close = await client.PostAsync("/api/v1/incoming-inspection/packages/999999/close", null);
        Assert.Equal(HttpStatusCode.NotFound, close.StatusCode);

        var result = await client.PostAsJsonAsync("/api/v1/incoming-inspection/packages/999999/rows/1/result",
            new RecordRowResultRequest("OK", 1, null));
        Assert.Equal(HttpStatusCode.NotFound, result.StatusCode);
    }

    [Fact]
    public async Task Double_Start_Does_Not_Change_Status()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        // DEMO-VIN-00001 is already statusId=1.
        var response = await client.PostAsync("/api/v1/production-plan/DEMO-VIN-00001/start", null);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
