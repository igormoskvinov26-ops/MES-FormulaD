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
GO
