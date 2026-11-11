#!/usr/bin/env bash
# Снимок состояния тестового стенда одной командой: ./stand/diag.sh
# Ничего не меняет, только читает. Вывод целиком отдать в чат.
# Нужен, чтобы отладка шла по фактам, а не по догадкам через круги «запусти — пришли».

COMPOSE="docker compose -f $(dirname "$0")/../docker/docker-compose.yml"
SQL='/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P FormulaD_Test2024! -C -d FormulaD_TEST'

section() { printf '\n========== %s ==========\n' "$1"; }

section "ВЕРСИЯ КОДА"
git -C "$(dirname "$0")/.." log --oneline -1 2>&1
git -C "$(dirname "$0")/.." status --short 2>&1 | head -20

section "КОНТЕЙНЕРЫ"
docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>&1

section "КТО СЛУШАЕТ 5080 И 1433"
lsof -nP -iTCP:5080 -sTCP:LISTEN 2>&1 || echo "lsof недоступен"
lsof -nP -iTCP:1433 -sTCP:LISTEN 2>&1 || true

section "ОБРАЗ mes-api"
docker image inspect docker-mes-api:latest --format 'id={{.Id}} created={{.Created}}' 2>&1

section "ФРОНТ ВНУТРИ КОНТЕЙНЕРА"
docker exec formulad-mes-api grep -o 'index-[A-Za-z0-9_-]*\.js' /app/wwwroot/index.html 2>&1
docker exec formulad-mes-api ls /app/wwwroot/assets/ 2>&1

section "ФРОНТ, КОТОРЫЙ ОТДАЁТСЯ НА ПОРТ 5080"
curl -s -D- -o /dev/null http://localhost:5080/ 2>&1 | head -12
curl -s http://localhost:5080/ 2>&1 | grep -o 'index-[A-Za-z0-9_-]*\.js'

section "ЛОГИ mes-api (последние 25)"
docker logs formulad-mes-api 2>&1 | tail -25

section "ЛОГИ init (последние 25)"
docker logs formulad-test-init 2>&1 | tail -25

section "ТАБЛИЦЫ В БД"
docker exec formulad-test-sql $SQL -h -1 -W \
    -Q "SET NOCOUNT ON; SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_NAME" 2>&1

section "ПОЛЬЗОВАТЕЛИ"
docker exec formulad-test-sql $SQL -s"|" -W \
    -Q "SET NOCOUNT ON; SELECT ID, Login, UserRole, IsActive FROM dbo.tblUser" 2>&1

section "ВХОД ПОД imosk"
curl -s -X POST http://localhost:5080/api/v1/auth/login \
    -H "Content-Type: application/json" -d '{"login":"imosk"}' 2>&1
printf '\n'
