using System.Net.Http.Json;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

/// <summary>
/// Семантика `POST /production-plan/{vin}/move`, на которую опирается календарь (перенос карточек): изделие занимает
/// позицию целевого — вверх встаёт ПЕРЕД ним, вниз — ПОСЛЕ него; набор номеров позиций не меняется; перенос обратно
/// на прежнюю позицию возвращает исходный порядок (откат).
/// </summary>
public sealed class PlanMoveSemanticsTests
{
    private static async Task<List<ProductionPlanItem>> OrderedAsync(HttpClient client)
    {
        var page = await client.GetFromJsonAsync<PagedResult<ProductionPlanItem>>("/api/v1/production-plan?pageSize=100");
        return page!.Items.Where(i => i.Seqn is not null).OrderBy(i => i.Seqn).ToList();
    }

    private static Task<HttpResponseMessage> MoveAsync(HttpClient client, string vin, int toPosition)
        => client.PostAsJsonAsync($"/api/v1/production-plan/{vin}/move", new MoveRequest(toPosition));

    // T-052: moving a started item (statusId > 0) must be rejected
    [Fact]
    public async Task Move_Started_Item_Returns_422_StatusRestricted()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var all = await OrderedAsync(client);
        Assert.True(all.Count >= 2, "Need at least 2 sequenced items in fixture");

        // find a planned item and any other sequenced item to move to
        var target = all.FirstOrDefault(i => i.StatusId == 0);
        Assert.NotNull(target);
        var otherSeqn = all.First(i => i.Vin != target.Vin).Seqn!.Value;

        // start the item (statusId 0 → 1)
        var startResp = await client.PostAsync($"/api/v1/production-plan/{Uri.EscapeDataString(target.Vin)}/start", null);
        Assert.True(startResp.IsSuccessStatusCode, $"Start failed: {await startResp.Content.ReadAsStringAsync()}");

        // move should now return 422
        var moveResp = await MoveAsync(client, target.Vin, otherSeqn);
        Assert.Equal(System.Net.HttpStatusCode.UnprocessableEntity, moveResp.StatusCode);
    }

    [Fact]
    public async Task Move_Up_Lands_Before_Target_Move_Down_Lands_After_Target_And_Back_Restores_Order()
    {
        using var factory = new ApiFactory(devAuthEnabled: true);
        var client = await factory.CreateAuthenticatedClientAsync();
        var start = await OrderedAsync(client);
        Assert.True(start.Count >= 4);
        var vins = start.Select(i => i.Vin).ToList();
        var seqns = start.Select(i => i.Seqn!.Value).ToList();

        // вверх: третий на позицию первого → становится первым, прежний первый сдвигается вниз
        Assert.True((await MoveAsync(client, vins[2], seqns[0])).IsSuccessStatusCode);
        var up = (await OrderedAsync(client)).Select(i => i.Vin).ToList();
        Assert.Equal([vins[2], vins[0], vins[1], .. vins.Skip(3)], up);

        // откат: на прежнюю позицию (она была у третьего изделия)
        Assert.True((await MoveAsync(client, vins[2], seqns[2])).IsSuccessStatusCode);
        Assert.Equal(vins, (await OrderedAsync(client)).Select(i => i.Vin).ToList());

        // вниз: первый на позицию третьего → встаёт после третьего
        Assert.True((await MoveAsync(client, vins[0], seqns[2])).IsSuccessStatusCode);
        var down = await OrderedAsync(client);
        Assert.Equal([vins[1], vins[2], vins[0], .. vins.Skip(3)], down.Select(i => i.Vin).ToList());
        Assert.Equal(seqns, down.Select(i => i.Seqn!.Value).ToList()); // набор позиций прежний

        // откат вниз-переноса
        Assert.True((await MoveAsync(client, vins[0], seqns[0])).IsSuccessStatusCode);
        Assert.Equal(vins, (await OrderedAsync(client)).Select(i => i.Vin).ToList());
    }
}
