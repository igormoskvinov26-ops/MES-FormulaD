-- Migration 0002: QC Checklist tables.
-- New tables for the production quality control checklist feature (EPIC-13, T-153).
-- 6 QC posts, 49 checklist items from the printed control card (docs/PRINTED_CARDS.md).
-- Idempotent: safe to run repeatedly.

-- ── tblQCPost ───────────────────────────────────────────────────────────────
-- One row per QC post (контрольный пост КК), e.g. QCP-01..QCP-06.

IF OBJECT_ID(N'[dbo].[tblQCPost]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblQCPost] (
        [id]           int IDENTITY(1,1) NOT NULL,
        [Name]         nvarchar(50)  NOT NULL,
        [AfterStation] nvarchar(50)  NULL,
        [SortOrder]    int           NOT NULL DEFAULT 0,
        CONSTRAINT [PK_tblQCPost] PRIMARY KEY ([id])
    );
END
GO

-- ── tblChecklist ────────────────────────────────────────────────────────────
-- One row per checklist item within a QC post.

IF OBJECT_ID(N'[dbo].[tblChecklist]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblChecklist] (
        [id]          int IDENTITY(1,1) NOT NULL,
        [PostID]      int           NOT NULL,
        [Seq]         int           NOT NULL,
        [Description] nvarchar(500) NOT NULL,
        [BarcodeHint] nvarchar(100) NULL,
        CONSTRAINT [PK_tblChecklist] PRIMARY KEY ([id]),
        CONSTRAINT [FK_tblChecklist_Post] FOREIGN KEY ([PostID]) REFERENCES [dbo].[tblQCPost] ([id])
    );
END
GO

-- ── tblQCSession ────────────────────────────────────────────────────────────
-- One session = one operator walking through one post's checklist for one VIN.

IF OBJECT_ID(N'[dbo].[tblQCSession]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblQCSession] (
        [id]          int IDENTITY(1,1) NOT NULL,
        [PostID]      int           NOT NULL,
        [VIN]         nvarchar(50)  NOT NULL,
        [StartedBy]   nvarchar(100) NOT NULL,
        [StartedAt]   datetime      NOT NULL DEFAULT GETDATE(),
        [FinishedAt]  datetime      NULL,
        [Outcome]     nvarchar(20)  NULL,
        CONSTRAINT [PK_tblQCSession] PRIMARY KEY ([id]),
        CONSTRAINT [FK_tblQCSession_Post] FOREIGN KEY ([PostID]) REFERENCES [dbo].[tblQCPost] ([id])
    );
END
GO

-- ── tblQCResult ─────────────────────────────────────────────────────────────
-- One row per checklist item result within a session.

IF OBJECT_ID(N'[dbo].[tblQCResult]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[tblQCResult] (
        [id]          int IDENTITY(1,1) NOT NULL,
        [SessionID]   int           NOT NULL,
        [ItemID]      int           NOT NULL,
        [Status]      nvarchar(20)  NOT NULL,  -- 'pass' | 'fail' | 'skip'
        [Comment]     nvarchar(500) NULL,
        [CheckedBy]   nvarchar(100) NULL,
        [CheckedAt]   datetime      NULL,
        CONSTRAINT [PK_tblQCResult] PRIMARY KEY ([id]),
        CONSTRAINT [FK_tblQCResult_Session] FOREIGN KEY ([SessionID]) REFERENCES [dbo].[tblQCSession] ([id]),
        CONSTRAINT [FK_tblQCResult_Item]    FOREIGN KEY ([ItemID])    REFERENCES [dbo].[tblChecklist] ([id])
    );
END
GO

-- ── Schema version ──────────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM [dbo].[__schema_version] WHERE [Version] = 2)
    INSERT INTO [dbo].[__schema_version] ([Version], [Name])
    VALUES (2, 'QC Checklist tables (tblQCPost, tblChecklist, tblQCSession, tblQCResult)');
GO