-- FormulaD MES 2.0 — создание тестовой БД, логинов и тестовых данных.
-- Запускается автоматически при первом старте контейнера через setup.sh.
USE [master];
GO

-- 1. База
IF DB_ID(N'FormulaD_TEST') IS NULL
    CREATE DATABASE [FormulaD_TEST];
GO

USE [FormulaD_TEST];
GO

-- 2. Таблицы

-- Производственный план
IF OBJECT_ID(N'[dbo].[tblProductionPlan]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblProductionPlan] (
        [VIN]                  nvarchar(50)  NOT NULL,
        [ID]                   int           IDENTITY(1,1) NOT NULL,
        [SEQN]                 int           NULL,
        [ModelArticle]         nvarchar(100) NULL,
        [ModelName]            nvarchar(200) NULL,
        [EngineNumber]         nvarchar(100) NULL,
        [Color]                nvarchar(100) NULL,
        [SpecificationName]    nvarchar(300) NULL,
        [Status]               nvarchar(50)  NULL,
        [statusid]             int           NULL,
        [PrintDate]            datetime      NULL,
        [plannedstartdate]     datetime      NULL,
        [PlannedShipmentDate]  datetime      NULL,
        [StartDate]            datetime      NULL,
        [CompleteDate]         datetime      NULL,
        [FOK_date]             datetime      NULL,
        CONSTRAINT [PK_tblProductionPlan] PRIMARY KEY CLUSTERED ([VIN])
    );
END
GO

-- Несоответствия (NCP)
IF OBJECT_ID(N'[dbo].[tblDiscrepancyList]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblDiscrepancyList] (
        [id]            int IDENTITY(1,1) NOT NULL,
        [discrepancy]   nvarchar(200)     NOT NULL,
        CONSTRAINT [PK_tblDiscrepancyList] PRIMARY KEY ([id])
    );
END
GO

IF OBJECT_ID(N'[dbo].[tblComponent]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblComponent] (
        [id]              int IDENTITY(1,1) NOT NULL,
        [ComponentCode]   nvarchar(50)      NOT NULL,
        [ComponentName]   nvarchar(200)     NULL,
        [StationID]       int               NULL,
        CONSTRAINT [PK_tblComponent] PRIMARY KEY ([id])
    );
END
GO

IF OBJECT_ID(N'[dbo].[tblNCP]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblNCP] (
        [id]                  int IDENTITY(1,1) NOT NULL,
        [VIN]                 nvarchar(50)       NOT NULL,
        [StationID]           int                NULL,
        [ComponentID]         int                NULL,
        [Quantity]            int                NOT NULL DEFAULT 1,
        [DiscrepancyTypeID]   int                NULL,
        [Comment]             nvarchar(500)      NULL,
        [Status]              int                NOT NULL DEFAULT 1,
        [CreatedBy]           nvarchar(50)       NULL,
        [CreatedAt]           datetime           NULL,
        [ClosedBy]            nvarchar(50)       NULL,
        [ClosedAt]            datetime           NULL,
        CONSTRAINT [PK_tblNCP] PRIMARY KEY ([id]),
        CONSTRAINT [FK_tblNCP_Plan] FOREIGN KEY ([VIN])
            REFERENCES [dbo].[tblProductionPlan]([VIN]),
        CONSTRAINT [FK_tblNCP_Component] FOREIGN KEY ([ComponentID])
            REFERENCES [dbo].[tblComponent]([id]),
        CONSTRAINT [FK_tblNCP_Discrepancy] FOREIGN KEY ([DiscrepancyTypeID])
            REFERENCES [dbo].[tblDiscrepancyList]([id])
    );
END
GO

-- Проверка компонентов на посту
IF OBJECT_ID(N'[dbo].[tblComponentCheck]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblComponentCheck] (
        [id]             int IDENTITY(1,1) NOT NULL,
        [VIN]            nvarchar(50)       NOT NULL,
        [ComponentCode]  nvarchar(50)       NOT NULL,
        [Checked]        bit                NOT NULL DEFAULT 0,
        [CheckedBy]      nvarchar(50)       NULL,
        [CheckedAt]      datetime           NULL,
        CONSTRAINT [PK_tblComponentCheck] PRIMARY KEY ([id]),
        CONSTRAINT [UQ_tblComponentCheck_VIN_Code] UNIQUE ([VIN], [ComponentCode])
    );
