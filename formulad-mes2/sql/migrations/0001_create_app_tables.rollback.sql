-- Rollback migration 0001: drop application-managed tables.
-- WARNING: destroys data. Use only on TEST databases.
-- Order: child tables first (FK constraints).

DROP TABLE IF EXISTS [dbo].[tblIncomingPackingRow];
DROP TABLE IF EXISTS [dbo].[tblIncomingPackage];
DROP TABLE IF EXISTS [dbo].[tblIncomingDelivery];
DROP TABLE IF EXISTS [dbo].[tblInspectionQuota];
DROP TABLE IF EXISTS [dbo].[tblIncomingSupplier];
DROP TABLE IF EXISTS [dbo].[tblComponentCheck];

DELETE FROM [dbo].[__schema_version] WHERE [Version] = 1;
GO