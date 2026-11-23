-- Migration 0005: Print template storage (T-152).
-- Шаблоны печатных форм (Job Card, лист NCP, карта контроля и др.).
-- body_html — HTML с плейсхолдерами {{VIN}}, {{MODEL}}, {{COLOR}} и т.п.
-- Idempotent: safe to re-run.

IF NOT EXISTS (
    SELECT 1 FROM sys.objects
    WHERE object_id = OBJECT_ID(N'[dbo].[tblPrintTemplate]') AND type = N'U'
)
BEGIN
    CREATE TABLE [dbo].[tblPrintTemplate] (
        [id]          INT IDENTITY(1,1) NOT NULL
                          CONSTRAINT [PK_tblPrintTemplate] PRIMARY KEY CLUSTERED,
        [name]        NVARCHAR(100) NOT NULL,
        [body_html]   NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [updated_at]  DATETIME2(0)  NOT NULL
                          CONSTRAINT [DF_tblPrintTemplate_updated_at] DEFAULT SYSDATETIME()
    );

    -- Seed: три стандартных шаблона (пустые тела — администратор наполняет через UI).
    INSERT INTO [dbo].[tblPrintTemplate] ([name], [body_html]) VALUES
        (N'Job Card',                N'<p><strong>VIN:</strong> {{VIN}}</p><p><strong>Модель:</strong> {{MODEL}}</p><p><strong>Цвет:</strong> {{COLOR}}</p>'),
        (N'Лист NCP',               N'<p><strong>Несоответствие:</strong> {{NCP_NUMBER}}</p><p><strong>VIN:</strong> {{VIN}}</p>'),
        (N'Карта контроля изделия', N'<p><strong>VIN:</strong> {{VIN}}</p><p><strong>Инспектор ОТК:</strong> {{INSPECTOR}}</p>');
END
GO

IF NOT EXISTS (SELECT 1 FROM [dbo].[__schema_version] WHERE [Version] = 5)
BEGIN
    INSERT INTO [dbo].[__schema_version] ([Version], [Name])
    VALUES (5, N'0005_print_template');
END
GO