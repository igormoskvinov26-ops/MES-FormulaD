#!/usr/bin/env bash
# Поднимает локальный SQL Server в Docker и восстанавливает в него резервную копию базы под именем FormulaD_TEST.
# Резервную копию снимает и передаёт владелец/DBA — этот скрипт к рабочему серверу НЕ подключается.
#
#   export ACCEPT_EULA=Y MSSQL_SA_PASSWORD=... MES_READER_PASSWORD=... MES_WRITER_PASSWORD=...
#   docker/restore.sh /путь/к/файлу.bak
#
# FORCE=1            — перезаписать уже существующую FormulaD_TEST
# ANONYMIZE_SQL=file — выполнить после восстановления скрипт обезличивания (его даёт владелец/DBA; решение №2 плана)
set -euo pipefail

BAK="${1:?Укажите путь к файлу резервной копии: docker/restore.sh /путь/к/файлу.bak}"
: "${ACCEPT_EULA:?Прочитайте лицензию SQL Server и задайте ACCEPT_EULA=Y}"
: "${MSSQL_SA_PASSWORD:?Задайте MSSQL_SA_PASSWORD}"
: "${MES_READER_PASSWORD:?Задайте MES_READER_PASSWORD}"
: "${MES_WRITER_PASSWORD:?Задайте MES_WRITER_PASSWORD}"
[ -f "$BAK" ] || { echo "Файл не найден: $BAK" >&2; exit 1; }

DB="FormulaD_TEST"   # имя зашито: приложение открывает только эту базу (белый список SqlOptions.AllowedDatabases)
cd "$(dirname "$0")"

sqlc() { docker compose exec -T -e SQLCMDPASSWORD="$MSSQL_SA_PASSWORD" db /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa "$@"; }

echo "▸ Запуск контейнера"
docker compose up -d db
echo -n "▸ Ожидание готовности SQL Server"
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' mes-test-sql 2>/dev/null)" = "healthy" ] && break
  echo -n "."; sleep 3
done
echo
[ "$(docker inspect -f '{{.State.Health.Status}}' mes-test-sql)" = "healthy" ] || { echo "SQL Server не запустился: docker compose logs db" >&2; exit 1; }

if [ "$(sqlc -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.databases WHERE name = N'$DB'" | tr -d '[:space:]')" != "0" ]; then
  [ "${FORCE:-0}" = "1" ] || { echo "База $DB уже есть. Для перезаписи задайте FORCE=1." >&2; exit 1; }
fi

echo "▸ Копирование резервной копии в контейнер"
docker compose exec -T -u root db mkdir -p /var/opt/mssql/backup
docker compose cp "$BAK" db:/var/opt/mssql/backup/restore.bak
docker compose exec -T -u root db chmod 644 /var/opt/mssql/backup/restore.bak

echo "▸ Чтение состава файлов копии"
MOVES=""
n=0
while IFS='|' read -r logical _ type _; do
  logical="$(echo "$logical" | xargs)"; type="$(echo "$type" | xargs)"
  [ -n "$logical" ] || continue
  case "$type" in
    D) ext="mdf"; [ "$n" -gt 0 ] && ext="ndf"
       MOVES="$MOVES, MOVE N'$logical' TO N'/var/opt/mssql/data/${DB}_$n.$ext'"; n=$((n+1)) ;;
    L) MOVES="$MOVES, MOVE N'$logical' TO N'/var/opt/mssql/data/${DB}_$n.ldf'"; n=$((n+1)) ;;
  esac
done < <(sqlc -h -1 -W -s '|' -Q "SET NOCOUNT ON; RESTORE FILELISTONLY FROM DISK = N'/var/opt/mssql/backup/restore.bak'")
[ -n "$MOVES" ] || { echo "Не удалось прочитать состав копии (файл повреждён или не резервная копия SQL Server)." >&2; exit 1; }

REPLACE=""; [ "${FORCE:-0}" = "1" ] && REPLACE=", REPLACE"
echo "▸ Восстановление в $DB (может занять несколько минут)"
sqlc -b -Q "RESTORE DATABASE [$DB] FROM DISK = N'/var/opt/mssql/backup/restore.bak' WITH STATS = 10${MOVES}${REPLACE}"
docker compose exec -T -u root db rm -f /var/opt/mssql/backup/restore.bak

if [ -n "${ANONYMIZE_SQL:-}" ]; then
  echo "▸ Обезличивание: $ANONYMIZE_SQL"
  docker compose cp "$ANONYMIZE_SQL" db:/tmp/anonymize.sql
  sqlc -b -d "$DB" -i /tmp/anonymize.sql
else
  echo "⚠ Данные НЕ обезличены (ANONYMIZE_SQL не задан). Держите копию только на своём компьютере."
fi

echo "▸ Логины: только чтение (mes_reader) и запись (mes_writer)"
sqlc -b -v MesReaderPassword="$MES_READER_PASSWORD" -i /post-restore.sql
sqlc -v MesWriterPassword="$MES_WRITER_PASSWORD" -i /sql/create-writer-login.sql

cat <<MSG

Готово. База $DB восстановлена в контейнере mes-test-sql (порт 127.0.0.1:${MSSQL_PORT:-1433}).
Подключение приложения (пароль — в user-secrets, не в файлах):
  Sql:IsTestEnvironment=true
  Sql:ConnectionString = Server=localhost,${MSSQL_PORT:-1433};Database=$DB;User ID=mes_reader;Password=<MES_READER_PASSWORD>;Encrypt=True;TrustServerCertificate=True
Остановка: docker compose -f docker/docker-compose.yml down   (данные сохранятся; с -v — удалить вместе с томом)
MSG