END
GO

-- Входной контроль: поставщики
IF OBJECT_ID(N'[dbo].[tblIncomingSupplier]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblIncomingSupplier] (
        [Code]           nvarchar(50)  NOT NULL,
        [Name]           nvarchar(200) NOT NULL,
        [IsParentPlant]  bit           NOT NULL DEFAULT 0,
        CONSTRAINT [PK_tblIncomingSupplier] PRIMARY KEY ([Code])
    );
END
GO

-- Входной контроль: нормы приёмки
IF OBJECT_ID(N'[dbo].[tblInspectionQuota]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblInspectionQuota] (
        [ComponentCode]  nvarchar(50) NOT NULL,
        [Percent]        int          NULL,
        [FixedCount]     int          NULL,
        CONSTRAINT [PK_tblInspectionQuota] PRIMARY KEY ([ComponentCode])
    );
END
GO

-- Входной контроль: поставки
IF OBJECT_ID(N'[dbo].[tblIncomingDelivery]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblIncomingDelivery] (
        [Id]                     nvarchar(32)  NOT NULL,
        [SupplierCode]           nvarchar(50)  NOT NULL,
        [SupplierName]           nvarchar(200) NOT NULL,
        [InvoiceNumber]          nvarchar(100) NOT NULL,
        [InvoiceDate]            datetime      NOT NULL,
        [AccompanyingDocument]   nvarchar(200) NULL,
        [CreatedAt]              datetime      NOT NULL,
        [CreatedBy]              nvarchar(50)  NOT NULL,
        CONSTRAINT [PK_tblIncomingDelivery] PRIMARY KEY ([Id])
    );
END
GO

-- Входной контроль: грузовые места
IF OBJECT_ID(N'[dbo].[tblIncomingPackage]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblIncomingPackage] (
        [Id]          int IDENTITY(1,1) NOT NULL,
        [DeliveryId]  nvarchar(32) NOT NULL,
        [HuNumber]    nvarchar(100) NOT NULL,
        [Status]      nvarchar(20) NOT NULL DEFAULT 'Open',
        [ClosedAt]    datetime NULL,
        [ClosedBy]    nvarchar(50) NULL,
        CONSTRAINT [PK_tblIncomingPackage] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_tblIncomingPackage_Delivery] FOREIGN KEY ([DeliveryId])
            REFERENCES [dbo].[tblIncomingDelivery]([Id])
    );
END
GO

-- Входной контроль: строки упаковочного листа
IF OBJECT_ID(N'[dbo].[tblIncomingPackingRow]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblIncomingPackingRow] (
        [Id]                int IDENTITY(1,1) NOT NULL,
        [PackageId]         int NOT NULL,
        [ComponentCode]     nvarchar(50) NOT NULL,
        [ComponentName]     nvarchar(200) NOT NULL,
        [PlannedQuantity]   int NOT NULL,
        [NetWeight]         decimal(18,4) NULL,
        [GrossWeight]       decimal(18,4) NULL,
        [Batch]             nvarchar(100) NULL,
        [RequiredQuantity]  int NOT NULL,
        [OkQuantity]        int NOT NULL DEFAULT 0,
        [DefectQuantity]    int NOT NULL DEFAULT 0,
        [MismatchQuantity]  int NOT NULL DEFAULT 0,
        [ShortageQuantity]  int NOT NULL DEFAULT 0,
        [DiscrepancyReason] nvarchar(500) NULL,
        CONSTRAINT [PK_tblIncomingPackingRow] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_tblIncomingPackingRow_Package] FOREIGN KEY ([PackageId])
            REFERENCES [dbo].[tblIncomingPackage]([Id])
    );
END
GO

-- 3. Логины

USE [master];
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'mes_reader')
    CREATE LOGIN [mes_reader] WITH PASSWORD = N'MesReader2024!', DEFAULT_DATABASE = [FormulaD_TEST];
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'mes_writer')
    CREATE LOGIN [mes_writer] WITH PASSWORD = N'MesWriter2024!', DEFAULT_DATABASE = [FormulaD_TEST];
GO

