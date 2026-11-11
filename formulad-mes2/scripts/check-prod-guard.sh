#!/usr/bin/env bash
# T-007: Guard against PROD connection strings in the repository.
# Fails if code or config references the production database directly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FOUND=0

# 1. Direct PROD connection: Server=SQLACCESS with Database=FormulaD (not FormulaD_TEST)
#    Excluded: tests/ (tests may reference PROD strings to verify behavior)
while IFS= read -r match; do
  echo "$match" | grep -qiE 'FormulaD_TEST' && continue
  echo "$match" | grep -qE '^\s*(//|#|--|/?\*|\*|>|Пример)' && continue
  echo "::error::PROD connection string found: $match"
  FOUND=1
done < <(grep -rnE 'Server\s*=\s*SQLACCESS.*Database\s*=\s*FormulaD[^_]' \
  --include='*.cs' --include='*.json' --include='*.yml' --include='*.yaml' --include='*.xml' --include='*.sh' \
  src/ apps/ deploy/ 2>/dev/null || true)

# 2. PROD database name in appsettings (not test)
while IFS= read -r match; do
  echo "$match" | grep -qiE 'FormulaD_TEST' && continue
  echo "::error::PROD database in appsettings: $match"
  FOUND=1
done < <(grep -rnE 'Database=FormulaD[^_T]' src/FormulaD.Mes.Api/appsettings*.json 2>/dev/null || true)

# 3. sa/sa1 logins in connection strings (outside docs/sql/tests)
while IFS= read -r match; do
  echo "::error::Privileged login in config: $match"
  FOUND=1
done < <(grep -rnE 'User\s+ID\s*=\s*sa[1]?\s*;' \
  --include='*.cs' --include='*.json' --include='*.yml' --include='*.yaml' \
  src/ apps/ deploy/ 2>/dev/null || true)

if [ "$FOUND" -eq 0 ]; then
  echo "PROD guard passed."
else
  echo "::error::PROD guard failed — see errors above"
  exit 1
fi
