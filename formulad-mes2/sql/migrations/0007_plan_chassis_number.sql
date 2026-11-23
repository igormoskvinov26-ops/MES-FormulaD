-- Migration 0007: ChassisNumber в tblProductionPlan (T-162).
-- Поле существует в PROD-схеме; на TEST-экземплярах, созданных до его появления,
-- добавляется миграцией. Idempotent: safe to re-run.

IF EXISTS (
    SELECT 1 FROM sys.objects
    WHERE object_id = OBJECT_ID(N'[dbo].[tblProductionPlan]') AND type = N'U'
)
AND NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[tblProductionPlan]') AND name = N'ChassisNumber'
)
BEGIN
    ALTER TABLE [dbo].[tblProductionPlan]
        ADD [ChassisNumber] NVARCHAR(50) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM [dbo].[__schema_version] WHERE [Version] = 7)
BEGIN
    INSERT INTO [dbo].[__schema_version] ([Version], [Name])
    VALUES (7, N'0007_plan_chassis_number');
END
GO