# Фактический SQL-контракт — только чтение

## dbo.tblProductionPlan (подтверждённые поля)

Следующие типы derived из системных метаданных SQL Server (для `nvarchar` исходный `max_length` дан в **байтах**, поэтому здесь указаны символы):

| Столбец SQL | Тип SQL | Nullable | Использовать в MVP |
|---|---|---|---|
| VIN | nvarchar(50) | нет | **PK**, идентификатор URL и поиска |
| ID | int | нет | можно показывать как справочный, но НЕ ключ |
| ModelArticle | nvarchar(50) | да | да |
| ModelName | nvarchar(100) | да | да |
| EngineNumber | nvarchar(50) | нет | да, только после авторизации |
| Color | nvarchar(50) | да | да |
| PlannedShipmentDate | datetime | да | да |
| StartDate | datetime | да | да |
| CompleteDate | datetime | да | да |
| plannedstartdate | datetime | да | необязательно |
| Status | nvarchar(50) | да | да, отображать как есть |
| statusid | int | да | да, справочно |
| Specification_id | int | да | не требуется в первом UI |
| SpecificationName | nvarchar(50) | да | возможно |
| ColorID | int | да | не требуется |
| SEQN | int | да | возможно для сортировки по плану, после проверки |
| NEWSEQN | int | да | после отдельного анализа |
| PrintDate | datetime | да | нет |
| validationdate | datetime | да | нет |
| shipmentdate | datetime | да | возможно, отдельный этап |
| reworkdate | datetime | да | нет |
| reworkcompletedate | datetime | да | нет |
| rework_comments | nvarchar(50) | да | нет |
| shipment_comments | datetime | да | нет; тип нетипичный |
| FOK_date | datetime | да | да |
| ValidationStatus | nvarchar(50) | да | нет |
| ErrorMessage | nvarchar(255) | да | нет; может раскрывать внутренние сведения |
| rv | rowversion | нет | нет в MVP; не дата |

Требования к SQL-реализации в **следующем** спринте:

- На TEST пользоваться параметризованными `SELECT` без динамических имён таблиц/полей и без права записи в DB.
- Не использовать `NOLOCK`: «грязные» состояния плана опасны для производственного UI.
- Отдельный **TEST** login только с SELECT на нужные объекты. Даже при ошибке приложения запись технически невозможна.
- Параметры VIN длиной 1..50; лимиты пагинации 1..100, по умолчанию 25. Не выбирать `SELECT *`.
- Не делать JOIN на `tblQC_Products`: схема QC пока не использована в рабочей Access.
- Не считать, что строки `Status` закрывают все стадии производства.

## Дополнительные факты

- `tblNCP.VIN` имеет FK к `tblProductionPlan.VIN`; в MVP NCP пока не выводим.
- В SQL нет физического FK `tblQC_Products.VIN -> tblProductionPlan.VIN`.
- `tblQC_ProductPoints` имеет UNIQUE(ProductID,ControlPointID).
- Старые `tblImportplan` и `tblPlanTemp` — реальные общие SQL-таблицы, а не локальные таблицы Access.
