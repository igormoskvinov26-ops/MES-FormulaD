namespace FormulaD.Mes.Api;

public static class VinSearch
{
    public static bool IsSuffixSearch(string needle)
        => needle.Length > 0 && needle.All(char.IsAsciiDigit);
}
