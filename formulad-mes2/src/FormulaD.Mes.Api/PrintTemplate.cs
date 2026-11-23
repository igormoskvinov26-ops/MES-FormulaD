using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

public sealed record PrintTemplateItem(int Id, string Name, string BodyHtml, DateTime UpdatedAt);
public sealed record UpdatePrintTemplateRequest(string Name, string BodyHtml);

public interface IPrintTemplateRepo
{
    Task<IReadOnlyList<PrintTemplateItem>> GetAllAsync(CancellationToken ct);
    Task<PrintTemplateItem?> GetAsync(int id, CancellationToken ct);
    Task<PrintTemplateItem> UpsertAsync(int id, string name, string bodyHtml, CancellationToken ct);
}

public sealed class InMemoryPrintTemplateRepo : IPrintTemplateRepo
{
    private readonly Lock _gate = new();
    private readonly List<PrintTemplateItem> _items =
    [
        new(1, "Job Card",                "<p><strong>VIN:</strong> {{VIN}}</p><p><strong>Модель:</strong> {{MODEL}}</p><p><strong>Цвет:</strong> {{COLOR}}</p>", DateTime.Now),
        new(2, "Лист NCP",               "<p><strong>Несоответствие:</strong> {{NCP_NUMBER}}</p><p><strong>VIN:</strong> {{VIN}}</p>", DateTime.Now),
        new(3, "Карта контроля изделия", "<p><strong>VIN:</strong> {{VIN}}</p><p><strong>Инспектор ОТК:</strong> {{INSPECTOR}}</p>", DateTime.Now),
    ];

    public Task<IReadOnlyList<PrintTemplateItem>> GetAllAsync(CancellationToken ct)
    {
        lock (_gate) return Task.FromResult<IReadOnlyList<PrintTemplateItem>>([.. _items]);
    }

    public Task<PrintTemplateItem?> GetAsync(int id, CancellationToken ct)
    {
        lock (_gate) return Task.FromResult(_items.FirstOrDefault(t => t.Id == id));
    }

    public Task<PrintTemplateItem> UpsertAsync(int id, string name, string bodyHtml, CancellationToken ct)
    {
        lock (_gate)
        {
            var idx = _items.FindIndex(t => t.Id == id);
            var updated = new PrintTemplateItem(id, name, bodyHtml, DateTime.Now);
            if (idx >= 0) _items[idx] = updated;
            else _items.Add(updated);
            return Task.FromResult(updated);
        }
    }
}

public sealed class SqlPrintTemplateRepo(string connectionString, int commandTimeout = 30) : IPrintTemplateRepo
{
    public async Task<IReadOnlyList<PrintTemplateItem>> GetAllAsync(CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand(
            "SELECT [id],[name],[body_html],[updated_at] FROM [dbo].[tblPrintTemplate] ORDER BY [id]", conn)
        { CommandTimeout = commandTimeout };
        await using var r = await cmd.ExecuteReaderAsync(ct);
        var list = new List<PrintTemplateItem>();
        while (await r.ReadAsync(ct))
            list.Add(new(r.GetInt32(0), r.GetString(1), r.GetString(2), r.GetDateTime(3)));
        return list;
    }

    public async Task<PrintTemplateItem?> GetAsync(int id, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand(
            "SELECT [id],[name],[body_html],[updated_at] FROM [dbo].[tblPrintTemplate] WHERE [id]=@id", conn)
        { CommandTimeout = commandTimeout };
        cmd.Parameters.AddWithValue("@id", id);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return null;
        return new(r.GetInt32(0), r.GetString(1), r.GetString(2), r.GetDateTime(3));
    }

    public async Task<PrintTemplateItem> UpsertAsync(int id, string name, string bodyHtml, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand(
            """
            UPDATE [dbo].[tblPrintTemplate]
               SET [name]=@name, [body_html]=@body, [updated_at]=SYSDATETIME()
             WHERE [id]=@id;
            SELECT [id],[name],[body_html],[updated_at] FROM [dbo].[tblPrintTemplate] WHERE [id]=@id;
            """, conn)
        { CommandTimeout = commandTimeout };
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@name", name);
        cmd.Parameters.AddWithValue("@body", bodyHtml);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) throw new InvalidOperationException($"Print template {id} not found");
        return new(r.GetInt32(0), r.GetString(1), r.GetString(2), r.GetDateTime(3));
    }
}
