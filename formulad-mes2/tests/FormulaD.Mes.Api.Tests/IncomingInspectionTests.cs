using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

/// <summary>Входной контроль — Этап 9. Только демо.</summary>
public sealed class IncomingInspectionTests
{
    private static PackingListRawRow Row(
        string hu = "HU-001", string article = "DEMO-CMP-031", string qty = "20", string? name = "Диск тормозной передний · ДЕМО")
        => new(PackageNumber: hu, Article: article, ComponentName: name, Quantity: qty, NetWeight: null, GrossWeight: null, Batch: "B-1");

    private sealed class DeliveryContext(ApiFactory factory, HttpClient client, Delivery delivery) : IDisposable
    {
        public HttpClient Client { get; } = client;
        public Delivery Delivery { get; } = delivery;
        public void Dispose() => factory.Dispose();
    }

    private static async Task<DeliveryContext> CreateDeliveryAsync()
    {
        var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var response = await client.PostAsJsonAsync("/api/v1/incoming-inspection/deliveries",
            new CreateDeliveryRequest("DEMO-SUP-01", "INV-2026-001", "2026-10-27", null));
        response.EnsureSuccessStatusCode();
        var delivery = (await response.Content.ReadFromJsonAsync<Delivery>())!;
        return new DeliveryContext(factory, client, delivery);
    }

    private static async Task<Delivery> StageAndConfirmAsync(HttpClient client, string deliveryId, params PackingListRawRow[] rows)
    {
        var staged = await (await client.PostAsJsonAsync($"/api/v1/incoming-inspection/deliveries/{deliveryId}/packing-list/sessions",
            new StagePackingListRequest(rows))).Content.ReadFromJsonAsync<PackingListSession>();
        Assert.Equal(0, staged!.ErrorCount);
        var confirmed = await client.PostAsync($"/api/v1/incoming-inspection/packing-list/sessions/{staged.Id}/confirm", null);
        confirmed.EnsureSuccessStatusCode();
        return (await confirmed.Content.ReadFromJsonAsync<Delivery>())!;
    }