USE [FormulaD_TEST];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'mes_reader')
    CREATE USER [mes_reader] FOR LOGIN [mes_reader];
ALTER ROLE [db_datareader] ADD MEMBER [mes_reader];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'mes_writer')
    CREATE USER [mes_writer] FOR LOGIN [mes_writer];
ALTER ROLE [db_datareader] ADD MEMBER [mes_writer];
ALTER ROLE [db_datawriter] ADD MEMBER [mes_writer];
GO

-- 4. Тестовые данные

-- Компоненты.
-- Везде ниже вставка только в пустую таблицу: при загрузке дампа прода эти блоки
-- пропускаются, а демо-данные остаются лишь там, где на проде таблицы нет.
IF NOT EXISTS (SELECT 1 FROM [dbo].[tblComponent])
BEGIN
SET IDENTITY_INSERT [dbo].[tblComponent] ON;
INSERT INTO [dbo].[tblComponent] ([id], [ComponentCode], [ComponentName], [StationID]) VALUES
    (1, 'FRM-001', N'Рама основная',                1),
    (2, 'ENG-001', N'Двигатель 800cc',              2),
    (3, 'ENG-002', N'Двигатель 1000cc',             2),
    (4, 'TRN-001', N'Трансмиссия CVT',              3),
    (5, 'SUS-001', N'Подвеска передняя',            4),
    (6, 'SUS-002', N'Подвеска задняя',              4),
    (7, 'BRK-001', N'Тормозная система',            5),
    (8, 'ELC-001', N'Жгут проводов',                6),
    (9, 'ELC-002', N'Блок управления ECU',          6),
    (10, 'BDY-001', N'Обвес пластиковый',           7),
    (11, 'BDY-002', N'Сиденье',                     8),
    (12, 'WHL-001', N'Колёса в сборе (4 шт)',       9),
    (13, 'FUL-001', N'Топливный бак',               10),
    (14, 'EXH-001', N'Выхлопная система',           11),
    (15, 'LGT-001', N'Светотехника комплект',       7);
SET IDENTITY_INSERT [dbo].[tblComponent] OFF;
END
GO

-- Типы несоответствий
IF NOT EXISTS (SELECT 1 FROM [dbo].[tblDiscrepancyList])
BEGIN
SET IDENTITY_INSERT [dbo].[tblDiscrepancyList] ON;
INSERT INTO [dbo].[tblDiscrepancyList] ([id], [discrepancy]) VALUES
    (1, N'Царапина'),
    (2, N'Вмятина'),
    (3, N'Некомплект'),
    (4, N'Неверная деталь'),
    (5, N'Дефект покраски'),
    (6, N'Течь'),
    (7, N'Электрический дефект'),
    (8, N'Крепёж не затянут');
SET IDENTITY_INSERT [dbo].[tblDiscrepancyList] OFF;
END
GO

-- Поставщики
IF NOT EXISTS (SELECT 1 FROM [dbo].[tblIncomingSupplier])
INSERT INTO [dbo].[tblIncomingSupplier] ([Code], [Name], [IsParentPlant]) VALUES
    ('SUP-001', N'ООО «МоторТех»',        0),
    ('SUP-002', N'ЗАО «РамаПром»',        0),
    ('SUP-003', N'ИП Иванов А.С.',         0),
    ('PARENT',  N'Головной завод',         1);
GO

-- Производственный план (6 изделий — совпадает с тестовыми фикстурами)
IF NOT EXISTS (SELECT 1 FROM [dbo].[tblProductionPlan])
BEGIN
SET IDENTITY_INSERT [dbo].[tblProductionPlan] ON;

INSERT INTO [dbo].[tblProductionPlan]
    ([VIN], [ID], [SEQN], [ModelArticle], [ModelName], [EngineNumber], [Color],
     [SpecificationName], [Status], [statusid], [PrintDate], [plannedstartdate],
     [PlannedShipmentDate], [StartDate], [CompleteDate], [FOK_date])
