-- После восстановления: логин только для чтения. Выполняется внутри контейнера под sa.
-- Параметр sqlcmd: -v MesReaderPassword="<пароль>"; пароль в файл не записывается.
USE [master];
GO
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'mes_reader')
    CREATE LOGIN [mes_reader] WITH PASSWORD = N'$(MesReaderPassword)', DEFAULT_DATABASE = [FormulaD_TEST], CHECK_POLICY = OFF;
GO
USE [FormulaD_TEST];
GO
-- Пользователи из резервной копии привязаны к чужим SID: убираем «осиротевшие», чтобы не осталось следов прежних логинов.
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'mes_reader')
    DROP USER [mes_reader];
GO
CREATE USER [mes_reader] FOR LOGIN [mes_reader];
ALTER ROLE [db_datareader] ADD MEMBER [mes_reader];
GO
ALTER DATABASE [FormulaD_TEST] SET RECOVERY SIMPLE;
GO
