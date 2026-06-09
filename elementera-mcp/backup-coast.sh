#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p backups

stamp="$(date +%Y%m%d-%H%M%S)"
file="backups/elementera-coast-$stamp.tgz"

tar \
  --exclude='./node_modules' \
  --exclude='./.git' \
  --exclude='./.env' \
  --exclude='./.envv' \
  --exclude='./backups' \
  -czf "$file" .

echo "Backup created: $file"
ls -lh "$file"
