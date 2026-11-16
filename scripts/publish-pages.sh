#!/usr/bin/env bash
# Publishes ./site to the gh-pages branch (used when GitHub Actions cannot run).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/build-site.sh"
TMP="$(mktemp -d)"; cp -R "$ROOT/site/." "$TMP/"
cd "$TMP" && git init -q -b gh-pages && git add -A && git commit -q -m "Built site"
git push -q -f "$(git -C "$ROOT" remote get-url origin)" gh-pages
echo "pushed gh-pages"
