-- Migration 0003: Add model_ids to tblComponent and admin write support.
-- model_ids stores a JSON array of model article IDs the component is relevant to.
-- NULL means relevant to all models (default).
-- Idempotent: safe to run on databases where the column already exists.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[tblComponent]') AND name = N'model_ids'
)
BEGIN
    ALTER TABLE [dbo].[tblComponent]
        ADD [model_ids] nvarchar(500) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM [dbo].[__schema_version] WHERE [Version] = 3)
BEGIN
    INSERT INTO [dbo].[__schema_version] ([Version], [Name])
    VALUES (3, N'0003_component_model_ids');
END
GO