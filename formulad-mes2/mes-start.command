#!/usr/bin/env bash
# =============================================================================
# MES FormulaD — Полный запуск тестового стенда с авто-диагностикой
# Использование: Двойной клик в Finder — откроется Terminal и запустится
# =============================================================================
set -euo pipefail

REPO="/Users/imosk/WEB-MES-F7"
API_DIR="$REPO/src/FormulaD.Mes.Api"
STAND="$REPO/stand/stand.sh"
RUN="$REPO/stand/.run"
PORT=5080
URL="http://localhost:$PORT"
SQL_CONTAINER="mes-test-sql"
SA_PASS="NLy75RGRgTS0wHqoiYAa1"
DB="FormulaD_TEST"

LOGDIR="$RUN/logs"
mkdir -p "$LOGDIR"
LOGFILE="$LOGDIR/start-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOGFILE") 2>&1

R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' B='\033[1;34m' N='\033[0m'
ok()   { echo -e "${G}  ✓ $*${N}"; }
warn() { echo -e "${Y}  ⚠ $*${N}"; }
err()  { echo -e "${R}  ✗ $*${N}"; }
hdr()  { echo -e "\n${B}[── $* ──]${N}"; }
die()  { err "$*"; echo -e "\n${R}ПРОВАЛ. Лог: $LOGFILE${N}"; read -p "Нажми Enter..." _; exit 1; }
hr()   { echo "────────────────────────────────────────────"; }

echo -e "${B}"
echo '┌──────────────────────────────────────────────┐'
echo '│   MES FormulaD — Запуск тестового стенда     │'
printf '│   Дата: %s               │\n' "$(date '+%Y-%m-%d %H:%M:%S')"
echo '└──────────────────────────────────────────────┘'
echo -e "${N}"

hdr "1/9 Проверка инструментов"
MISSING=""
for t in dotnet node npm curl docker git; do
  command -v "$t" >/dev/null && ok "$t" || { err "$t не найден"; MISSING="$MISSING $t"; }
done
[ -z "$MISSING" ] || die "Установи недостающие инструменты:$MISSING"

hdr "2/9 Обновление кода (git pull)"
if [ -d "$REPO/.git" ]; then
  cd "$REPO"
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  ok "Ветка: $BRANCH"
  git pull --ff-only 2>&1 && ok "Код обновлён" || warn "git pull не удался — продолжаю с текущим кодом"
else
  warn "Репо не инициализировано — пропускаю git pull"
fi

hdr "3/9 SQL Server контейнер ($SQL_CONTAINER)"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${SQL_CONTAINER}$"; then
  ok "Контейнер запущен"
else
  warn "Контейнер не запущен — пробую запустить..."
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${SQL_CONTAINER}$"; then
    docker start "$SQL_CONTAINER" && ok "Контейнер запущен" && sleep 8
  else
    die "Контейнер $SQL_CONTAINER не найден."
  fi
fi

hdr "4/9 SQL логины"
SQLCMD="docker exec $SQL_CONTAINER /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P $SA_PASS"
sql_check_login() {
  $SQLCMD -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.server_principals WHERE name='$1'" 2>/dev/null \
    | grep -E '^\s*[0-9]' | tr -d ' ' | grep -q '^1$'
}
create_login() {
  local login="$1" pass="$2"
  $SQLCMD -Q "IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name='$login') BEGIN CREATE LOGIN [$login] WITH PASSWORD='$pass'; END; USE [$DB]; IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name='$login') BEGIN CREATE USER [$login] FOR LOGIN [$login]; END; GRANT SELECT,INSERT,UPDATE,DELETE ON SCHEMA::dbo TO [$login];" 2>&1 || true
}
sql_check_login "mes_reader" && ok "mes_reader существует" || { warn "mes_reader не найден — создаю..."; create_login "mes_reader" "MesReader2024!" && ok "mes_reader создан"; }
sql_check_login "mes_writer" && ok "mes_writer существует" || { warn "mes_writer не найден — создаю..."; create_login "mes_writer" "MesWriter2024!" && ok "mes_writer создан"; }

hdr "5/9 dotnet user-secrets"
ensure_secret() {
  local key="$1" val="$2"
  dotnet user-secrets list --project "$API_DIR" 2>/dev/null | grep -q "^$key" \
    && ok "$key задан" \
    || { warn "$key отсутствует — устанавливаю..."; dotnet user-secrets set "$key" "$val" --project "$API_DIR" && ok "$key установлен"; }
}
ensure_secret "Sql:ConnectionString" "Server=localhost,1433;Database=FormulaD_TEST;User ID=mes_reader;Password=MesReader2024!;Encrypt=True;TrustServerCertificate=True"
ensure_secret "Sql:WriteConnectionString" "Server=localhost,1433;Database=FormulaD_TEST;User ID=mes_writer;Password=MesWriter2024!;Encrypt=True;TrustServerCertificate=True"

hdr "6/9 Проверка stand.sh"
if grep -qE 'DataSource=Demo|Demo, без SQL|env -u Sql__' "$STAND" 2>/dev/null; then
  warn "stand.sh в Demo-режиме — исправляю..."
  python3 -c "
import re, pathlib
p = pathlib.Path('$STAND')
t = p.read_text()
new = '''  echo \"\\u25b8 \\u0417\\u0430\\u043f\\u0443\\u0441\\u043a \\u043d\\u0430 \$URL (SQL)\"
  cd \"\$API_DIR\"
  DataSource=Sql Sql__IsTestEnvironment=true ASPNETCORE_ENVIRONMENT=Development \\\\
    DevAuth__Enabled=true DevAuth__Username=admin DevAuth__Password=mes \\\\
    \"\${NEWSESSION[@]}\" nohup dotnet run --no-build -c Release --no-launch-profile --urls \"\$URL\" \\\\
    > \"\$RUN/stand.log\" 2>&1 < /dev/null &
  echo \$! > \"\$RUN/pid\"
  cd \"\$ROOT\"'''
r = re.sub(r'  echo \".*?Запуск.*?cd \"\\\$ROOT\"', new, t, flags=re.DOTALL)
p.write_text(r if r != t else t)
print('OK' if r != t else 'WARNING: not changed')
" && ok "stand.sh исправлен"
else
  ok "stand.sh в порядке (SQL-режим)"
fi

hdr "7/9 Порт $PORT"
PIDS=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $2}' | sort -u || true)
if [ -n "$PIDS" ]; then
  warn "Порт $PORT занят (PID: $PIDS) — освобождаю..."
  echo "$PIDS" | xargs kill -9 2>/dev/null || true; sleep 1
  ok "Порт освобождён"
else
  ok "Порт $PORT свободен"
fi

hdr "8/9 Сборка и запуск стенда"
cd "$REPO"
"$STAND" down 2>/dev/null || true
echo "  → UI: сборка..."
(cd "$REPO/apps/web" && { [ -d node_modules ] || npm ci --no-audit --no-fund; } && npx vite build --outDir "$API_DIR/wwwroot" --emptyOutDir) \
  && ok "UI собран" || die "UI не собрался"
echo "  → API: сборка..."
rm -rf "$API_DIR/bin" "$API_DIR/obj"
(cd "$REPO" && dotnet build "$API_DIR" -c Release -v quiet --nologo) \
  && ok "API собран" || die "API не собрался"
echo "  → Запуск..."
mkdir -p "$RUN"
cd "$API_DIR"
if command -v setsid >/dev/null; then NS=(setsid); else NS=(perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' --); fi
DataSource=Sql Sql__IsTestEnvironment=true ASPNETCORE_ENVIRONMENT=Development \
  DevAuth__Enabled=true DevAuth__Username=admin DevAuth__Password=mes \
  "${NS[@]}" nohup dotnet run --no-build -c Release --no-launch-profile --urls "$URL" \
  > "$RUN/stand.log" 2>&1 < /dev/null &
echo $! > "$RUN/pid"
cd "$REPO"
echo "  → Ожидание (до 60 сек)..."
READY=0
for i in $(seq 1 60); do curl -fsS -o /dev/null "$URL/api/v1/health/live" 2>/dev/null && READY=1 && break; printf "."; sleep 1; done
echo ""
[ "$READY" -eq 1 ] && ok "Стенд запущен" || { err "Не поднялся"; tail -30 "$RUN/stand.log"; die "Лог: $RUN/stand.log"; }

hdr "9/9 Smoke-тест"
FAILS=0
JAR=$(mktemp); trap 'rm -f "$JAR"' EXIT
chk() { local d="$1" e="$2"; shift 2; local g; g=$(curl -s -o /dev/null -w '%{http_code}' "$@"); [ "$e" = "$g" ] && ok "$d" || { err "$d (ожидали $e, получили $g)"; FAILS=$((FAILS+1)); }; }
chk "health → 200"         200 "$URL/api/v1/health/live"
chk "план без входа → 401"  401 "$URL/api/v1/production-plan"
chk "вход admin/mes → 200"   200 -c "$JAR" -H 'Content-Type: application/json' -d '{"username":"admin","password":"mes"}' "$URL/api/v1/dev-auth/login"
chk "план → 200"             200 -b "$JAR" "$URL/api/v1/production-plan?page=1&pageSize=25"
chk "NCP → 200"              200 -b "$JAR" "$URL/api/v1/ncp?page=1&pageSize=25"
chk "UI → 200"               200 "$URL/"
ROWS=$(curl -s -b "$JAR" "$URL/api/v1/production-plan?page=1&pageSize=25" 2>/dev/null | grep -o '"vin"' | wc -l | tr -d ' ')
[ "${ROWS:-0}" -gt 0 ] && ok "Данные: $ROWS записей" || { err "План пуст"; FAILS=$((FAILS+1)); }

hr
if [ "$FAILS" -eq 0 ]; then
  echo -e "${G}"
  echo '╔══════════════════════════════════════════════╗'
  echo '║   СТЕНД ГОТОВ! ВСЁ РАБОТАЕТ                   ║'
  echo '╚══════════════════════════════════════════════╝'
  echo -e "${N}"
  echo -e "  ${B}$URL${N}   логин: admin   пароль: mes"
  echo "  Лог: $RUN/stand.log"
else
  echo -e "${Y}"
  echo '╔══════════════════════════════════════════════╗'
  echo '║   ЕСТЬ ПРОБЛЕМЫ — СМОТРИ ЛОГ НИЖЕ               ║'
  echo '╚══════════════════════════════════════════════╝'
  echo -e "${N}"
  echo "  Провалено: $FAILS  |  Лог: $RUN/stand.log"
  tail -20 "$RUN/stand.log" 2>/dev/null || true
fi
read -p $'\nНажми Enter чтобы закрыть...' _