VALUES
    ('DEMO-VIN-00001', 1001, 23, 'DEMO-800',  N'Квадроцикл 800 · ДЕМО',  'DEMO-ENGINE-01', N'Серый',
     N'Pathcross 1000 LTD · ДЕМО', 'in progress', 1,
     '2026-10-12', '2026-10-12', '2026-11-15', '2026-10-20T09:00:00', NULL, NULL),

    ('DEMO-VIN-00002', 1002, 24, 'DEMO-800',  N'Квадроцикл 800 · ДЕМО',  'DEMO-ENGINE-02', N'Красный',
     N'Pathcross 1000 LTD · ДЕМО', 'planned', 0,
     '2026-10-12', '2026-10-14', '2026-11-17', NULL, NULL, NULL),

    ('DEMO-VIN-00003', 1003, 25, 'DEMO-1000', N'Квадроцикл 1000 · ДЕМО', 'DEMO-ENGINE-03', N'Чёрный',
     N'Pathcross MAX 1000 ARMY29CST YIT ST4 диджитал · ДЕМО', 'complete', 2,
     '2026-10-10', '2026-10-11', '2026-11-13', '2026-10-18T09:30:00', '2026-10-24T16:00:00', NULL),

    ('DEMO-VIN-00004', 1004, 26, 'DEMO-800',  N'Квадроцикл 800 · ДЕМО',  'DEMO-ENGINE-04', N'Белый',
     N'Pathcross 1000 LTD · ДЕМО', 'FOK', 3,
     '2026-10-09', '2026-10-10', NULL, '2026-10-16T09:00:00', '2026-10-19T16:00:00', '2026-10-21T10:00:00'),

    ('DEMO-VIN-00005', 1005, NULL, 'DEMO-700', N'Квадроцикл 700 · ДЕМО', 'DEMO-ENGINE-05', NULL,
     NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL, NULL),

    ('DEMO-VIN-00006', 1006, 28, NULL, NULL, 'DEMO-ENGINE-06', N'Синий',
     N'Pathcross MAX 1000 ARMY29CST YIT ST4 диджитал · ДЕМО', 'custom_unknown', 88,
     '2026-10-23', NULL, NULL, NULL, NULL, NULL);

SET IDENTITY_INSERT [dbo].[tblProductionPlan] OFF;
END
GO

-- NCP: пара тестовых несоответствий
IF NOT EXISTS (SELECT 1 FROM [dbo].[tblNCP])
INSERT INTO [dbo].[tblNCP] ([VIN], [StationID], [ComponentID], [Quantity], [DiscrepancyTypeID], [Comment], [Status], [CreatedBy], [CreatedAt])
VALUES
    ('DEMO-VIN-00001', 3, 4, 1, 3, N'Не хватает болтов крепления', 1, 'test-user', '2026-10-21T10:00:00'),
    ('DEMO-VIN-00003', 7, 10, 1, 1, N'Царапина на левом крыле', 2, 'test-user', '2026-10-22T14:00:00');
GO

-- Event log (T-005): append-only audit trail
IF OBJECT_ID(N'dbo.tblEventLog', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.tblEventLog (
        Id              BIGINT        IDENTITY(1,1) NOT NULL PRIMARY KEY,
        OccurredAt      DATETIME      NOT NULL DEFAULT GETDATE(),
        UserName        NVARCHAR(100) NOT NULL,
        EntityType      NVARCHAR(100) NOT NULL,
        EntityKey       NVARCHAR(100) NOT NULL,
        Action          NVARCHAR(100) NOT NULL,
        OldValue        NVARCHAR(MAX) NULL,
        NewValue        NVARCHAR(MAX) NULL,
    );
    CREATE NONCLUSTERED INDEX IX_tblEventLog_EntityType_EntityKey
        ON dbo.tblEventLog (EntityType, EntityKey)
        INCLUDE (OccurredAt);
END
GO

-- Schema version tracking (T-029)
IF OBJECT_ID(N'dbo.__SchemaVersion', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.__SchemaVersion (
        Version     INT           NOT NULL PRIMARY KEY,
        Name        NVARCHAR(200) NOT NULL,
        AppliedAt   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        AppliedBy   NVARCHAR(128) NOT NULL DEFAULT SUSER_SNAME()
    );
    INSERT INTO dbo.__SchemaVersion (Version, Name) VALUES (0, N'create_version_table');
    INSERT INTO dbo.__SchemaVersion (Version, Name) VALUES (2, N'create_event_log');
END
GO

PRINT 'FormulaD_TEST: база, таблицы, логины и тестовые данные готовы.';
GO
