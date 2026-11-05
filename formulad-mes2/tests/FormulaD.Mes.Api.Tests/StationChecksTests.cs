using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

/// <summary>Отметки проверки компонентов по станциям — Этап 5. Только демо.</summary>
public sealed class StationChecksTests
{
    [Fact]
    public async Task Checks_Require_Authentication()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var response = await factory.CreateClient().GetAsync("/api/v1/stations/DEMO-VIN-00001/checks");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Get_For_Unknown_Vin_Returns_404()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.GetAsync("/api/v1/stations/DEMO-VIN-99999/checks");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task New_Vin_Has_No_Checks_Yet()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var checks = await client.GetFromJsonAsync<Dictionary<string, ComponentCheck>>(
            "/api/v1/stations/DEMO-VIN-00001/checks");

        Assert.Empty(checks!);
    }

    [Fact]
    public async Task Set_Checked_Then_Unchecked_Round_Trips()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var checkedResponse = await client.PostAsJsonAsync(
            "/api/v1/stations/DEMO-VIN-00001/components/DEMO-CMP-014/check", new SetCheckRequest(true));
        checkedResponse.EnsureSuccessStatusCode();
        var checkedResult = await checkedResponse.Content.ReadFromJsonAsync<ComponentCheck>();
        Assert.True(checkedResult!.Checked);
        Assert.Equal("demo-operator", checkedResult.CheckedBy);
        Assert.NotNull(checkedResult.CheckedAt);

        var listed = await client.GetFromJsonAsync<Dictionary<string, ComponentCheck>>(
            "/api/v1/stations/DEMO-VIN-00001/checks");
        Assert.True(listed!["DEMO-CMP-014"].Checked);

        var uncheckedResponse = await client.PostAsJsonAsync(
            "/api/v1/stations/DEMO-VIN-00001/components/DEMO-CMP-014/check", new SetCheckRequest(false));
        uncheckedResponse.EnsureSuccessStatusCode();
        var uncheckedResult = await uncheckedResponse.Content.ReadFromJsonAsync<ComponentCheck>();
        Assert.False(uncheckedResult!.Checked);
        Assert.Null(uncheckedResult.CheckedBy);
        Assert.Null(uncheckedResult.CheckedAt);
    }

    [Fact]
    public async Task Checks_Are_Scoped_To_Vin()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        await client.PostAsJsonAsync("/api/v1/stations/DEMO-VIN-00001/components/DEMO-CMP-014/check", new SetCheckRequest(true));

        var otherVin = await client.GetFromJsonAsync<Dictionary<string, ComponentCheck>>(
            "/api/v1/stations/DEMO-VIN-00002/checks");

        Assert.Empty(otherVin!);
    }

    [Fact]
    public async Task Set_Checked_Unknown_Vin_Returns_404()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsJsonAsync(
            "/api/v1/stations/DEMO-VIN-99999/components/DEMO-CMP-014/check", new SetCheckRequest(true));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Set_Checked_Unknown_Component_Returns_400()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsJsonAsync(
            "/api/v1/stations/DEMO-VIN-00001/components/NOPE/check", new SetCheckRequest(true));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Stations_Route_Exists_In_Sql_Mode_Behind_Auth()
    {
        using var factory = new SqlConfiguredFactory();
        var response = await factory.CreateClient().GetAsync("/api/v1/stations/DEMO-VIN-00001/checks");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
