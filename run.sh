#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Find tsx or use npx
if command -v tsx &> /dev/null; then
  exec tsx "$DIR/src/index.ts" "$@"
elif command -v npx &> /dev/null; then
  exec npx tsx "$DIR/src/index.ts" "$@"
else
  echo "Error: tsx not found. Install with: npm install -g tsx" >&2
  exit 1
fi