#!/usr/bin/env bash
# Ищет пароли и ключи в ДОБАВЛЕННЫХ строках диффа (старые строки истории не проверяются).
#   scripts/check-secrets.sh <база>      например: scripts/check-secrets.sh origin/main
# Заглушки не считаются секретом: CHANGE_ME, <...>, $(...), ${...}, ***, example. Осознанное исключение — пометка check-secrets:ignore в строке.
set -euo pipefail
BASE="${1:-origin/main}"
RANGE="$(git merge-base "$BASE" HEAD 2>/dev/null || echo "$BASE")..HEAD"

# А: строка подключения «Password=значение»; Б: присваивание длинного строкового литерала паролю/ключу/токену.
PATTERN_CONN='(password|pwd)=[^;"'"'"'[:space:]<{$(*]{6,}'
PATTERN_LITERAL='(password|passwd|pwd|secret|api[_-]?key|token)[A-Za-z_]*[[:space:]]*[=:][[:space:]]*N?["'"'"'][^"'"'"']{8,}["'"'"']'
# Заглушки и осознанные исключения: строка с меткой check-secrets:ignore пропускается.
ALLOW='CHANGE_ME|="\$[A-Za-z_]|<[^>]+>|\$\(|\$\{|\*\*\*|example|placeholder|process\.env|environment|user-secrets|check-secrets:ignore'
hits="$(git diff --unified=0 --no-color "$RANGE" -- . ':(exclude)scripts/check-secrets.sh' \
  | grep -E '^\+[^+]' | grep -Eiv "$ALLOW" \
  | grep -Ei -e "$PATTERN_CONN" -e "$PATTERN_LITERAL" || true)"
if [ -n "$hits" ]; then
  echo "Похоже на секрет в добавленных строках (проверьте, при необходимости замените заглушкой):" >&2
  echo "$hits" | cut -c1-160 >&2
  exit 1
fi
echo "Секретов в добавленных строках не найдено ($RANGE)"
