-- T-005: append-only event log
-- ponytail: no UPDATE/DELETE grants on this table for the app login
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'tblEventLog')
BEGIN
    CREATE TABLE tblEventLog (
        Id          INT IDENTITY(1,1) PRIMARY KEY,
        EntityType  NVARCHAR(100) NOT NULL,
        EntityKey   NVARCHAR(200) NOT NULL,
        Action      NVARCHAR(100) NOT NULL,
        OldValue    NVARCHAR(MAX) NULL,
        NewValue    NVARCHAR(MAX) NULL,
        UserName    NVARCHAR(200) NOT NULL,
        OccurredAt  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE NONCLUSTERED INDEX IX_tblEventLog_Entity
        ON tblEventLog (EntityType, EntityKey) INCLUDE (OccurredAt);
END
GO

-- bump schema version
IF EXISTS (SELECT 1 FROM tblSchemaVersion WHERE VersionTag = '002_event_log')
    PRINT 'Migration 002 already applied';
ELSE
    INSERT INTO tblSchemaVersion (VersionTag, AppliedAt) VALUES ('002_event_log', SYSUTCDATETIME());
GO
