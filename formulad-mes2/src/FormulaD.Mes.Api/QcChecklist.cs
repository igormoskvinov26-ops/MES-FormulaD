using System.Data;
using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

public sealed record QcPost(int Id, string Name, string? AfterStation, int SortOrder, bool TodayComplete);
public sealed record ChecklistItem(int Id, int PostId, int Seq, string Description, string? BarcodeHint);
public sealed record QcResultItem(
    int Id, int ItemId, int Seq, string Description,
    string Status, string? Comment, string? CheckedBy, DateTime? CheckedAt);
public sealed record QcSession(
    int Id, int PostId, string PostName, string Vin,
    string StartedBy, DateTime StartedAt, DateTime? FinishedAt, string? Outcome,
    IReadOnlyList<QcResultItem> Results);
public sealed record StartSessionRequest(int PostId, string Vin);
public sealed record RecordResultRequest(int ItemId, string Status, string? Comment);
public sealed record FinishSessionRequest(string? Outcome);
public sealed record QcSessionSummary(
    int Id, int PostId, string PostName, string Vin,
    string StartedBy, DateTime StartedAt, DateTime? FinishedAt, string? Outcome);

public interface IQcChecklistReader
{
    Task<IReadOnlyList<QcPost>> GetPostsAsync(CancellationToken ct, string? vin = null);
    Task<IReadOnlyList<ChecklistItem>> GetItemsAsync(int postId, CancellationToken ct);
    Task<QcSession?> GetSessionAsync(int id, CancellationToken ct);
    Task<IReadOnlyList<QcSessionSummary>> GetSessionsByPostAsync(int postId, int limit, CancellationToken ct);
}

public interface IQcChecklistWriter
{
    Task<QcSession> StartSessionAsync(StartSessionRequest request, string author, CancellationToken ct);
    Task<QcResultItem> RecordResultAsync(int sessionId, RecordResultRequest request, string author, CancellationToken ct);
    Task<QcSession> FinishSessionAsync(int sessionId, FinishSessionRequest request, string author, CancellationToken ct);
}

public sealed class DemoQcStore : IQcChecklistReader, IQcChecklistWriter
{
    private static readonly QcPost[] Posts =
    [
        new(1, "QCP-01 СТ1–СТ5",   "СТ5", 1, false),
        new(2, "QCP-02 СТ6–СТ7",   "СТ7", 2, false),
        new(3, "QCP-03 Пост-линия", null,  3, false),
        new(4, "QCP-04 Приёмка",    null,  4, false),
        new(5, "QCP-05 Испытания",  null,  5, false),
        new(6, "QCP-06 Тест-драйв", null,  6, false),
    ];

