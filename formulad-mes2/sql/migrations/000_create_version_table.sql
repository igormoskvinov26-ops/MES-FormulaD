-- Migration 000: create schema version tracking table.
-- Run once on any new database (FormulaD_TEST or FormulaD).

IF OBJECT_ID(N'dbo.__SchemaVersion', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.__SchemaVersion (
        Version     INT           NOT NULL PRIMARY KEY,
        Name        NVARCHAR(200) NOT NULL,
        AppliedAt   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        AppliedBy   NVARCHAR(128) NOT NULL DEFAULT SUSER_SNAME()
    );
    INSERT INTO dbo.__SchemaVersion (Version, Name) VALUES (0, N'create_version_table');
    PRINT 'Created __SchemaVersion table.';
END
ELSE
    PRINT '__SchemaVersion already exists.';
GO
