#!/usr/bin/env bash
# Ждём запуска SQL Server и выполняем seed-скрипт.
set -e

SQLCMD=/opt/mssql-tools18/bin/sqlcmd
SA_PASSWORD="${MSSQL_SA_PASSWORD:-FormulaD_Test2024!}"
HOST="${MSSQL_HOST:-localhost}"
MAX_WAIT=60

echo "Ожидание SQL Server ($HOST)..."
for i in $(seq 1 $MAX_WAIT); do
    $SQLCMD -S "$HOST" -U sa -P "$SA_PASSWORD" -C -Q "SELECT 1" -b >/dev/null 2>&1 && break
    sleep 1
done

$SQLCMD -S "$HOST" -U sa -P "$SA_PASSWORD" -C -Q "SELECT 1" -b >/dev/null 2>&1 || {
    echo "SQL Server не запустился за ${MAX_WAIT}с" >&2
    exit 1
}

echo "SQL Server готов. Создаём БД и данные..."
$SQLCMD -S "$HOST" -U sa -P "$SA_PASSWORD" -C -i /docker-entrypoint-initdb.d/01-seed.sql

echo "Инициализация завершена."
