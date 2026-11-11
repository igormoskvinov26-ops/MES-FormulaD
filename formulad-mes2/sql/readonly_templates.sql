-- SQL-шаблоны для будущей TEST среды. НЕ запускать автоматически и НЕ в PROD.
-- Требуются ТОЛЬКО ограниченные права SELECT на TEST SQL.
-- Параметры @vin, @status, @offset, @pageSize должны быть переданы через SqlParameter.
-- Не использовать EXEC, динамический SQL или string concatenation.

-- Точная карточка VIN
SELECT
    VIN, ID, ModelArticle, ModelName, EngineNumber, Color,
    PlannedShipmentDate, StartDate, CompleteDate, FOK_date,
    Status, statusid
FROM dbo.tblProductionPlan
WHERE VIN = @vin;

-- Пагинация (пример без фильтра; Codex должен строить несколько
-- фиксированных запросов/параметризованные предикаты для безопасного фильтра)
SELECT
    VIN, ID, ModelArticle, ModelName, EngineNumber, Color,
    PlannedShipmentDate, StartDate, CompleteDate, FOK_date,
    Status, statusid
FROM dbo.tblProductionPlan
ORDER BY VIN
OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;

-- Возможные строки статусов (для списка фильтров)
SELECT DISTINCT Status
FROM dbo.tblProductionPlan
WHERE Status IS NOT NULL
ORDER BY Status;
