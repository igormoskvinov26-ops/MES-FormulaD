-- Migration 0004: Persistent event log in SQL (T-005).
-- Replaces FileEventLog (JSONL) with a proper append-only SQL table.
-- Retention period (В-34): controlled by EventLog:RetentionDays in appsettings (default 365).
-- Application login needs INSERT + SELECT on this table; no UPDATE/DELETE required.
-- Idempotent: safe to re-run.

IF NOT EXISTS (
    SELECT 1 FROM sys.objects
    WHERE object_id = OBJECT_ID(N'[dbo].[tblEventLog]') AND type = N'U'
)
BEGIN
    CREATE TABLE [dbo].[tblEventLog] (
        [id]           INT IDENTITY(1,1) NOT NULL
                           CONSTRAINT [PK_tblEventLog] PRIMARY KEY CLUSTERED,
        [entity_type]  NVARCHAR(50)  NOT NULL,
        [entity_key]   NVARCHAR(200) NOT NULL,
        [action]       NVARCHAR(50)  NOT NULL,
        [old_value]    NVARCHAR(500) NULL,
        [new_value]    NVARCHAR(500) NULL,
        [user_name]    NVARCHAR(100) NOT NULL,
        [occurred_at]  DATETIME2(0)  NOT NULL
                           CONSTRAINT [DF_tblEventLog_occurred_at] DEFAULT SYSDATETIME()
    );

    CREATE NONCLUSTERED INDEX [IX_tblEventLog_entity]
        ON [dbo].[tblEventLog] ([entity_type], [entity_key])
        INCLUDE ([occurred_at]);
END
GO

IF NOT EXISTS (SELECT 1 FROM [dbo].[__schema_version] WHERE [Version] = 4)
BEGIN
    INSERT INTO [dbo].[__schema_version] ([Version], [Name])
    VALUES (4, N'0004_event_log');
END
GO