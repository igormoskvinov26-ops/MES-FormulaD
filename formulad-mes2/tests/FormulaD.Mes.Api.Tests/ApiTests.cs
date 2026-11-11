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
        using var factory = new ApiFactory(userExists: false);
        var response = await factory.CreateClient().GetAsync("/api/v1/health/live");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal("{\"status\":\"ok\"}", body);
    }

    [Fact]
    public async Task Health_Ready_Is_Anonymous_And_Returns_Degraded_Without_Sql()
    {
        using var factory = new ApiFactory(userExists: false);
        var response = await factory.CreateClient().GetAsync("/api/v1/health/ready");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("degraded", body);
        // T-102: no connection details leak
        Assert.DoesNotContain("Server=", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Password=", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Version_Is_Anonymous_And_Returns_Version_String()
    {
        using var factory = new ApiFactory(userExists: false);
        var response = await factory.CreateClient().GetAsync("/api/v1/version");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("version", body);
    }

    [Fact]
    public async Task Responses_Include_Security_Headers()
    {
        using var factory = new ApiFactory(userExists: false);
        var response = await factory.CreateClient().GetAsync("/api/v1/health/live");

        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("strict-origin-when-cross-origin", response.Headers.GetValues("Referrer-Policy").Single());
    }

    [Theory]
    [InlineData("/api/v1/production-plan")]
    [InlineData("/api/v1/production-plan/DEMO-VIN-00001")]
    [InlineData("/api/v1/production-plan/statuses")]
    [InlineData("/api/v1/auth/me")]
    public async Task Business_Endpoints_Require_Auth(string path)
    {
        using var factory = new ApiFactory(userExists: false);
        var response = await factory.CreateClient().GetAsync(path);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task FormLogin_Route_Absent_When_Disabled()
    {
        using var factory = new ApiFactory(userExists: false);
        var response = await factory.CreateClient()
            .PostAsJsonAsync("/api/v1/auth/login", new { login = "x" });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Login_Rejects_Unknown_User()
    {
        using var factory = new ApiFactory(userExists: true);
        var response = await factory.CreateClient()
            .PostAsJsonAsync("/api/v1/auth/login", new { login = "no-such-user" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Login_Returns_Role_And_FullName_From_Directory()
    {
        using var factory = new ApiFactory(userExists: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var me = await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/me");

        Assert.Equal(ApiFactory.Login, me.GetProperty("userName").GetString());
        Assert.Equal("Демо Оператор", me.GetProperty("fullName").GetString());
        Assert.Equal(ApiFactory.Role, me.GetProperty("role").GetString());
    }

    [Fact]
    public async Task Plan_Is_Paged_And_Sorted_By_Seqn()
    {
        using var factory = new ApiFactory(userExists: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var page = await client.GetFromJsonAsync<PagedResult<ProductionPlanItem>>("/api/v1/production-plan?page=1&pageSize=2");

        Assert.NotNull(page);
        Assert.Equal(6, page.Total);
        Assert.Equal(2, page.Items.Count);
        Assert.Equal(["DEMO-VIN-00001", "DEMO-VIN-00002"], page.Items.Select(i => i.Vin));
        Assert.Equal([23, 24], page.Items.Select(i => i.Seqn));

        // Изделие без порядка (SEQN IS NULL) уходит в конец плана, а не в начало.
        var all = await client.GetFromJsonAsync<PagedResult<ProductionPlanItem>>("/api/v1/production-plan?pageSize=100");
        Assert.NotNull(all);
        Assert.Null(all.Items[^1].Seqn);
        Assert.Equal("DEMO-VIN-00005", all.Items[^1].Vin);
    }

    [Fact]
    public async Task Vin_Filter_Matches_Prefix_And_Suffix()
    {
        using var factory = new ApiFactory(userExists: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var byPrefix = await client.GetFromJsonAsync<PagedResult<ProductionPlanItem>>("/api/v1/production-plan?vin=demo-vin-00003");

        Assert.NotNull(byPrefix);
        Assert.Equal(1, byPrefix.Total);
        Assert.Equal("DEMO-VIN-00003", byPrefix.Items[0].Vin);

        // Оператор набирает руками последние цифры VIN.
        var bySuffix = await client.GetFromJsonAsync<PagedResult<ProductionPlanItem>>("/api/v1/production-plan?vin=00003");
        Assert.NotNull(bySuffix);
        Assert.Equal(1, bySuffix.Total);
        Assert.Equal("DEMO-VIN-00003", bySuffix.Items[0].Vin);

        // Середина VIN не ищется — осознанное ограничение ради скорости пути сканера.
        var byMiddle = await client.GetFromJsonAsync<PagedResult<ProductionPlanItem>>("/api/v1/production-plan?vin=VIN-0000");
        Assert.NotNull(byMiddle);
        Assert.Equal(0, byMiddle.Total);

        // Ввод с буквами — всегда поиск по началу, по концу он не срабатывает.
        var lettersAsSuffix = await client.GetFromJsonAsync<PagedResult<ProductionPlanItem>>("/api/v1/production-plan?vin=N-00003");
        Assert.NotNull(lettersAsSuffix);
        Assert.Equal(0, lettersAsSuffix.Total);
    }

    [Fact]
    public async Task Status_Filter_Matches_Source_Strings()
    {
        using var factory = new ApiFactory(userExists: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var page = await client.GetFromJsonAsync<PagedResult<ProductionPlanItem>>("/api/v1/production-plan?status=custom_unknown");

        Assert.NotNull(page);
        Assert.Equal(1, page.Total);
        Assert.Equal("DEMO-VIN-00006", page.Items[0].Vin);
    }

    [Fact]
    public async Task Statuses_Include_Null_From_Source()
    {
        using var factory = new ApiFactory(userExists: true);
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
        using var factory = new ApiFactory(userExists: true);
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
        using var factory = new ApiFactory(userExists: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var response = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Too_Long_Vin_Is_400()
    {
        using var factory = new ApiFactory(userExists: true);
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
        using var factory = new ApiFactory(userExists: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), "/api/v1/production-plan/DEMO-VIN-00001"));

        Assert.True(
            response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed,
            $"{method} вернул {(int)response.StatusCode}");
    }

    [Fact]
    public async Task Dates_Are_Returned_Without_Timezone_Suffix()
    {
        using var factory = new ApiFactory(userExists: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        using var json = JsonDocument.Parse(await client.GetStringAsync("/api/v1/production-plan/DEMO-VIN-00001"));
        var startDate = json.RootElement.GetProperty("startDate").GetString();

        Assert.Equal("2026-10-20T09:00:00", startDate);
    }

}

/// <summary>Перестановка порядка.</summary>
public sealed class MoveTests
{
    private static async Task<List<(string Vin, int? Seqn)>> OrderAsync(HttpClient client)
    {
        var page = await client.GetFromJsonAsync<PagedResult<ProductionPlanItem>>("/api/v1/production-plan?pageSize=100");
        return page!.Items.Select(i => (i.Vin, i.Seqn)).ToList();
    }

    [Fact]
    public async Task Move_Up_Swaps_With_Neighbour_And_Keeps_Numbering()
    {
        using var factory = new ApiFactory(userExists: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var before = await OrderAsync(client);
        Assert.Equal(["DEMO-VIN-00001", "DEMO-VIN-00002", "DEMO-VIN-00003"], before.Take(3).Select(x => x.Vin));

        // Третье изделие (позиция 25) поднимаем на позицию 24.
        var response = await client.PostAsJsonAsync("/api/v1/production-plan/DEMO-VIN-00003/move", new { toPosition = 24 });
        response.EnsureSuccessStatusCode();

        var after = await OrderAsync(client);
        Assert.Equal(["DEMO-VIN-00001", "DEMO-VIN-00003", "DEMO-VIN-00002"], after.Take(3).Select(x => x.Vin));
        // Набор номеров позиций не изменился — ни дыр, ни дублей не появилось.
        Assert.Equal(before.Select(x => x.Seqn), after.Select(x => x.Seqn));
    }

    [Fact]
    public async Task Move_Far_Shifts_Whole_Range()
    {
        using var factory = new ApiFactory(userExists: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        // Изделие с позиции 28 переносим в начало плана, на позицию 23.
        var response = await client.PostAsJsonAsync("/api/v1/production-plan/DEMO-VIN-00006/move", new { toPosition = 23 });
        response.EnsureSuccessStatusCode();

        var after = await OrderAsync(client);
        Assert.Equal(
            ["DEMO-VIN-00006", "DEMO-VIN-00001", "DEMO-VIN-00002", "DEMO-VIN-00003", "DEMO-VIN-00004"],
            after.Take(5).Select(x => x.Vin));
        Assert.Equal([23, 24, 25, 26, 28], after.Take(5).Select(x => x.Seqn));
    }

    [Fact]
    public async Task Move_Requires_Authentication()
    {
        using var factory = new ApiFactory(userExists: true);
        var response = await factory.CreateClient()
            .PostAsJsonAsync("/api/v1/production-plan/DEMO-VIN-00003/move", new { toPosition = 24 });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("DEMO-VIN-99999", 24, HttpStatusCode.NotFound)]
    [InlineData("DEMO-VIN-00005", 24, HttpStatusCode.BadRequest)] // у изделия нет позиции
    [InlineData("DEMO-VIN-00003", 999, HttpStatusCode.BadRequest)] // такой позиции в плане нет
    [InlineData("DEMO-VIN-00003", 0, HttpStatusCode.BadRequest)]
    public async Task Move_Rejects_Bad_Input(string vin, int toPosition, HttpStatusCode expected)
    {
        using var factory = new ApiFactory(userExists: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsJsonAsync($"/api/v1/production-plan/{vin}/move", new { toPosition });

        Assert.Equal(expected, response.StatusCode);
    }

    // T-096: contract tests — OpenAPI schema contains expected endpoints
    [Fact]
    public async Task OpenApi_Schema_Contains_Expected_Endpoints()
    {
        using var factory = new ApiFactory(userExists: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.GetAsync("/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        var doc = JsonDocument.Parse(body);
        var paths = doc.RootElement.GetProperty("paths");

        string[] expected =
        [
            "/api/v1/health/live",
            "/api/v1/health/ready",
            "/api/v1/version",
            "/api/v1/production-plan/statuses",
            "/api/v1/production-plan",
            "/api/v1/ncp",
            "/api/v1/ncp/types",
            "/api/v1/stations/{vin}/checks",
        ];

        foreach (var path in expected)
            Assert.True(paths.TryGetProperty(path, out _), $"Missing endpoint: {path}");
    }
}
