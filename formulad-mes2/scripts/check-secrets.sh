#!/usr/bin/env bash
# T-006: Scan repository for leaked secrets.
# Runs in CI (ci.yml, secrets-scan job). Exit 1 if secrets found.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FOUND=0

# 1. Passwords in SQL files (except placeholders)
while IFS= read -r match; do
  # skip placeholder patterns: <ЗАДАЙТЕ_ПАРОЛЬ>, CHANGE_ME, etc.
  echo "$match" | grep -qiE '<[А-Яа-яA-Za-z_]+>' && continue
  echo "$match" | grep -qiE "CHANGE_ME" && continue
  echo "::error::Secret in SQL: $match"
  FOUND=1
done < <(grep -rnE "PASSWORD\s*=\s*N?'[^<][^']{4,}'" sql/ --include='*.sql' 2>/dev/null || true)

# 2. Connection strings with inline passwords in app source code
#    Excluded: tests/ (test doubles use dummy passwords), deploy/*.example.* (templates),
#    docker/, stand/ (test infra with intentional test passwords)
while IFS= read -r match; do
  echo "$match" | grep -qiE '<[А-Яа-яA-Za-z_]+>' && continue
  echo "$match" | grep -qiE 'CHANGE_ME' && continue
  echo "$match" | grep -qE '^(docker/|stand/|tests/)' && continue
  echo "$match" | grep -qE '\.example\.' && continue
  echo "::error::Inline password in config: $match"
  FOUND=1
done < <(grep -rnE 'Password=[^<][^;]{4,}' --include='*.json' --include='*.cs' --include='*.yml' --include='*.yaml' --include='*.xml' \
  src/ apps/ tests/ deploy/ 2>/dev/null || true)

# 3. API keys / tokens (common patterns)
while IFS= read -r match; do
  echo "::error::Possible API key: $match"
  FOUND=1
done < <(grep -rnE '(sk-|ghp_|gho_|AKIA)[A-Za-z0-9]{16,}' --include='*.cs' --include='*.ts' --include='*.tsx' --include='*.json' --include='*.env' \
  src/ apps/ tests/ 2>/dev/null || true)

if [ "$FOUND" -eq 0 ]; then
  echo "No secrets found."
else
  echo "::error::Secret scan failed — see errors above"
  exit 1
fi
