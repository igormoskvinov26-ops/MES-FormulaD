-- dbo.tblUser и dbo.tblRole — схема дословно как на проде (см. sql/seed/prod_dump.sql).
-- PasswordHash на проде пустой у всех: вход по доменной учётке Windows, таблица отвечает
-- только за «пускать ли» (IsActive) и «что можно» (UserRole → tblRole.ID).
-- Guard'ы нужны, чтобы при RESTORE настоящего бэкапа эти таблицы не перезаписывались.
IF OBJECT_ID(N'dbo.tblRole', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.tblRole (
        ID          INT IDENTITY(1,1) NOT NULL,
        RoleName    NVARCHAR(50) NULL,
        Description NVARCHAR(50) NULL,
        IsActive    BIT NULL,
        CONSTRAINT PK_tblRole PRIMARY KEY CLUSTERED (ID)
    );
END

IF OBJECT_ID(N'dbo.tblUser', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.tblUser (
        ID           INT IDENTITY(1,1) NOT NULL,
        Login        NVARCHAR(50) NULL,
        PasswordHash NVARCHAR(50) NULL,
        FullName     NVARCHAR(50) NULL,
        UserRole     NVARCHAR(50) NULL,
        IsActive     BIT NULL,
        Email        NVARCHAR(50) NULL,
        Phone        NVARCHAR(50) NULL
    );
END

-- Данные прода на 2026-11-11. Заменить на выгрузку из бэкапа, когда она появится.
IF NOT EXISTS (SELECT 1 FROM dbo.tblUser)
BEGIN
    SET IDENTITY_INSERT dbo.tblUser ON;
    INSERT INTO dbo.tblUser (ID, Login, PasswordHash, FullName, UserRole, IsActive, Email, Phone) VALUES
        (1, N'CommonUser',            NULL, NULL,                  N'1', 1, NULL, NULL),
        (2, N'v.lemeshenko',          NULL, NULL,                  N'1', 1, NULL, NULL),
        (3, N'k.safronova',           NULL, N'Ксения Сафронова',   N'2', 1, NULL, NULL),
        (4, N'Vyacheslav Lemeshenko', NULL, N'Вячеслав Лемешенко', N'1', 1, NULL, NULL),
        (5, N'imosk',                 NULL, N'Игорь Москвинов',    N'1', 1, NULL, NULL),
        (6, N'i.moskvinov',           NULL, N'Игорь Москвинов',    N'1', 1, NULL, NULL);
    SET IDENTITY_INSERT dbo.tblUser OFF;
END

IF NOT EXISTS (SELECT 1 FROM dbo.__SchemaVersion WHERE Version = 3)
    INSERT INTO dbo.__SchemaVersion (Version, Name) VALUES (3, N'create_user');