    [Fact]
    public async Task Suppliers_Require_Authentication()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var response = await factory.CreateClient().GetAsync("/api/v1/incoming-inspection/suppliers");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Suppliers_List_Includes_Parent_Plant_Flag()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var suppliers = await client.GetFromJsonAsync<List<SupplierRef>>("/api/v1/incoming-inspection/suppliers");
        Assert.Contains(suppliers!, s => s.IsParentPlant);
    }

    [Fact]
    public async Task Create_Delivery_With_Unknown_Supplier_Is_Rejected()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var response = await client.PostAsJsonAsync("/api/v1/incoming-inspection/deliveries",
            new CreateDeliveryRequest("NOPE", "INV-1", "2026-10-27", null));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_Delivery_Starts_Open_With_No_Packages()
    {
        using var ctx = await CreateDeliveryAsync();
        var delivery = ctx.Delivery;
        Assert.Equal(DeliveryStatuses.Open, delivery.Status);
        Assert.Empty(delivery.Packages);
    }

    [Fact]
    public async Task Unknown_Article_Is_Reported_And_Blocks_Staging()
    {
        using var ctx = await CreateDeliveryAsync();
        var client = ctx.Client;
        var delivery = ctx.Delivery;
        var row = Row(article: "NOPE-ARTICLE");

        var response = await client.PostAsJsonAsync($"/api/v1/incoming-inspection/deliveries/{delivery.Id}/packing-list/sessions",
            new StagePackingListRequest([row]));
        var session = await response.Content.ReadFromJsonAsync<PackingListSession>();

        Assert.Equal(1, session!.ErrorCount);
        Assert.Contains(session.Rows[0].Errors, e => e.Contains("не найден в справочнике"));
    }

    [Fact]
    public async Task Adding_Unknown_Article_To_Catalog_Unblocks_Staging()
    {
        using var ctx = await CreateDeliveryAsync();
        var client = ctx.Client;
        var delivery = ctx.Delivery;
        var addResponse = await client.PostAsJsonAsync("/api/v1/incoming-inspection/components",
            new AddComponentRequest("DEMO-CMP-999", "Новый артикул · ДЕМО"));
        addResponse.EnsureSuccessStatusCode();

        var staged = await (await client.PostAsJsonAsync($"/api/v1/incoming-inspection/deliveries/{delivery.Id}/packing-list/sessions",
            new StagePackingListRequest([Row(article: "DEMO-CMP-999")]))).Content.ReadFromJsonAsync<PackingListSession>();

        Assert.Equal(0, staged!.ErrorCount);
    }

    [Fact]
    public async Task Confirm_Groups_Rows_Into_Packages_By_Hu_And_Snapshots_Quota()
    {
        // DEMO-CMP-014 имеет норматив 25% (fixtures/inspection-quotas.demo.json) — при 20 шт. это 5.
        using var ctx = await CreateDeliveryAsync();
        var client = ctx.Client;
        var delivery = ctx.Delivery;
        var confirmed = await StageAndConfirmAsync(client, delivery.Id,
            Row(hu: "HU-001", article: "DEMO-CMP-014", qty: "20"),
            Row(hu: "HU-001", article: "DEMO-CMP-031", qty: "10"),
            Row(hu: "HU-002", article: "DEMO-CMP-031", qty: "5"));

        Assert.Equal(2, confirmed.Packages.Count);
        var hu1 = confirmed.Packages.Single(p => p.HuNumber == "HU-001");
        Assert.Equal(2, hu1.Rows.Count);
        var quotaRow = hu1.Rows.Single(r => r.ComponentCode == "DEMO-CMP-014");
        Assert.Equal(5, quotaRow.RequiredQuantity);
        var fullRow = hu1.Rows.Single(r => r.ComponentCode == "DEMO-CMP-031");
        Assert.Equal(10, fullRow.RequiredQuantity); // по умолчанию 100%
    }

    [Fact]
    public async Task Edit_Row_Revalidates_Session()
    {
        using var ctx = await CreateDeliveryAsync();
        var client = ctx.Client;
        var delivery = ctx.Delivery;
        var staged = await (await client.PostAsJsonAsync($"/api/v1/incoming-inspection/deliveries/{delivery.Id}/packing-list/sessions",
            new StagePackingListRequest([Row(qty: "-5")]))).Content.ReadFromJsonAsync<PackingListSession>();
        Assert.Equal(1, staged!.ErrorCount);

        var response = await client.PutAsJsonAsync(
            $"/api/v1/incoming-inspection/packing-list/sessions/{staged.Id}/rows/1", Row(qty: "20"));
        response.EnsureSuccessStatusCode();
        var session = await response.Content.ReadFromJsonAsync<PackingListSession>();

        Assert.Equal(0, session!.ErrorCount);
    }

    [Fact]
    public async Task Confirm_Is_Blocked_While_Errors_Remain()
    {
        using var ctx = await CreateDeliveryAsync();
        var client = ctx.Client;
        var delivery = ctx.Delivery;
        var staged = await (await client.PostAsJsonAsync($"/api/v1/incoming-inspection/deliveries/{delivery.Id}/packing-list/sessions",
            new StagePackingListRequest([Row(article: "NOPE")]))).Content.ReadFromJsonAsync<PackingListSession>();

        var response = await client.PostAsync($"/api/v1/incoming-inspection/packing-list/sessions/{staged!.Id}/confirm", null);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Recording_Ok_Result_Accumulates_And_Caps_At_Required_Quantity()
    {
        using var ctx = await CreateDeliveryAsync();
        var client = ctx.Client;
        var delivery = ctx.Delivery;
        var confirmed = await StageAndConfirmAsync(client, delivery.Id, Row(article: "DEMO-CMP-014", qty: "20")); // required = 5
        var package = confirmed.Packages[0];
        var row = package.Rows[0];

        var ok1 = await client.PostAsJsonAsync($"/api/v1/incoming-inspection/packages/{package.Id}/rows/{row.Id}/result",
            new RecordRowResultRequest("OK", 4, null));
        ok1.EnsureSuccessStatusCode();

        var exceeding = await client.PostAsJsonAsync($"/api/v1/incoming-inspection/packages/{package.Id}/rows/{row.Id}/result",
            new RecordRowResultRequest("OK", 2, null)); // 4+2=6 > required(5)
        Assert.Equal(HttpStatusCode.BadRequest, exceeding.StatusCode);

        var ok2 = await client.PostAsJsonAsync($"/api/v1/incoming-inspection/packages/{package.Id}/rows/{row.Id}/result",
            new RecordRowResultRequest("OK", 1, null));
        var updated = await ok2.Content.ReadFromJsonAsync<Package>();
        Assert.Equal(5, updated!.Rows[0].OkQuantity);
        Assert.True(updated.Rows[0].IsComplete);
        Assert.False(updated.HasIssues);
    }

    [Fact]
    public async Task Shortage_Counts_Toward_Completeness_Without_Being_Ok()
    {
        // В-31: недостача 2 из норматива 5 (физически проверить нельзя) + 3 OK = завершено.
        using var ctx = await CreateDeliveryAsync();
        var client = ctx.Client;
        var delivery = ctx.Delivery;
        var confirmed = await StageAndConfirmAsync(client, delivery.Id, Row(article: "DEMO-CMP-014", qty: "20"));
        var package = confirmed.Packages[0];
        var row = package.Rows[0];

        await client.PostAsJsonAsync($"/api/v1/incoming-inspection/packages/{package.Id}/rows/{row.Id}/result",
            new RecordRowResultRequest("OK", 3, null));
        var afterShortage = await (await client.PostAsJsonAsync(
            $"/api/v1/incoming-inspection/packages/{package.Id}/rows/{row.Id}/result",
            new RecordRowResultRequest("Недостача", 2, "не доехало"))).Content.ReadFromJsonAsync<Package>();

        Assert.True(afterShortage!.Rows[0].IsComplete);
        Assert.True(afterShortage.HasIssues);
    }

    [Fact]
    public async Task Close_Package_Requires_Completeness()
    {
        using var ctx = await CreateDeliveryAsync();
        var client = ctx.Client;
        var delivery = ctx.Delivery;
        var confirmed = await StageAndConfirmAsync(client, delivery.Id, Row(article: "DEMO-CMP-014", qty: "20"));
        var package = confirmed.Packages[0];

        var tooEarly = await client.PostAsync($"/api/v1/incoming-inspection/packages/{package.Id}/close", null);
        Assert.Equal(HttpStatusCode.BadRequest, tooEarly.StatusCode);
    }

    [Fact]
    public async Task Close_Package_Clean_Marks_No_Issues_And_Verifies_Delivery()
    {
        using var ctx = await CreateDeliveryAsync();
        var client = ctx.Client;
        var delivery = ctx.Delivery;
        var confirmed = await StageAndConfirmAsync(client, delivery.Id, Row(article: "DEMO-CMP-014", qty: "20")); // required 5
        var package = confirmed.Packages[0];
        var row = package.Rows[0];
        await client.PostAsJsonAsync($"/api/v1/incoming-inspection/packages/{package.Id}/rows/{row.Id}/result",
            new RecordRowResultRequest("OK", 5, null));

        var closeResponse = await client.PostAsync($"/api/v1/incoming-inspection/packages/{package.Id}/close", null);
        closeResponse.EnsureSuccessStatusCode();
        var closed = await closeResponse.Content.ReadFromJsonAsync<Package>();
        Assert.Equal(PackageStatuses.Closed, closed!.Status);
        Assert.False(closed.HasIssues);

        var finalDelivery = await client.GetFromJsonAsync<Delivery>($"/api/v1/incoming-inspection/deliveries/{delivery.Id}");
        Assert.Equal(DeliveryStatuses.Verified, finalDelivery!.Status);
    }

    [Fact]
    public async Task Close_Package_With_Defect_Marks_Delivery_Verified_With_Issues()
    {
        using var ctx = await CreateDeliveryAsync();
        var client = ctx.Client;
        var delivery = ctx.Delivery;
        var confirmed = await StageAndConfirmAsync(client, delivery.Id, Row(article: "DEMO-CMP-014", qty: "20")); // required 5
        var package = confirmed.Packages[0];
        var row = package.Rows[0];
        await client.PostAsJsonAsync($"/api/v1/incoming-inspection/packages/{package.Id}/rows/{row.Id}/result",
            new RecordRowResultRequest("Брак", 5, "видимая трещина"));

        await client.PostAsync($"/api/v1/incoming-inspection/packages/{package.Id}/close", null);

        var finalDelivery = await client.GetFromJsonAsync<Delivery>($"/api/v1/incoming-inspection/deliveries/{delivery.Id}");
        Assert.Equal(DeliveryStatuses.VerifiedWithIssues, finalDelivery!.Status);
    }

    [Fact]
    public async Task Closed_Package_Rejects_New_Results_Until_Reopened()
    {
        using var ctx = await CreateDeliveryAsync();
        var client = ctx.Client;
        var delivery = ctx.Delivery;
        var confirmed = await StageAndConfirmAsync(client, delivery.Id, Row(article: "DEMO-CMP-014", qty: "20"));
        var package = confirmed.Packages[0];
        var row = package.Rows[0];
        await client.PostAsJsonAsync($"/api/v1/incoming-inspection/packages/{package.Id}/rows/{row.Id}/result",
            new RecordRowResultRequest("OK", 5, null));
        await client.PostAsync($"/api/v1/incoming-inspection/packages/{package.Id}/close", null);

        var blocked = await client.PostAsJsonAsync($"/api/v1/incoming-inspection/packages/{package.Id}/rows/{row.Id}/result",
            new RecordRowResultRequest("OK", 1, null));
        Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);

        var reopenNoComment = await client.PostAsJsonAsync($"/api/v1/incoming-inspection/packages/{package.Id}/reopen", new ReopenRequest(""));
        Assert.Equal(HttpStatusCode.BadRequest, reopenNoComment.StatusCode);

        var reopen = await client.PostAsJsonAsync($"/api/v1/incoming-inspection/packages/{package.Id}/reopen", new ReopenRequest("ошибка оператора"));
        reopen.EnsureSuccessStatusCode();
        var reopened = await reopen.Content.ReadFromJsonAsync<Package>();
        Assert.Equal(PackageStatuses.Open, reopened!.Status);
    }

    [Fact]
    public async Task Increase_Quota_Requires_Comment_And_Larger_Value()
    {
        using var ctx = await CreateDeliveryAsync();
        var client = ctx.Client;
        var delivery = ctx.Delivery;
        var confirmed = await StageAndConfirmAsync(client, delivery.Id, Row(article: "DEMO-CMP-014", qty: "20")); // required 5
        var package = confirmed.Packages[0];
        var row = package.Rows[0];

        var noComment = await client.PostAsJsonAsync($"/api/v1/incoming-inspection/packages/{package.Id}/rows/{row.Id}/quota",
            new IncreaseQuotaRequest(10, ""));
        Assert.Equal(HttpStatusCode.BadRequest, noComment.StatusCode);

        var tooSmall = await client.PostAsJsonAsync($"/api/v1/incoming-inspection/packages/{package.Id}/rows/{row.Id}/quota",
            new IncreaseQuotaRequest(5, "нашли брак, проверяем всё"));
        Assert.Equal(HttpStatusCode.BadRequest, tooSmall.StatusCode);

        var ok = await client.PostAsJsonAsync($"/api/v1/incoming-inspection/packages/{package.Id}/rows/{row.Id}/quota",
            new IncreaseQuotaRequest(20, "нашли брак, проверяем всё"));
        ok.EnsureSuccessStatusCode();
        var updated = await ok.Content.ReadFromJsonAsync<Package>();
        Assert.Equal(20, updated!.Rows[0].RequiredQuantity);
    }

    [Fact]
    public async Task Scan_Opens_Package_By_Hu_Within_Delivery()
    {
        using var ctx = await CreateDeliveryAsync();
        var client = ctx.Client;
        var delivery = ctx.Delivery;
        await StageAndConfirmAsync(client, delivery.Id, Row(hu: "HU-777"));

        var found = await client.GetAsync($"/api/v1/incoming-inspection/deliveries/{delivery.Id}/packages/by-hu/HU-777");
        found.EnsureSuccessStatusCode();

        var notFound = await client.GetAsync($"/api/v1/incoming-inspection/deliveries/{delivery.Id}/packages/by-hu/NOPE");
        Assert.Equal(HttpStatusCode.NotFound, notFound.StatusCode);
    }

    [Fact]
    public async Task Incoming_Inspection_Routes_Exist_In_Sql_Mode_Behind_Auth()
    {
        using var factory = new SqlConfiguredFactory();
        var response = await factory.CreateClient().GetAsync("/api/v1/incoming-inspection/suppliers");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
