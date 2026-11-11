using Microsoft.Data.SqlClient;

namespace FormulaD.Mes.Api;

/// <summary>
/// Кто пользователь и что ему можно. Один и тот же справочник в тесте и на проде —
/// меняется только способ узнать логин (форма в тесте, Windows-учётка на проде).
/// </summary>
public interface IUserDirectory
{
    Task<MesUser?> FindAsync(string login, CancellationToken ct);
}

public sealed class SqlUserDirectory(SqlOptions options) : IUserDirectory
{
    public async Task<MesUser?> FindAsync(string login, CancellationToken ct)
    {
        await using var connection = new SqlConnection(options.ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT TOP 1 ID, Login, FullName, UserRole
            FROM dbo.tblUser
            WHERE Login = @login AND ISNULL(IsActive, 0) = 1
            """;
        command.Parameters.AddWithValue("@login", login);

        await using var reader = await command.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return null;
        }
        return new MesUser(
            reader.GetInt32(0),
            reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3));
    }
}

public sealed class InMemoryUserDirectory(params MesUser[] users) : IUserDirectory
{
    public Task<MesUser?> FindAsync(string login, CancellationToken ct) =>
        Task.FromResult(users.FirstOrDefault(u => string.Equals(u.Login, login, StringComparison.OrdinalIgnoreCase)));
}
