#!/usr/bin/env bash
# Publishes ./site to the gh-pages branch (used when GitHub Actions cannot run).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/build-site.sh"
TMP="$(mktemp -d)"; cp -R "$ROOT/site/." "$TMP/"
# The built catalog and docs name trackers and fingerprinting repos (no credentials); allowlist it for the secret scan.
printf "[extend]\nuseDefault = true\n[allowlist]\npaths = ['''^console/data/''', '''^data/''', '''^docs/capabilities/''', '''^wiki/index\\.html''']\n" > "$TMP/.gitleaks.toml"
cd "$TMP" && git init -q -b gh-pages && git add -A && git commit -q -m "Built site"
git push -q -f "$(git -C "$ROOT" remote get-url origin)" gh-pages
echo "pushed gh-pages"