    private static readonly ChecklistItem[] Items =
    [
        new( 1,1, 1,"Рама: наличие, отсутствие повреждений",null),
        new( 2,1, 2,"Двигатель: установка, крепление, отсутствие подтёков",null),
        new( 3,1, 3,"Трансмиссия: установка, крепление",null),
        new( 4,1, 4,"Передняя подвеска: комплектность, затяжка",null),
        new( 5,1, 5,"Задняя подвеска: комплектность, затяжка",null),
        new( 6,1, 6,"Топливный бак: установка, крепление, отсутствие подтёков",null),
        new( 7,1, 7,"Тормозная система передняя: комплектность, герметичность",null),
        new( 8,1, 8,"Тормозная система задняя: комплектность, герметичность",null),
        new( 9,1, 9,"Рулевое управление: установка, люфт",null),
        new(10,1,10,"Педали: установка, ход, отсутствие заеданий",null),
        new(11,1,11,"Колёса передние: установка, затяжка гаек",null),
        new(12,1,12,"Колёса задние: установка, затяжка гаек",null),
        new(13,1,13,"Выхлопная система: установка, герметичность, крепление",null),
        new(14,1,14,"Защита двигателя: установка, крепление",null),
        new(15,1,15,"Пластик передний: установка, отсутствие трещин",null),
        new(16,1,16,"Пластик задний: установка, отсутствие трещин",null),
        new(17,1,17,"Сиденье: установка, крепление",null),
        new(18,1,18,"Топливный шланг: прокладка, крепление хомутами",null),
        new(19,1,19,"Маркировка VIN: наличие, читаемость, совпадение с документами",null),
        new(20,2, 1,"Электрика: проводка, крепление жгутов, отсутствие потёртостей",null),
        new(21,2, 2,"Аккумулятор: установка, клеммы, крепление",null),
        new(22,2, 3,"Фара передняя: установка, юстировка, работоспособность",null),
        new(23,2, 4,"Фонарь задний: установка, работоспособность",null),
        new(24,2, 5,"Стоп-сигнал: работоспособность от педали тормоза",null),
        new(25,2, 6,"Переключатель поворотов: работоспособность",null),
        new(26,2, 7,"Прибор панели: установка, показания при включении",null),
        new(27,2, 8,"Сигнал (клаксон): работоспособность",null),
        new(28,3, 1,"Уровень масла двигателя: в норме",null),
        new(29,3, 2,"Уровень тормозной жидкости: в норме",null),
        new(30,3, 3,"Давление в шинах: соответствует норме",null),
        new(31,3, 4,"Затяжка всех резьбовых соединений: контроль моментом",null),
        new(32,3, 5,"Комплектация согласно заявке: соответствует",null),
        new(33,3, 6,"Упаковка и маркировка коробки: соответствует",null),
        new(34,4, 1,"Внешний вид: отсутствие царапин, сколов, вмятин",null),
        new(35,4, 2,"Соответствие цвета заказу",null),
        new(36,4, 3,"Комплектность: все части и аксессуары по спецификации",null),
        new(37,4, 4,"Документация: паспорт, инструкция, гарантийный талон",null),
        new(38,4, 5,"Пломбы и стикеры: наличие, целостность",null),
        new(39,4, 6,"Пробег на одометре: соответствует норме обкатки",null),
        new(40,4, 7,"Подпись ОТК на сопроводительной карте",null),
        new(41,5, 1,"Запуск двигателя: с первой попытки, без посторонних звуков",null),
        new(42,5, 2,"Холостой ход: устойчивый, в норме",null),
        new(43,5, 3,"Педаль газа: отклик, отсутствие залипания",null),
        new(44,5, 4,"Тормоза: эффективность, отсутствие уводов",null),
        new(45,5, 5,"Переключение передач (если есть): чёткость, без хрустов",null),
        new(46,5, 6,"Отсутствие посторонних шумов и вибраций при работе",null),
        new(47,6, 1,"Движение вперёд/назад: без отклонений",null),
        new(48,6, 2,"Управляемость: лёгкость руления, отсутствие рывков",null),
        new(49,6, 3,"Остановка: эффективность тормозов, отсутствие заноса",null),
    ];

    private readonly Lock _gate = new();
    private readonly List<QcSession> _sessions = [];
    private int _nextSessionId = 1;
    private int _nextResultId = 1;

    public Task<IReadOnlyList<QcPost>> GetPostsAsync(CancellationToken ct, string? vin = null)
    {
        if (vin == null) return Task.FromResult<IReadOnlyList<QcPost>>(Posts);
        lock (_gate)
        {
            var donePostIds = _sessions.Where(s => s.Vin == vin && s.FinishedAt != null).Select(s => s.PostId).ToHashSet();
            IReadOnlyList<QcPost> posts = Posts.Select(p => p with { TodayComplete = donePostIds.Contains(p.Id) }).ToList();
            return Task.FromResult(posts);
        }
    }

    public Task<IReadOnlyList<ChecklistItem>> GetItemsAsync(int postId, CancellationToken ct)
    {
        IReadOnlyList<ChecklistItem> items = Items.Where(i => i.PostId == postId).ToList();
        return Task.FromResult(items);
    }

    public Task<QcSession?> GetSessionAsync(int id, CancellationToken ct)
    {
        lock (_gate) { return Task.FromResult(_sessions.FirstOrDefault(x => x.Id == id)); }
    }

