#!/usr/bin/env bash
# Builds the whole site into ./site (docs at /, lab at /lab, wiki at /wiki, data at /data).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
rm -rf site && mkdir -p site
STRICT=1 node scripts/build-data.mjs dist
(cd apps/docs && npm ci && npm run build)
cp -R apps/docs/out/. site/
(cd apps/lab && npm ci && npm run build)
mkdir -p site/lab && cp -R apps/lab/dist/. site/lab/
mkdir -p site/wiki && cp apps/wiki/index.html site/wiki/index.html
mkdir -p site/data && cp -R dist/. site/data/
mkdir -p site/schema && cp schema/*.json site/schema/
mkdir -p site/brand && cp brand/* site/brand/
cp brand/favicon.ico site/favicon.ico 2>/dev/null || true
echo "platformontology.lol" > site/CNAME
touch site/.nojekyll
echo "site built: $(find site -type f | wc -l) files"
