-- Migration 0001: Create application-managed tables.
-- These tables do not exist in the original FormulaD schema and are
-- created by the MES application. Previously auto-created at runtime
-- (EnsureTable), now managed via migrations.
--
-- Idempotent: safe to run on a database where the app already created them.

-- ── Schema version tracking ─────────────────────────────────────────────

IF OBJECT_ID(N'[dbo].[__schema_version]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[__schema_version] (
        [Version]    int          NOT NULL,
        [Name]       nvarchar(200) NOT NULL,
        [AppliedAt]  datetime     NOT NULL DEFAULT GETDATE(),
        [AppliedBy]  nvarchar(128) NOT NULL DEFAULT SYSTEM_USER,
        CONSTRAINT [PK___schema_version] PRIMARY KEY ([Version])
    );
END
GO

-- ── tblComponentCheck ───────────────────────────────────────────────────

IF OBJECT_ID(N'[dbo].[tblComponentCheck]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblComponentCheck] (
        [id]            int IDENTITY(1,1) NOT NULL,
        [VIN]           nvarchar(50)  NOT NULL,
        [ComponentCode] nvarchar(50)  NOT NULL,
        [Checked]       bit           NOT NULL DEFAULT 0,
        [CheckedBy]     nvarchar(50)  NULL,
        [CheckedAt]     datetime      NULL,
        CONSTRAINT [PK_tblComponentCheck] PRIMARY KEY ([id]),
        CONSTRAINT [UQ_tblComponentCheck_VIN_Code] UNIQUE ([VIN], [ComponentCode])
    );
END
GO

-- ── tblIncomingSupplier ─────────────────────────────────────────────────

IF OBJECT_ID(N'[dbo].[tblIncomingSupplier]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblIncomingSupplier] (
        [Code]          nvarchar(50)  NOT NULL,
        [Name]          nvarchar(200) NOT NULL,
        [IsParentPlant] bit           NOT NULL DEFAULT 0,
        CONSTRAINT [PK_tblIncomingSupplier] PRIMARY KEY ([Code])
    );
END
GO

-- ── tblInspectionQuota ──────────────────────────────────────────────────

IF OBJECT_ID(N'[dbo].[tblInspectionQuota]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblInspectionQuota] (
        [ComponentCode] nvarchar(50) NOT NULL,
        [Percent]       int          NULL,
        [FixedCount]    int          NULL,
        CONSTRAINT [PK_tblInspectionQuota] PRIMARY KEY ([ComponentCode])
    );
END
GO

-- ── tblIncomingDelivery ─────────────────────────────────────────────────

IF OBJECT_ID(N'[dbo].[tblIncomingDelivery]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblIncomingDelivery] (
        [Id]                    nvarchar(32)  NOT NULL,
        [SupplierCode]          nvarchar(50)  NOT NULL,
        [SupplierName]          nvarchar(200) NOT NULL,
        [InvoiceNumber]         nvarchar(100) NOT NULL,
        [InvoiceDate]           datetime      NOT NULL,
        [AccompanyingDocument]  nvarchar(200) NULL,
        [CreatedAt]             datetime      NOT NULL,
        [CreatedBy]             nvarchar(50)  NOT NULL,
        CONSTRAINT [PK_tblIncomingDelivery] PRIMARY KEY ([Id])
    );
END
GO

-- ── tblIncomingPackage ──────────────────────────────────────────────────

IF OBJECT_ID(N'[dbo].[tblIncomingPackage]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblIncomingPackage] (
        [Id]         int IDENTITY(1,1) NOT NULL,
        [DeliveryId] nvarchar(32)      NOT NULL,
        [HuNumber]   nvarchar(100)     NOT NULL,
        [Status]     nvarchar(20)      NOT NULL DEFAULT 'Open',
        [ClosedAt]   datetime          NULL,
        [ClosedBy]   nvarchar(50)      NULL,
        CONSTRAINT [PK_tblIncomingPackage] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_tblIncomingPackage_Delivery] FOREIGN KEY ([DeliveryId])
            REFERENCES [dbo].[tblIncomingDelivery]([Id])
    );
END
GO

-- ── tblIncomingPackingRow ───────────────────────────────────────────────

IF OBJECT_ID(N'[dbo].[tblIncomingPackingRow]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblIncomingPackingRow] (
        [Id]                int IDENTITY(1,1) NOT NULL,
        [PackageId]         int               NOT NULL,
        [ComponentCode]     nvarchar(50)      NOT NULL,
        [ComponentName]     nvarchar(200)     NOT NULL,
        [PlannedQuantity]   int               NOT NULL,
        [NetWeight]         decimal(18,4)     NULL,
        [GrossWeight]       decimal(18,4)     NULL,
        [Batch]             nvarchar(100)     NULL,
        [RequiredQuantity]  int               NOT NULL,
        [OkQuantity]        int               NOT NULL DEFAULT 0,
        [DefectQuantity]    int               NOT NULL DEFAULT 0,
        [MismatchQuantity]  int               NOT NULL DEFAULT 0,
        [ShortageQuantity]  int               NOT NULL DEFAULT 0,
        [DiscrepancyReason] nvarchar(500)     NULL,
        CONSTRAINT [PK_tblIncomingPackingRow] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_tblIncomingPackingRow_Package] FOREIGN KEY ([PackageId])
            REFERENCES [dbo].[tblIncomingPackage]([Id])
    );
END
GO

-- ── Record this migration ───────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM [dbo].[__schema_version] WHERE [Version] = 1)
BEGIN
    INSERT INTO [dbo].[__schema_version] ([Version], [Name])
    VALUES (1, N'0001_create_app_tables');
END
GO