    public Task<IReadOnlyList<QcSessionSummary>> GetSessionsByPostAsync(int postId, int limit, CancellationToken ct)
    {
        lock (_gate)
        {
            IReadOnlyList<QcSessionSummary> result = _sessions
                .Where(s => s.PostId == postId).OrderByDescending(s => s.StartedAt).Take(limit)
                .Select(s => new QcSessionSummary(s.Id, s.PostId, s.PostName, s.Vin, s.StartedBy, s.StartedAt, s.FinishedAt, s.Outcome))
                .ToList();
            return Task.FromResult(result);
        }
    }

    public Task<QcSession> StartSessionAsync(StartSessionRequest request, string author, CancellationToken ct)
    {
        var post = Posts.FirstOrDefault(p => p.Id == request.PostId)
            ?? throw new ArgumentException($"Post {request.PostId} not found");
        lock (_gate)
        {
            var session = new QcSession(_nextSessionId++, post.Id, post.Name, request.Vin, author, DateTime.Now, null, null, []);
            _sessions.Add(session);
            return Task.FromResult(session);
        }
    }

    public Task<QcResultItem> RecordResultAsync(int sessionId, RecordResultRequest request, string author, CancellationToken ct)
    {
        var item = Items.FirstOrDefault(i => i.Id == request.ItemId)
            ?? throw new ArgumentException($"Item {request.ItemId} not found");
        lock (_gate)
        {
            var idx = _sessions.FindIndex(s => s.Id == sessionId);
            if (idx < 0) throw new ArgumentException($"Session {sessionId} not found");
            var session = _sessions[idx];
            var result = new QcResultItem(_nextResultId++, item.Id, item.Seq, item.Description, request.Status, request.Comment, author, DateTime.Now);
            var newResults = session.Results.Where(r => r.ItemId != request.ItemId).Append(result).OrderBy(r => r.Seq).ToList();
            _sessions[idx] = session with { Results = newResults };
            return Task.FromResult(result);
        }
    }

    public Task<QcSession> FinishSessionAsync(int sessionId, FinishSessionRequest request, string author, CancellationToken ct)
    {
        lock (_gate)
        {
            var idx = _sessions.FindIndex(s => s.Id == sessionId);
            if (idx < 0) throw new ArgumentException($"Session {sessionId} not found");
            var finished = _sessions[idx] with { FinishedAt = DateTime.Now, Outcome = request.Outcome ?? "pass" };
            _sessions[idx] = finished;
            return Task.FromResult(finished);
        }
    }
}

public sealed class SqlQcStore(SqlOptions options) : IQcChecklistReader, IQcChecklistWriter
{
    public async Task<IReadOnlyList<QcPost>> GetPostsAsync(CancellationToken ct, string? vin = null)
    {
        await using var conn = new SqlConnection(options.ConnectionString);
        await conn.OpenAsync(ct);
        var sql = vin != null
            ? """
              SELECT p.[id], p.[Name], p.[AfterStation], p.[SortOrder],
                     CASE WHEN s.[id] IS NOT NULL THEN 1 ELSE 0 END AS Done
              FROM [dbo].[tblQCPost] p
              LEFT JOIN (
                  SELECT [PostID], MAX([id]) AS [id]
                  FROM [dbo].[tblQCSession]
                  WHERE [VIN]=@vin AND [FinishedAt] IS NOT NULL
                  GROUP BY [PostID]
              ) s ON s.[PostID]=p.[id]
              ORDER BY p.[SortOrder]
              """
            : "SELECT [id],[Name],[AfterStation],[SortOrder], 0 AS Done FROM [dbo].[tblQCPost] ORDER BY [SortOrder]";
        await using var cmd = new SqlCommand(sql, conn) { CommandTimeout = options.CommandTimeoutSeconds };
        if (vin != null) cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = vin;
        var posts = new List<QcPost>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
            posts.Add(new QcPost(r.GetInt32(0), r.GetString(1), r.IsDBNull(2) ? null : r.GetString(2), r.GetInt32(3), r.GetInt32(4) == 1));
        return posts;
    }

    public async Task<IReadOnlyList<ChecklistItem>> GetItemsAsync(int postId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.ConnectionString); await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand(
            "SELECT [id],[PostID],[Seq],[Description],[BarcodeHint] FROM [dbo].[tblChecklist] WHERE [PostID]=@p ORDER BY [Seq]",
            conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = postId;
        var items = new List<ChecklistItem>(); await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
            items.Add(new ChecklistItem(r.GetInt32(0), r.GetInt32(1), r.GetInt32(2), r.GetString(3), r.IsDBNull(4) ? null : r.GetString(4)));
        return items;
    }

