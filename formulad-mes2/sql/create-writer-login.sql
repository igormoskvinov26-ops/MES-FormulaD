-- Создание логина mes_writer для тестовой базы FormulaD_TEST.
-- Выполнять от имени sysadmin на TEST-экземпляре.
-- Пароль заменить на реальный перед выполнением.

USE [master];
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'mes_writer')
BEGIN
    CREATE LOGIN [mes_writer] WITH PASSWORD = N'CHANGE_ME', DEFAULT_DATABASE = [FormulaD_TEST];
END
GO

USE [FormulaD_TEST];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'mes_writer')
BEGIN
    CREATE USER [mes_writer] FOR LOGIN [mes_writer];
END
GO

-- Чтение: все те же права, что и у mes_reader.
GRANT SELECT ON [dbo].[tblProductionPlan] TO [mes_writer];

-- Запись: только UPDATE на конкретные колонки, которые меняют переходы статусов.
GRANT UPDATE ON [dbo].[tblProductionPlan] ([statusid], [Status], [StartDate], [CompleteDate],
    [FOK_date], [reworkdate], [reworkcompletedate], [PrintDate], [SEQN]) TO [mes_writer];

-- Вставка: импорт плана (Этап 8) добавляет новые строки.
GRANT INSERT ON [dbo].[tblProductionPlan] TO [mes_writer];

-- NCP: чтение справочников + полный CRUD на tblNCP.
GRANT SELECT ON [dbo].[tblNCP] TO [mes_writer];
GRANT SELECT ON [dbo].[tblComponent] TO [mes_writer];
GRANT SELECT ON [dbo].[tblDiscrepancyList] TO [mes_writer];
GRANT INSERT ON [dbo].[tblNCP] TO [mes_writer];
GRANT UPDATE ON [dbo].[tblNCP] ([Status], [ClosedBy], [ClosedAt], [Comment]) TO [mes_writer];

-- Station checks: таблица tblComponentCheck создаётся приложением автоматически.
-- ponytail: CREATE TABLE требует db_ddladmin или db_owner; mes_writer нужны только DML-права.
-- Выполнить после первого запуска приложения (таблица уже будет создана).
GRANT SELECT ON [dbo].[tblComponentCheck] TO [mes_writer];
GRANT INSERT ON [dbo].[tblComponentCheck] TO [mes_writer];
GRANT UPDATE ON [dbo].[tblComponentCheck] ([Checked], [CheckedBy], [CheckedAt]) TO [mes_writer];

-- Incoming inspection: таблицы создаются приложением автоматически (EnsureTable).
-- Выполнить после первого запуска приложения.
GRANT SELECT ON [dbo].[tblIncomingSupplier] TO [mes_writer];
GRANT INSERT ON [dbo].[tblIncomingSupplier] TO [mes_writer];

GRANT SELECT ON [dbo].[tblInspectionQuota] TO [mes_writer];
GRANT INSERT ON [dbo].[tblInspectionQuota] TO [mes_writer];

GRANT SELECT ON [dbo].[tblIncomingDelivery] TO [mes_writer];
GRANT INSERT ON [dbo].[tblIncomingDelivery] TO [mes_writer];

GRANT SELECT ON [dbo].[tblIncomingPackage] TO [mes_writer];
GRANT INSERT ON [dbo].[tblIncomingPackage] TO [mes_writer];
GRANT UPDATE ON [dbo].[tblIncomingPackage] ([Status], [ClosedAt], [ClosedBy]) TO [mes_writer];

GRANT SELECT ON [dbo].[tblIncomingPackingRow] TO [mes_writer];
GRANT INSERT ON [dbo].[tblIncomingPackingRow] TO [mes_writer];
GRANT UPDATE ON [dbo].[tblIncomingPackingRow] ([RequiredQuantity], [OkQuantity], [DefectQuantity],
    [MismatchQuantity], [ShortageQuantity], [DiscrepancyReason]) TO [mes_writer];

-- Входной контроль также вставляет в tblComponent (добавление неизвестного артикула).
GRANT INSERT ON [dbo].[tblComponent] TO [mes_writer];
GO
