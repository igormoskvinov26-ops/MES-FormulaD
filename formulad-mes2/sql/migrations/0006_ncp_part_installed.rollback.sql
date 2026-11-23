-- Rollback 0006: удалить колонку PartInstalled из tblNCP.

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[tblNCP]') AND name = N'PartInstalled'
)
BEGIN
    ALTER TABLE [dbo].[tblNCP]
        DROP CONSTRAINT [DF_tblNCP_PartInstalled];
    ALTER TABLE [dbo].[tblNCP]
        DROP COLUMN [PartInstalled];
END
GO

DELETE FROM [dbo].[__schema_version] WHERE [Version] = 6;
GO