using Xunit;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace FormulaD.Mes.Api.Tests;

public sealed class ApiTests
{
    [Fact]
    public async Task Health_Is_Anonymous_And_Reveals_Nothing()
    {
        using var factory = new ApiFactory(devAuthEnabled: false);
        var response = await factory.CreateClient().GetAsync("/api/v1/health/live");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal("{\"status\":\"ok\"}", body);
    }

    [Theory]
    [InlineData("/api/v1/production-plan")]
    [InlineData("/api/v1/production-plan/DEMO-VIN-00001")]
    [InlineData("/api/v1/production-plan/statuses")]
    [InlineData("/api/v1/auth/me")]
    public async Task Business_Endpoints_Require_Auth(string path)
    {
        using var factory = new ApiFactory(devAuthEnabled: false);
        var response = await factory.CreateClient().GetAsync(path);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DevLogin_Route_Absent_When_Disabled()
    {
        using var factory = new ApiFactory(devAuthEnabled: false);
        var response = await factory.CreateClient()
            .PostAsJsonAsync("/api/v1/dev-auth/login", new { username = "x", password = "y" });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task DevLogin_Rejects_Wrong_Password()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var response = await factory.CreateClient()
            .PostAsJsonAsync("/api/v1/dev-auth/login", new { username = ApiFactory.Login, password = "wrong" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Plan_Is_Paged_And_Sorted_By_Vin()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var page = await client.GetFromJsonAsync<PagedResult<ProductionPlanItem>>("/api/v1/production-plan?page=1&pageSize=2");

        Assert.NotNull(page);
        Assert.Equal(6, page.Total);
        Assert.Equal(2, page.Items.Count);
        Assert.Equal(["DEMO-VIN-00001", "DEMO-VIN-00002"], page.Items.Select(i => i.Vin));
    }

    [Fact]
    public async Task Vin_Filter_Is_Substring_Search()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var page = await client.GetFromJsonAsync<PagedResult<ProductionPlanItem>>("/api/v1/production-plan?vin=00003");

        Assert.NotNull(page);
        Assert.Equal(1, page.Total);
        Assert.Equal("DEMO-VIN-00003", page.Items[0].Vin);
    }

    [Fact]
    public async Task Status_Filter_Matches_Source_Strings()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var page = await client.GetFromJsonAsync<PagedResult<ProductionPlanItem>>("/api/v1/production-plan?status=custom_unknown");

        Assert.NotNull(page);
        Assert.Equal(1, page.Total);
        Assert.Equal("DEMO-VIN-00006", page.Items[0].Vin);
    }

    [Fact]
    public async Task Statuses_Include_Null_From_Source()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var statuses = await client.GetFromJsonAsync<List<string?>>("/api/v1/production-plan/statuses");

        Assert.NotNull(statuses);
        Assert.Contains("in progress", statuses);
        Assert.Contains("custom_unknown", statuses);
        Assert.Contains(null, statuses);
    }

    [Fact]
    public async Task Card_By_Vin_And_404()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var item = await client.GetFromJsonAsync<ProductionPlanItem>("/api/v1/production-plan/DEMO-VIN-00004");
        Assert.NotNull(item);
        Assert.Equal("FOK", item.Status);
        Assert.Null(item.PlannedShipmentDate);

        var missing = await client.GetAsync("/api/v1/production-plan/DEMO-VIN-99999");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Theory]
    [InlineData("/api/v1/production-plan?page=0")]
    [InlineData("/api/v1/production-plan?pageSize=0")]
    [InlineData("/api/v1/production-plan?pageSize=101")]
    public async Task Invalid_Paging_Is_400(string path)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var response = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Too_Long_Vin_Is_400()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var response = await client.GetAsync("/api/v1/production-plan?vin=" + new string('A', 51));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("POST")]
    [InlineData("PUT")]
    [InlineData("PATCH")]
    [InlineData("DELETE")]
    public async Task Write_Methods_On_Production_Data_Are_Not_Allowed(string method)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), "/api/v1/production-plan/DEMO-VIN-00001"));

        Assert.True(
            response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed,
            $"{method} вернул {(int)response.StatusCode}");
    }

    [Fact]
    public async Task Dates_Are_Returned_Without_Timezone_Suffix()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        using var json = JsonDocument.Parse(await client.GetStringAsync("/api/v1/production-plan/DEMO-VIN-00001"));
        var startDate = json.RootElement.GetProperty("startDate").GetString();

        Assert.Equal("2026-10-20T09:00:00", startDate);
    }

    [Fact]
    public void Sql_DataSource_Without_Test_Marker_Fails_Closed()
    {
        using var factory = new SqlAttemptFactory();
        var error = Assert.Throws<InvalidOperationException>(() => factory.CreateClient());
        Assert.Contains("IsTestEnvironment", error.Message);
    }

    [Fact]
    public void Unknown_DataSource_Fails_Closed()
    {
        using var factory = new SqlAttemptFactory("Oracle");
        var error = Assert.Throws<InvalidOperationException>(() => factory.CreateClient());
        Assert.Contains("Oracle", error.Message);
    }
}
