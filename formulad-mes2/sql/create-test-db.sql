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

-- 3. Таблица tblProductionPlan — единственная, которую приложение запрашивает через SQL.
--    Типы данных выведены из PROD-схемы и DTO приложения.
--    Если реальные типы отличаются — поправьте под свою схему.

IF OBJECT_ID(N'dbo.tblProductionPlan', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblProductionPlan]
    (
        [VIN]                 NVARCHAR(50)   NOT NULL,
        [ID]                  INT            NOT NULL IDENTITY(1,1),
        [SEQN]                INT            NULL,
        [ModelArticle]        NVARCHAR(100)  NULL,
        [ModelName]           NVARCHAR(100)  NULL,
        [EngineNumber]        NVARCHAR(50)   NULL,
        [Color]               NVARCHAR(50)   NULL,
        [SpecificationName]   NVARCHAR(100)  NULL,
        [Status]              NVARCHAR(50)   NULL,
        [statusid]            INT            NULL,
        [PrintDate]           DATETIME       NULL,
        [plannedstartdate]    DATETIME       NULL,
        [PlannedShipmentDate] DATETIME       NULL,
        [StartDate]           DATETIME       NULL,
        [CompleteDate]        DATETIME       NULL,
        [FOK_date]            DATETIME       NULL,

        CONSTRAINT [PK_tblProductionPlan] PRIMARY KEY CLUSTERED ([VIN])
    );
    PRINT 'Таблица tblProductionPlan создана.';
END
ELSE
    PRINT 'Таблица tblProductionPlan уже существует.';
GO

-- 4. Тестовые данные (5 записей для проверки пагинации и поиска)
INSERT INTO [dbo].[tblProductionPlan]
    ([VIN], [SEQN], [ModelArticle], [ModelName], [EngineNumber], [Color], [SpecificationName], [Status], [statusid], [PrintDate], [plannedstartdate])
VALUES
    (N'TEST-VIN-001', 1, N'ART-100', N'CF Moto 450',   N'ENG-001', N'Красный',  N'Стандарт',   N'Запланировано', 0, NULL, '2024-11-01'),
    (N'TEST-VIN-002', 2, N'ART-100', N'CF Moto 450',   N'ENG-002', N'Чёрный',   N'Стандарт',   N'Запланировано', 0, NULL, '2024-11-01'),
    (N'TEST-VIN-003', 3, N'ART-200', N'CF Moto 600',   N'ENG-003', N'Белый',    N'Комфорт',    N'В производстве', 1, '2024-10-28', '2024-11-02'),
    (N'TEST-VIN-004', 4, N'ART-200', N'CF Moto 600',   N'ENG-004', N'Зелёный',  N'Комфорт',    N'Завершено',     2, '2024-10-27', '2024-11-01'),
    (N'TEST-VIN-005', 5, N'ART-300', N'CF Moto 800MT', N'ENG-005', N'Серебро',  N'Премиум',    N'FOK',           3, '2024-10-26', '2024-10-30');
GO

PRINT '';
PRINT '=== Готово ===';
PRINT 'Строка подключения для приложения:';
PRINT 'Server=SQLACCESS;Database=FormulaD_TEST;User ID=mes_reader;Password=MesTest2024!;Encrypt=True;TrustServerCertificate=True';
PRINT '';
PRINT 'Запуск API:';
PRINT 'DataSource=Sql Sql__IsTestEnvironment=true Sql__ConnectionString="Server=SQLACCESS;Database=FormulaD_TEST;User ID=mes_reader;Password=MesTest2024!;Encrypt=True;TrustServerCertificate=True" dotnet run';
GO
