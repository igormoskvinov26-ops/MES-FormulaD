using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

/// <summary>Импорт производственного плана — Этап 8. Только демо.</summary>
public sealed class PlanImportTests
{
    private static ImportRawRow ValidRow(string vin = "DEMO-VIN-90001", string engine = "DEMO-ENGINE-90001") => new(
        Vin: vin,
        ModelArticle: "DEMO-800",
        EngineNumber: engine,
        Color: "Серый",
        SpecificationName: "Pathcross 1000 LTD · ДЕМО",
        PlannedStartDate: "2026-11-01",
        PlannedCompleteDate: "2026-11-03",
        PlannedShipmentDate: null);

    [Fact]
    public async Task Reference_Requires_Authentication()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var response = await factory.CreateClient().GetAsync("/api/v1/plan-import/reference");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Reference_Lists_Models_Colors_Specifications()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var reference = await client.GetFromJsonAsync<PlanReference>("/api/v1/plan-import/reference");

        Assert.NotNull(reference);
        Assert.Contains(reference.Models, m => m.Article == "DEMO-800");
        Assert.Contains("Серый", reference.Colors);
        Assert.Contains("Pathcross 1000 LTD · ДЕМО", reference.Specifications);
    }

    [Fact]
    public async Task Valid_Row_Stages_Without_Errors()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsJsonAsync("/api/v1/plan-import/sessions",
            new StageImportRequest([ValidRow()], "paste"));
        response.EnsureSuccessStatusCode();
        var session = await response.Content.ReadFromJsonAsync<ImportSession>();

        Assert.NotNull(session);
        Assert.Equal(1, session.TotalCount);
        Assert.Equal(0, session.ErrorCount);
        Assert.Equal("demo-operator", session.CreatedBy);
        Assert.Equal("paste", session.Source);
    }

    [Theory]
    [InlineData(null, "VIN не указан")]
    [InlineData("", "VIN не указан")]
    public async Task Missing_Vin_Is_Reported(string? vin, string expectedError)
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var row = ValidRow() with { Vin = vin };

        var response = await client.PostAsJsonAsync("/api/v1/plan-import/sessions", new StageImportRequest([row], "paste"));
        var session = await response.Content.ReadFromJsonAsync<ImportSession>();

        Assert.Equal(1, session!.ErrorCount);
        Assert.Contains(expectedError, session.Rows[0].Errors);
    }

    [Fact]
    public async Task Existing_Vin_Is_An_Error_Not_An_Update()
    {
        // DEMO-VIN-00001 уже есть в фикстуре — раздел 6.3, В-09: совпадение VIN всегда ошибка.
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var row = ValidRow() with { Vin = "DEMO-VIN-00001" };

        var response = await client.PostAsJsonAsync("/api/v1/plan-import/sessions", new StageImportRequest([row], "paste"));
        var session = await response.Content.ReadFromJsonAsync<ImportSession>();

        Assert.Equal(1, session!.ErrorCount);
        Assert.Contains("VIN уже есть в производственном плане", session.Rows[0].Errors);
    }

    [Fact]
    public async Task Duplicate_Vin_Within_Batch_Is_Reported_On_Both_Rows()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var row1 = ValidRow(vin: "DEMO-VIN-90002", engine: "DEMO-ENGINE-A");
        var row2 = ValidRow(vin: "DEMO-VIN-90002", engine: "DEMO-ENGINE-B");

        var response = await client.PostAsJsonAsync("/api/v1/plan-import/sessions", new StageImportRequest([row1, row2], "paste"));
        var session = await response.Content.ReadFromJsonAsync<ImportSession>();

        Assert.Equal(1, session!.ErrorCount);
        Assert.Contains("VIN повторяется в этой загрузке", session.Rows[1].Errors);
        Assert.Empty(session.Rows[0].Errors);
    }

    [Fact]
    public async Task Unknown_Color_Model_And_Bad_Date_Are_Reported()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var row = ValidRow() with { ModelArticle = "NOPE", Color = "Розовый единорог", PlannedStartDate = "not-a-date" };

        var response = await client.PostAsJsonAsync("/api/v1/plan-import/sessions", new StageImportRequest([row], "paste"));
        var session = await response.Content.ReadFromJsonAsync<ImportSession>();

        Assert.Equal(3, session!.Rows[0].Errors.Count);
        Assert.Contains(session.Rows[0].Errors, e => e.Contains("артикул модели"));
        Assert.Contains(session.Rows[0].Errors, e => e.Contains("Розовый единорог"));
        Assert.Contains(session.Rows[0].Errors, e => e.Contains("Дата старта"));
    }

    [Fact]
    public async Task Edit_Row_Fixes_Error_And_Revalidates()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var staged = await (await client.PostAsJsonAsync("/api/v1/plan-import/sessions",
            new StageImportRequest([ValidRow() with { Color = "" }], "paste"))).Content.ReadFromJsonAsync<ImportSession>();
        Assert.Equal(1, staged!.ErrorCount);

        var fixedRow = ValidRow();
        var response = await client.PutAsJsonAsync($"/api/v1/plan-import/sessions/{staged.Id}/rows/1", fixedRow);
        response.EnsureSuccessStatusCode();
        var session = await response.Content.ReadFromJsonAsync<ImportSession>();

        Assert.Equal(0, session!.ErrorCount);
    }

    [Fact]
    public async Task Publish_Is_Blocked_While_Errors_Remain()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var staged = await (await client.PostAsJsonAsync("/api/v1/plan-import/sessions",
            new StageImportRequest([ValidRow() with { Color = "" }], "paste"))).Content.ReadFromJsonAsync<ImportSession>();

        var response = await client.PostAsync($"/api/v1/plan-import/sessions/{staged!.Id}/publish", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Publish_Appends_To_End_Of_Queue_And_Prevents_Double_Publish()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();

        var before = await client.GetFromJsonAsync<PagedResult<ProductionPlanItem>>("/api/v1/production-plan?page=1&pageSize=1");
        var staged = await (await client.PostAsJsonAsync("/api/v1/plan-import/sessions",
            new StageImportRequest([ValidRow()], "paste"))).Content.ReadFromJsonAsync<ImportSession>();

        var publishResponse = await client.PostAsync($"/api/v1/plan-import/sessions/{staged!.Id}/publish", null);
        publishResponse.EnsureSuccessStatusCode();

        var created = await client.GetFromJsonAsync<ProductionPlanItem>("/api/v1/production-plan/DEMO-VIN-90001");
        Assert.NotNull(created);
        Assert.Equal(0, created.StatusId);
        Assert.Equal("planned", created.Status);
        Assert.Null(created.StartDate);
        Assert.Equal("Квадроцикл 800 · ДЕМО", created.ModelName);

        var after = await client.GetFromJsonAsync<PagedResult<ProductionPlanItem>>("/api/v1/production-plan?page=1&pageSize=1");
        Assert.Equal(before!.Total + 1, after!.Total);

        // Повторная публикация того же session id не создаёт дубль — сессии уже нет.
        var secondPublish = await client.PostAsync($"/api/v1/plan-import/sessions/{staged.Id}/publish", null);
        Assert.Equal(HttpStatusCode.NotFound, secondPublish.StatusCode);
    }

    [Fact]
    public async Task Plan_Import_Routes_Do_Not_Exist_In_Sql_Mode()
    {
        using var factory = new SqlConfiguredFactory();
        var response = await factory.CreateClient().GetAsync("/api/v1/plan-import/reference");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