    public async Task<QcSession?> GetSessionAsync(int id, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.ConnectionString); await conn.OpenAsync(ct);
        return await ReadSessionAsync(conn, id, ct);
    }

    public async Task<IReadOnlyList<QcSessionSummary>> GetSessionsByPostAsync(int postId, int limit, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.ConnectionString); await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand(
            """
            SELECT TOP (@lim) s.[id], s.[PostID], p.[Name], s.[VIN], s.[StartedBy], s.[StartedAt], s.[FinishedAt], s.[Outcome]
            FROM [dbo].[tblQCSession] s
            JOIN [dbo].[tblQCPost] p ON p.[id]=s.[PostID]
            WHERE s.[PostID]=@postId
            ORDER BY s.[StartedAt] DESC
            """, conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@lim", SqlDbType.Int).Value = limit; cmd.Parameters.Add("@postId", SqlDbType.Int).Value = postId;
        await using var r = await cmd.ExecuteReaderAsync(ct);
        var list = new List<QcSessionSummary>();
        while (await r.ReadAsync(ct))
            list.Add(new QcSessionSummary(r.GetInt32(0), r.GetInt32(1), r.GetString(2), r.GetString(3), r.GetString(4),
                r.GetDateTime(5), r.IsDBNull(6) ? null : r.GetDateTime(6), r.IsDBNull(7) ? null : r.GetString(7)));
        return list;
    }

    public async Task<QcSession> StartSessionAsync(StartSessionRequest request, string author, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.WriteConnectionString); await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand(
            """
            INSERT INTO [dbo].[tblQCSession] ([PostID],[VIN],[StartedBy],[StartedAt])
            OUTPUT INSERTED.[id]
            VALUES (@postId,@vin,@author,@now)
            """, conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@postId", SqlDbType.Int).Value = request.PostId;
        cmd.Parameters.Add("@vin", SqlDbType.NVarChar, 50).Value = request.Vin;
        cmd.Parameters.Add("@author", SqlDbType.NVarChar, 100).Value = author;
        cmd.Parameters.Add("@now", SqlDbType.DateTime).Value = DateTime.Now;
        var newId = (int)(await cmd.ExecuteScalarAsync(ct))!;
        return (await ReadSessionAsync(conn, newId, ct))!;
    }

    public async Task<QcResultItem> RecordResultAsync(int sessionId, RecordResultRequest request, string author, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.WriteConnectionString); await conn.OpenAsync(ct);
        await using (var del = new SqlCommand(
            "DELETE FROM [dbo].[tblQCResult] WHERE [SessionID]=@sid AND [ItemID]=@iid",
            conn) { CommandTimeout = options.CommandTimeoutSeconds })
        { del.Parameters.Add("@sid", SqlDbType.Int).Value = sessionId; del.Parameters.Add("@iid", SqlDbType.Int).Value = request.ItemId; await del.ExecuteNonQueryAsync(ct); }
        await using var ins = new SqlCommand(
            """
            INSERT INTO [dbo].[tblQCResult] ([SessionID],[ItemID],[Status],[Comment],[CheckedBy],[CheckedAt])
            OUTPUT INSERTED.[id]
            VALUES (@sid,@iid,@status,@comment,@author,@now)
            """, conn) { CommandTimeout = options.CommandTimeoutSeconds };
        ins.Parameters.Add("@sid", SqlDbType.Int).Value = sessionId;
        ins.Parameters.Add("@iid", SqlDbType.Int).Value = request.ItemId;
        ins.Parameters.Add("@status", SqlDbType.NVarChar, 20).Value = request.Status;
        ins.Parameters.Add("@comment", SqlDbType.NVarChar, 500).Value = (object?)request.Comment ?? DBNull.Value;
        ins.Parameters.Add("@author", SqlDbType.NVarChar, 100).Value = author;
        ins.Parameters.Add("@now", SqlDbType.DateTime).Value = DateTime.Now;
        var newId = (int)(await ins.ExecuteScalarAsync(ct))!;
        await using var q = new SqlCommand(
            """
            SELECT r.[id], r.[ItemID], c.[Seq], c.[Description], r.[Status], r.[Comment], r.[CheckedBy], r.[CheckedAt]
            FROM [dbo].[tblQCResult] r JOIN [dbo].[tblChecklist] c ON c.[id]=r.[ItemID] WHERE r.[id]=@rid
            """, conn) { CommandTimeout = options.CommandTimeoutSeconds };
        q.Parameters.Add("@rid", SqlDbType.Int).Value = newId;
        await using var rr = await q.ExecuteReaderAsync(ct); await rr.ReadAsync(ct);
        return new QcResultItem(rr.GetInt32(0), rr.GetInt32(1), rr.GetInt32(2), rr.GetString(3),
            rr.GetString(4), rr.IsDBNull(5) ? null : rr.GetString(5), rr.IsDBNull(6) ? null : rr.GetString(6),
            rr.IsDBNull(7) ? null : rr.GetDateTime(7));
    }

    public async Task<QcSession> FinishSessionAsync(int sessionId, FinishSessionRequest request, string author, CancellationToken ct)
    {
        await using var conn = new SqlConnection(options.WriteConnectionString); await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand(
            "UPDATE [dbo].[tblQCSession] SET [FinishedAt]=@now,[Outcome]=@outcome WHERE [id]=@id",
            conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@now", SqlDbType.DateTime).Value = DateTime.Now;
        cmd.Parameters.Add("@outcome", SqlDbType.NVarChar, 20).Value = request.Outcome ?? "pass";
        cmd.Parameters.Add("@id", SqlDbType.Int).Value = sessionId;
        await cmd.ExecuteNonQueryAsync(ct);
        return (await ReadSessionAsync(conn, sessionId, ct))!;
    }

    private async Task<QcSession?> ReadSessionAsync(SqlConnection conn, int id, CancellationToken ct)
    {
        await using var cmd = new SqlCommand(
            """
            SELECT s.[id], s.[PostID], p.[Name], s.[VIN], s.[StartedBy], s.[StartedAt], s.[FinishedAt], s.[Outcome]
            FROM [dbo].[tblQCSession] s JOIN [dbo].[tblQCPost] p ON p.[id]=s.[PostID] WHERE s.[id]=@id
            """, conn) { CommandTimeout = options.CommandTimeoutSeconds };
        cmd.Parameters.Add("@id", SqlDbType.Int).Value = id;
        await using var r = await cmd.ExecuteReaderAsync(CommandBehavior.SingleRow, ct);
        if (!await r.ReadAsync(ct)) return null;
        var session = new QcSession(r.GetInt32(0), r.GetInt32(1), r.GetString(2), r.GetString(3), r.GetString(4),
            r.GetDateTime(5), r.IsDBNull(6) ? null : r.GetDateTime(6), r.IsDBNull(7) ? null : r.GetString(7), []);
        await r.CloseAsync();
        await using var rq = new SqlCommand(
            """
            SELECT r.[id], r.[ItemID], c.[Seq], c.[Description], r.[Status], r.[Comment], r.[CheckedBy], r.[CheckedAt]
            FROM [dbo].[tblQCResult] r JOIN [dbo].[tblChecklist] c ON c.[id]=r.[ItemID]
            WHERE r.[SessionID]=@sid ORDER BY c.[Seq]
            """, conn) { CommandTimeout = options.CommandTimeoutSeconds };
        rq.Parameters.Add("@sid", SqlDbType.Int).Value = id;
        await using var rr = await rq.ExecuteReaderAsync(ct);
        var results = new List<QcResultItem>();
        while (await rr.ReadAsync(ct))
            results.Add(new QcResultItem(rr.GetInt32(0), rr.GetInt32(1), rr.GetInt32(2), rr.GetString(3),
                rr.GetString(4), rr.IsDBNull(5) ? null : rr.GetString(5), rr.IsDBNull(6) ? null : rr.GetString(6),
                rr.IsDBNull(7) ? null : rr.GetDateTime(7)));
        return session with { Results = results };
    }
}
