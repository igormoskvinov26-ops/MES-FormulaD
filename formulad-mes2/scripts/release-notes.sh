#!/usr/bin/env bash
# Печатает раздел CHANGELOG.md для версии:  scripts/release-notes.sh 0.2.0
set -euo pipefail
VER="${1:?укажите версию, например 0.2.0}"
awk -v ver="$VER" '
  $0 ~ "^## \\[" ver "\\]" { on=1; next }
  on && /^## \[/ { exit }
  on { print }
' CHANGELOG.md | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}'
