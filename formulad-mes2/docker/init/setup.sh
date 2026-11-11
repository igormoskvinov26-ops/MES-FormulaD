#!/usr/bin/env bash
# Инициализация тестовой БД: RESTORE из .bak если есть, иначе seed-скрипт.
set -e

SQLCMD=/opt/mssql-tools18/bin/sqlcmd
SA_PASSWORD="${MSSQL_SA_PASSWORD:-FormulaD_Test2024!}"
HOST="${MSSQL_HOST:-localhost}"
MAX_WAIT=60
BACKUP_FILE="/backup/FormulaD.bak"

echo "Ожидание SQL Server ($HOST)..."
for i in $(seq 1 $MAX_WAIT); do
    $SQLCMD -S "$HOST" -U sa -P "$SA_PASSWORD" -C -Q "SELECT 1" -b >/dev/null 2>&1 && break
    sleep 1
done

$SQLCMD -S "$HOST" -U sa -P "$SA_PASSWORD" -C -Q "SELECT 1" -b >/dev/null 2>&1 || {
    echo "SQL Server не запустился за ${MAX_WAIT}с" >&2
    exit 1
}

echo "SQL Server готов."

if [ -f "$BACKUP_FILE" ]; then
    echo "Найден бэкап: $BACKUP_FILE — восстанавливаем..."
    $SQLCMD -S "$HOST" -U sa -P "$SA_PASSWORD" -C -Q "
        IF DB_ID(N'FormulaD_TEST') IS NOT NULL
        BEGIN
            ALTER DATABASE [FormulaD_TEST] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
            DROP DATABASE [FormulaD_TEST];
        END
    "
    # Получаем логические имена из бэкапа
    LOGICAL=$($SQLCMD -S "$HOST" -U sa -P "$SA_PASSWORD" -C -h -1 -W -Q "
        RESTORE FILELISTONLY FROM DISK = '$BACKUP_FILE'
    " | head -2)
    DATA_NAME=$(echo "$LOGICAL" | sed -n '1p' | awk '{print $1}')
    LOG_NAME=$(echo "$LOGICAL" | sed -n '2p' | awk '{print $1}')

    $SQLCMD -S "$HOST" -U sa -P "$SA_PASSWORD" -C -Q "
        RESTORE DATABASE [FormulaD_TEST] FROM DISK = '$BACKUP_FILE'
        WITH MOVE '$DATA_NAME' TO '/var/opt/mssql/data/FormulaD_TEST.mdf',
             MOVE '$LOG_NAME' TO '/var/opt/mssql/data/FormulaD_TEST_log.ldf',
             REPLACE;
    "
    echo "База восстановлена из бэкапа."

    # Создаём логины и tblEventLog если нет
    $SQLCMD -S "$HOST" -U sa -P "$SA_PASSWORD" -C -Q "
        USE [master];
        IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'mes_reader')
            CREATE LOGIN [mes_reader] WITH PASSWORD = N'MesReader2024!', DEFAULT_DATABASE = [FormulaD_TEST];
        IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'mes_writer')
            CREATE LOGIN [mes_writer] WITH PASSWORD = N'MesWriter2024!', DEFAULT_DATABASE = [FormulaD_TEST];

        USE [FormulaD_TEST];
        IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'mes_reader')
            CREATE USER [mes_reader] FOR LOGIN [mes_reader];
        ALTER ROLE [db_datareader] ADD MEMBER [mes_reader];

        IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'mes_writer')
            CREATE USER [mes_writer] FOR LOGIN [mes_writer];
        ALTER ROLE [db_datareader] ADD MEMBER [mes_writer];
        ALTER ROLE [db_datawriter] ADD MEMBER [mes_writer];

        IF OBJECT_ID(N'dbo.tblEventLog', N'U') IS NULL
        BEGIN
            CREATE TABLE dbo.tblEventLog (
                Id          BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                OccurredAt  DATETIME NOT NULL DEFAULT GETDATE(),
                UserName    NVARCHAR(100) NOT NULL,
                EntityType  NVARCHAR(100) NOT NULL,
                EntityKey   NVARCHAR(100) NOT NULL,
                Action      NVARCHAR(100) NOT NULL,
                OldValue    NVARCHAR(MAX) NULL,
                NewValue    NVARCHAR(MAX) NULL
            );
            CREATE NONCLUSTERED INDEX IX_tblEventLog_EntityType_EntityKey
                ON dbo.tblEventLog (EntityType, EntityKey) INCLUDE (OccurredAt);
        END

        IF OBJECT_ID(N'dbo.__SchemaVersion', N'U') IS NULL
        BEGIN
            CREATE TABLE dbo.__SchemaVersion (
                Version INT NOT NULL PRIMARY KEY,
                Name NVARCHAR(200) NOT NULL,
                AppliedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                AppliedBy NVARCHAR(128) NOT NULL DEFAULT SUSER_SNAME()
            );
            INSERT INTO dbo.__SchemaVersion (Version, Name) VALUES (0, N'create_version_table');
            INSERT INTO dbo.__SchemaVersion (Version, Name) VALUES (2, N'create_event_log');
        END
    "
    echo "Логины и служебные таблицы созданы."
else
    echo "Бэкап не найден — используем seed-скрипт..."
    $SQLCMD -S "$HOST" -U sa -P "$SA_PASSWORD" -C -i /docker-entrypoint-initdb.d/01-seed.sql
fi

echo "Инициализация завершена."
