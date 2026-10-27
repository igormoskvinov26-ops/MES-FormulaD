using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

/// <summary>NCP — только демо-источник (docs/DEVELOPMENT_PLAN.md, Этап 2).</summary>
public sealed class NcpTests
{
    [Theory]
    [InlineData("/api/v1/ncp")]
    [InlineData("/api/v1/ncp/types")]
    [InlineData("/api/v1/ncp/stations")]
    [InlineData("/api/v1/ncp/components")]
    public async Task Ncp_Endpoints_Require_Auth(string path)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var response = await factory.CreateClient().GetAsync(path);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task List_Is_Sorted_Newest_First_And_Has_Known_Fixture_Count()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var page = await client.GetFromJsonAsync<PagedResult<NcpItem>>("/api/v1/ncp?pageSize=100");

        Assert.NotNull(page);
        Assert.Equal(5, page.Total);
        Assert.Equal("NC-2026-0005", page.Items[0].Number); // самая новая по дате создания
    }

    [Fact]
    public async Task Filter_By_Vin_And_Status_Work()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var byVin = await client.GetFromJsonAsync<PagedResult<NcpItem>>("/api/v1/ncp?vin=DEMO-VIN-00001");
        Assert.NotNull(byVin);
        Assert.Equal(2, byVin.Total);

        var open = await client.GetFromJsonAsync<PagedResult<NcpItem>>("/api/v1/ncp?status=Открыто");
        Assert.NotNull(open);
        Assert.Equal(3, open.Total);
        Assert.All(open.Items, i => Assert.Equal("Открыто", i.Status));
    }

    [Fact]
    public async Task Types_And_Stations_Are_Fixed_Lists()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var types = await client.GetFromJsonAsync<List<string>>("/api/v1/ncp/types");
        Assert.Equal(["Брак", "Пересорт", "Недостача", "Прочее"], types);

        var stations = await client.GetFromJsonAsync<List<string>>("/api/v1/ncp/stations");
        Assert.Equal(11, stations!.Count);
        Assert.Equal("1", stations[0]);
        Assert.Equal("11", stations[^1]);
    }

    [Fact]
    public async Task Create_Succeeds_With_Valid_Data_And_Appears_In_List()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsJsonAsync("/api/v1/ncp", new CreateNcpRequest(
            Vin: "DEMO-VIN-00002", Station: "4", ComponentCode: "DEMO-CMP-510",
            Quantity: 1, Type: "Брак", OperatorComment: "Тестовая запись"));

        response.EnsureSuccessStatusCode();
        var created = await response.Content.ReadFromJsonAsync<NcpItem>();
        Assert.NotNull(created);
        Assert.Equal("Открыто", created.Status);
        Assert.False(created.PartInstalled);
        Assert.Null(created.EngineerComment);
        Assert.Equal("demo-operator", created.CreatedBy);

        var page = await client.GetFromJsonAsync<PagedResult<NcpItem>>("/api/v1/ncp?vin=DEMO-VIN-00002");
        Assert.Equal(1, page!.Total);
    }

    [Fact]
    public async Task Create_Rejects_Unknown_Vin_With_404()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsJsonAsync("/api/v1/ncp", new CreateNcpRequest(
            "DEMO-VIN-99999", "1", "DEMO-CMP-014", 1, "Брак", null));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("DEMO-VIN-00001", "1", "DEMO-CMP-999", 1, "Брак")] // компонента нет
    [InlineData("DEMO-VIN-00001", "99", "DEMO-CMP-014", 1, "Брак")] // станции нет
    [InlineData("DEMO-VIN-00001", "1", "DEMO-CMP-014", 0, "Брак")] // количество вне диапазона
    [InlineData("DEMO-VIN-00001", "1", "DEMO-CMP-014", 1, "Авария")] // типа нет в справочнике
    public async Task Create_Rejects_Invalid_Input_With_400(string vin, string station, string component, int qty, string type)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsJsonAsync("/api/v1/ncp", new CreateNcpRequest(vin, station, component, qty, type, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PartInstalled_Is_Separate_From_Status()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        // NC-2026-0001 (id=1) открыта, деталь не установлена.
        var response = await client.PostAsJsonAsync("/api/v1/ncp/1/part-installed", new SetPartInstalledRequest(true));
        response.EnsureSuccessStatusCode();
        var updated = await response.Content.ReadFromJsonAsync<NcpItem>();

        Assert.NotNull(updated);
        Assert.True(updated.PartInstalled);
        // Статус заявки не меняется отметкой об установке — это раздельные состояния (раздел 16).
        Assert.Equal("Открыто", updated.Status);
    }

    [Fact]
    public async Task Close_Sets_Status_And_Engineer_Comment_Without_Requiring_Part_Installed()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        // NC-2026-0005 (id=5) открыта, деталь не установлена — закрытие не требует этого флага.
        var response = await client.PostAsJsonAsync("/api/v1/ncp/5/close", new CloseNcpRequest("Пересорт подтверждён поставщиком"));
        response.EnsureSuccessStatusCode();
        var closed = await response.Content.ReadFromJsonAsync<NcpItem>();

        Assert.NotNull(closed);
        Assert.Equal("Закрыто", closed.Status);
        Assert.False(closed.PartInstalled);
        Assert.Equal("Пересорт подтверждён поставщиком", closed.EngineerComment);
        Assert.NotNull(closed.ClosedAt);
        Assert.Equal("demo-operator", closed.ClosedBy);
    }

    [Fact]
    public async Task Close_Twice_Returns_400_Second_Time()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        // NC-2026-0003 (id=3) уже закрыта в фикстуре.
        var response = await client.PostAsJsonAsync("/api/v1/ncp/3/close", new CloseNcpRequest(null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_Id_Actions_Return_404()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var close = await client.PostAsJsonAsync("/api/v1/ncp/9999/close", new CloseNcpRequest(null));
        Assert.Equal(HttpStatusCode.NotFound, close.StatusCode);

        var install = await client.PostAsJsonAsync("/api/v1/ncp/9999/part-installed", new SetPartInstalledRequest(true));
        Assert.Equal(HttpStatusCode.NotFound, install.StatusCode);
    }

    [Fact]
    public async Task Ncp_Routes_Do_Not_Exist_In_Sql_Mode()
    {
        // Валидная (не фактически подключаемая) SQL-конфигурация проходит старт приложения;
        // маршруты /api/v1/ncp/* при этом не регистрируются вообще (см. Program.cs) —
        // в отличие от 401 (эндпоинт есть, но закрыт), здесь должен быть 404 (эндпоинта нет).
        using var factory = new SqlConfiguredFactory();
        var response = await factory.CreateClient().GetAsync("/api/v1/ncp");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Components_Carry_Station_For_Client_Side_Filtering()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var components = await client.GetFromJsonAsync<List<ComponentItem>>("/api/v1/ncp/components");

        Assert.NotNull(components);
        Assert.Contains(components, c => c.Code == "DEMO-CMP-014" && c.Station == "3");
    }
}
