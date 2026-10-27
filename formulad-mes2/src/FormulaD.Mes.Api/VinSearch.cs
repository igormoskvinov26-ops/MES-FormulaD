namespace FormulaD.Mes.Api;

/// <summary>
/// Как трактовать строку поиска VIN. Правило общее для Demo- и SQL-ридера,
/// чтобы источники отвечали одинаково.
/// </summary>
public static class VinSearch
{
    /// <summary>
    /// Ввод только из цифр — это оператор набрал последние цифры VIN руками: ищем по концу.
    /// Всё остальное (сканер отдаёт VIN целиком, человек набирает начало) — поиск по началу.
    /// Два режима вместо одного условия `начало OR конец` по важной причине: такой OR заставил бы
    /// SQL Server сканировать таблицу и на пути сканера тоже. Разделение оставляет быстрый путь быстрым.
    /// </summary>
    public static bool IsSuffixSearch(string needle)
        => needle.Length > 0 && needle.All(char.IsAsciiDigit);
}
