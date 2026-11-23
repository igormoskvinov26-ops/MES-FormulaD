-- Migration 0008: Add station_id FK to tblComponent.
-- station_id NULL means the component is relevant to all stations (default, backwards-compatible).
-- Idempotent: safe to run on databases where the column already exists.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[tblComponent]') AND name = N'station_id'
)
BEGIN
    ALTER TABLE [dbo].[tblComponent]
        ADD [station_id] int NULL
            CONSTRAINT [FK_tblComponent_tblStation]
            REFERENCES [dbo].[tblStation] ([ID]);
END
GO

IF NOT EXISTS (SELECT 1 FROM [dbo].[__schema_version] WHERE [Version] = 8)
BEGIN
    INSERT INTO [dbo].[__schema_version] ([Version], [Name])
    VALUES (8, N'0008_component_station_id');
END
GO