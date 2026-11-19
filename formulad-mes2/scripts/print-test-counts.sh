#!/usr/bin/env bash
# T-094: print actual test counts for backend and frontend
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Backend (xUnit) ==="
cd "$ROOT"
dotnet test --no-build -q 2>&1 | grep -E "^(Passed|Failed|Skipped|Total|passed|failed)" | tail -5 || \
  dotnet test -q 2>&1 | grep -E "passed|failed|Total" | tail -5

echo ""
echo "=== Frontend (vitest) ==="
cd "$ROOT/apps/web"
npx vitest run --reporter=verbose 2>&1 | grep -E "^(Tests|Test Files)" | tail -3
