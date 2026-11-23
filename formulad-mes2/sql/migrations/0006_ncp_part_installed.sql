-- Migration 0006: Добавить колонку PartInstalled в tblNCP (T-164).
-- До этой миграции PartInstalled выводился из Status=2; теперь хранится отдельно.
-- Idempotent: safe to re-run.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[tblNCP]') AND name = N'PartInstalled'
)
BEGIN
    ALTER TABLE [dbo].[tblNCP]
        ADD [PartInstalled] BIT NOT NULL CONSTRAINT [DF_tblNCP_PartInstalled] DEFAULT 0;

    -- Backfill: закрытые NCP считаются с установленной деталью.
    UPDATE [dbo].[tblNCP] SET [PartInstalled] = 1 WHERE [Status] = 2;
END
GO

IF NOT EXISTS (SELECT 1 FROM [dbo].[__schema_version] WHERE [Version] = 6)
BEGIN
    INSERT INTO [dbo].[__schema_version] ([Version], [Name])
    VALUES (6, N'0006_ncp_part_installed');
END
GO