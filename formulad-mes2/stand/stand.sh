#!/usr/bin/env bash
# Тестовый стенд FormulaD MES: API + собранный UI на базе FormulaD_TEST (Docker).
# Требует запущенный Docker-контейнер с SQL Server и базой FormulaD_TEST (см. docker/README.md).
#
#   ./stand/stand.sh up       сборка UI и API, запуск, ожидание готовности, печать входа
#   ./stand/stand.sh smoke    быстрая проверка живого стенда (health, 401 без входа, вход, данные, статика)
#   ./stand/stand.sh status   работает ли стенд и по какому адресу
#   ./stand/stand.sh down     остановка
#
# Переменные: PORT (по умолчанию 5080), STAND_USER (demo-operator), STAND_PASSWORD (иначе случайный).
# SQL: Sql__ConnectionString — обязательна (задайте через переменную среды или .env).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/stand/.run"
PORT="${PORT:-5080}"
URL="http://localhost:$PORT"
# На macOS нет утилиты setsid — запасной вариант через perl (есть и на macOS, и на Linux).
if command -v setsid >/dev/null; then NEWSESSION=(setsid); else NEWSESSION=(perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' --); fi
USER_NAME="${STAND_USER:-demo-operator}"
API_DIR="$ROOT/src/FormulaD.Mes.Api"

need() { command -v "$1" >/dev/null || { echo "Не найден '$1' — установите (см. README, раздел «Требования»)" >&2; exit 1; }; }
is_up() { curl -fsS -o /dev/null "$URL/api/v1/health/live" 2>/dev/null; }

up() {
  need dotnet; need node; need npm; need curl
  mkdir -p "$RUN"
  if is_up; then echo "Стенд уже запущен: $URL"; return; fi

  if [ -z "${Sql__ConnectionString:-}" ]; then
    echo "Не задана Sql__ConnectionString. Пример:" >&2
    echo '  Sql__ConnectionString="Server=localhost,1433;Database=FormulaD_TEST;User ID=mes_reader;Password=...;TrustServerCertificate=True" ./stand/stand.sh up' >&2
    exit 1
  fi

  echo "▸ UI: сборка"
  (cd "$ROOT/apps/web" && { [ -d node_modules ] || npm ci --no-audit --no-fund; } \
    && npx vite build --outDir "$API_DIR/wwwroot" --emptyOutDir >/dev/null)

  echo "▸ API: сборка (Release)"
  (cd "$ROOT" && dotnet build "$API_DIR" -c Release -v quiet --nologo >/dev/null)

  local password="${STAND_PASSWORD:-$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | head -c 20)}"
  printf '%s\n%s\n' "$USER_NAME" "$password" > "$RUN/credentials"
  chmod 600 "$RUN/credentials"

  echo "▸ Запуск на $URL (SQL: FormulaD_TEST)"
  # `&` стоит на самой команде: так $! — это сам dotnet (лидер новой группы, её и гасит down),
  # а канал вывода вызывающего не удерживается.
  cd "$API_DIR"
  ASPNETCORE_ENVIRONMENT=Development \
    DevAuth__Enabled=true DevAuth__Username="$USER_NAME" DevAuth__Password="$password" \
    "${NEWSESSION[@]}" nohup dotnet run --no-build -c Release --no-launch-profile --urls "$URL" \
    > "$RUN/stand.log" 2>&1 < /dev/null &
  echo $! > "$RUN/pid"
  cd "$ROOT"

  for _ in $(seq 1 40); do is_up && break; sleep 1; done
  is_up || { echo "Стенд не поднялся за 40 с, лог: $RUN/stand.log" >&2; tail -n 20 "$RUN/stand.log" >&2; exit 1; }

  echo
  echo "Стенд готов:  $URL"
  echo "  логин:      $USER_NAME"
  echo "  пароль:     $password   (также в $RUN/credentials, в git не попадает)"
  echo "  лог:        $RUN/stand.log"
  echo "  проверка:   ./stand/stand.sh smoke   |   остановка: ./stand/stand.sh down"
}

down() {
  if [ -f "$RUN/pid" ]; then
    local pid; pid="$(cat "$RUN/pid")"
    # setsid сделал процесс лидером группы — гасим всю группу (dotnet run + дочерний API).
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    rm -f "$RUN/pid"
  fi
  echo "Стенд остановлен"
}

status() { if is_up; then echo "работает: $URL"; else echo "не запущен"; exit 1; fi; }

smoke() {
  need curl
  is_up || { echo "Стенд не запущен — сначала: ./stand/stand.sh up" >&2; exit 1; }
  [ -f "$RUN/credentials" ] || { echo "Нет $RUN/credentials — стенд поднят не этим скриптом" >&2; exit 1; }
  local user password jar fails=0
  user="$(sed -n 1p "$RUN/credentials")"; password="$(sed -n 2p "$RUN/credentials")"
  jar="$(mktemp)"; trap 'rm -f "$jar"' RETURN

  check() { # описание, ожидаемый код, фактический код
    if [ "$2" = "$3" ]; then echo "  ✓ $1"; else echo "  ✗ $1 (ожидали $2, получили $3)"; fails=$((fails+1)); fi
  }
  code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

  echo "Проверка стенда $URL"
  check "health/live"                         200 "$(code "$URL/api/v1/health/live")"
  check "план без входа закрыт (401)"         401 "$(code "$URL/api/v1/production-plan")"
  check "вход"                                200 "$(code -c "$jar" -H 'Content-Type: application/json' \
        -d "{\"username\":\"$user\",\"password\":\"$password\"}" "$URL/api/v1/dev-auth/login")"
  check "неверный пароль отклонён (401)"      401 "$(code -H 'Content-Type: application/json' \
        -d "{\"username\":\"$user\",\"password\":\"wrong\"}" "$URL/api/v1/dev-auth/login")"
  check "производственный план"               200 "$(code -b "$jar" "$URL/api/v1/production-plan?page=1&pageSize=25")"
  check "несоответствия (NCP)"                200 "$(code -b "$jar" "$URL/api/v1/ncp?page=1&pageSize=25")"
  check "изделие по VIN"                      200 "$(code -b "$jar" "$URL/api/v1/production-plan/DEMO-VIN-00001")"
  check "UI (index.html)"                     200 "$(code "$URL/")"
  check "статика: логотип"                    200 "$(code "$URL/f7-logo.png")"
  check "статика: квадроцикл"                 200 "$(code "$URL/atv-hero.png")"

  local rows
  rows="$(curl -s -b "$jar" "$URL/api/v1/production-plan?page=1&pageSize=25" | grep -o '"vin"' | wc -l | tr -d ' ')"
  [ "$rows" -gt 0 ] && echo "  ✓ записей в плане: $rows" || { echo "  ✗ план пуст"; fails=$((fails+1)); }

  [ "$fails" -eq 0 ] && echo "Итог: всё в порядке" || { echo "Итог: провалено проверок — $fails" >&2; return 1; }
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  status) status ;;
  smoke) smoke ;;
  *) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
