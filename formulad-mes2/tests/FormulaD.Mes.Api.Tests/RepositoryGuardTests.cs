using System.Text.RegularExpressions;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

/// <summary>
/// Предупреждающие тесты запрета PROD (T-007): падают, если в конфигурации, скриптах или примерах репозитория
/// появляется строка подключения к базе FormulaD или литерал пароля. Тесты (каталог tests/) и документация (docs/)
/// не сканируются: там такие строки встречаются как намеренные отрицательные примеры.
/// </summary>
public sealed class RepositoryGuardTests
{
    private static readonly Regex ProdDatabase = new(@"(Database|Initial\s+Catalog)\s*=\s*FormulaD\s*(;|"|'|$)",
        RegexOptions.IgnoreCase | RegexOptions.Multiline);

    private static readonly Regex PasswordLiteral = new(@"\b(Password|Pwd)\s*=\s*(N?'(?<v>[^']*)'|(?<v>[^;""'\s]+))",
        RegexOptions.IgnoreCase);

    private static readonly Regex Placeholder = new(@"^(CHANGE_ME|<.*|\$.*|%.*%|\*+|x|\.\.\.)$",
        RegexOptions.IgnoreCase);

    private static readonly string[] ScannedExtensions = [".json", ".sql", ".sh", ".bat", ".ps1", ".yml", ".yaml", ".config", ".example"];
    /// <summary>Сам сканер секретов содержит образцы шаблонов в тексте.</summary>
    private static readonly string[] SkippedFiles = ["check-secrets.sh"];
    private static readonly string[] SkippedDirs = ["bin", "obj", "node_modules", ".git", "docs", "tests", "coverage", "TestResults", "publish"];

    internal static IEnumerable<string> Violations(string text)
    {
        foreach (Match m in ProdDatabase.Matches(text))
            yield return $"строка подключения к рабочей базе: {m.Value.Trim()}";
        foreach (Match m in PasswordLiteral.Matches(text))
            if (!Placeholder.IsMatch(m.Groups["v"].Value))
                yield return $"литерал пароля: {m.Value.Trim()}";
    }

    [Theory]
    [InlineData("Server=SQLACCESS;Database=FormulaD;User ID=u;Password=CHANGE_ME", true)]
    [InlineData("Server=a;Initial Catalog=FormulaD", true)]
    [InlineData("Server=a;Database=FormulaD_TEST;User ID=u;Password=Hunter2Real;", true)] // check-secrets:ignore (отрицательный пример для сканера)
    [InlineData("Server=a;Database=FormulaD_TEST;User ID=u;Password=CHANGE_ME;", false)]
    [InlineData("Database=FormulaD_TEST;Password=<пароль>;", false)]
    [InlineData("CREATE LOGIN u WITH PASSWORD = N'$(MesReaderPassword)'", false)]
    [InlineData("DataSource=Sql Password=$MES_READER_PASSWORD", false)]
    [InlineData("echo \"password=$(grep -o x file | head -1)\"", false)]
    public void Scanner_Flags_Prod_Database_And_Password_Literals(string text, bool shouldFlag)
        => Assert.Equal(shouldFlag, Violations(text).Any());

    [Fact]
    public void Repository_Config_And_Scripts_Contain_No_Prod_Connection_Or_Password_Literals()
    {
        var root = FindRoot();
        var violations = new List<string>();
        foreach (var file in Walk(root))
        {
            foreach (var v in Violations(File.ReadAllText(file)))
                violations.Add($"{Path.GetRelativePath(root, file)}: {v}");
        }
        Assert.True(violations.Count == 0, "Найдены запрещённые строки:\n" + string.Join("\n", violations));
    }

    private static string FindRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "FormulaD.Mes.slnx"))) return dir.FullName;
        throw new InvalidOperationException("Корень репозитория (FormulaD.Mes.slnx) не найден.");
    }

    private static IEnumerable<string> Walk(string dir)
    {
        foreach (var file in Directory.EnumerateFiles(dir))
            if (!SkippedFiles.Contains(Path.GetFileName(file), StringComparer.OrdinalIgnoreCase)
                && (ScannedExtensions.Contains(Path.GetExtension(file), StringComparer.OrdinalIgnoreCase)
                    || Path.GetFileName(file).StartsWith(".env", StringComparison.Ordinal)))
                yield return file;
        foreach (var sub in Directory.EnumerateDirectories(dir))
            if (!SkippedDirs.Contains(Path.GetFileName(sub), StringComparer.OrdinalIgnoreCase))
                foreach (var f in Walk(sub)) yield return f;
    }
}
