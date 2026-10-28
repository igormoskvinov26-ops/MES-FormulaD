-- =============================================================================
-- FormulaD MES 2.0 — создание тестовой базы и логина на PROD-экземпляре
-- Выполнять под sa1 (или любым логином с правами CREATE DATABASE / CREATE LOGIN)
-- =============================================================================

-- 1. База
USE [master];
GO

IF DB_ID(N'FormulaD_TEST') IS NULL
BEGIN
    CREATE DATABASE [FormulaD_TEST];
    PRINT 'База FormulaD_TEST создана.';
END
ELSE
    PRINT 'База FormulaD_TEST уже существует.';
GO

-- 2. Логин + пользователь (только SELECT)
USE [master];
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'mes_reader')
BEGIN
    CREATE LOGIN [mes_reader] WITH PASSWORD = N'MesTest2024!', DEFAULT_DATABASE = [FormulaD_TEST];
    PRINT 'Логин mes_reader создан.';
END
ELSE
    PRINT 'Логин mes_reader уже существует.';
GO

USE [FormulaD_TEST];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'mes_reader')
BEGIN
    CREATE USER [mes_reader] FOR LOGIN [mes_reader];
    PRINT 'Пользователь mes_reader создан в FormulaD_TEST.';
END
GO

-- Только чтение, ничего больше
ALTER ROLE [db_datareader] ADD MEMBER [mes_reader];
GO

-- 3. Копируем схему tblProductionPlan из PROD (без данных).
--    SELECT TOP 0 создаёт таблицу с теми же колонками и типами, но без индексов/PK.
--    PK добавляем отдельно.

IF OBJECT_ID(N'FormulaD_TEST.dbo.tblProductionPlan', N'U') IS NULL
BEGIN
    SELECT TOP 0 * INTO [FormulaD_TEST].[dbo].[tblProductionPlan] FROM [FormulaD].[dbo].[tblProductionPlan];
    ALTER TABLE [FormulaD_TEST].[dbo].[tblProductionPlan] ADD CONSTRAINT [PK_tblProductionPlan] PRIMARY KEY CLUSTERED ([VIN]);
    PRINT 'Таблица tblProductionPlan скопирована из FormulaD (схема без данных).';
END
ELSE
    PRINT 'Таблица tblProductionPlan уже существует в FormulaD_TEST.';
GO

-- 4. Копируем несколько строк для проверки (первые 50 по VIN).
--    Если хотите все данные — уберите TOP 50.
--    Если хотите пустую базу — закомментируйте этот блок.

IF NOT EXISTS (SELECT 1 FROM [FormulaD_TEST].[dbo].[tblProductionPlan])
BEGIN
    INSERT INTO [FormulaD_TEST].[dbo].[tblProductionPlan]
    SELECT TOP 50 * FROM [FormulaD].[dbo].[tblProductionPlan] ORDER BY [VIN];
    PRINT 'Скопировано до 50 строк из FormulaD в FormulaD_TEST.';
END
ELSE
    PRINT 'Данные уже есть — пропускаем копирование.';
GO

PRINT '';
PRINT '=== Готово ===';
PRINT 'Строка подключения для приложения:';
PRINT 'Server=SQLACCESS;Database=FormulaD_TEST;User ID=mes_reader;Password=MesTest2024!;Encrypt=True;TrustServerCertificate=True';
PRINT '';
PRINT 'Запуск API:';
PRINT 'DataSource=Sql Sql__IsTestEnvironment=true Sql__ConnectionString="Server=SQLACCESS;Database=FormulaD_TEST;User ID=mes_reader;Password=MesTest2024!;Encrypt=True;TrustServerCertificate=True" dotnet run';
GO
