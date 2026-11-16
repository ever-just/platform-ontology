#!/usr/bin/env bash
# Builds the whole site into ./site (docs at /, console at /console, wiki at /wiki, data at /data).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
rm -rf site && mkdir -p site
STRICT=1 node scripts/build-data.mjs dist
(cd apps/docs && npm ci && npm run build)
cp -R apps/docs/out/. site/
node apps/console/scripts/gen-console-data.mjs >/dev/null
(cd apps/console && npm ci && npm run build)
mkdir -p site/console && cp -R apps/console/dist/. site/console/
# The old lab now points at the console.
mkdir -p site/lab && printf '%s\n' '<!doctype html><meta charset="utf-8"><title>Platform.Ontology Console</title><script>location.replace("/console/"+location.hash)</script><meta http-equiv="refresh" content="0;url=/console/"><a href="/console/">Open the console</a>' > site/lab/index.html
mkdir -p site/wiki && cp apps/wiki/index.html site/wiki/index.html
mkdir -p site/data && cp -R dist/. site/data/
mkdir -p site/schema && cp schema/*.json site/schema/
mkdir -p site/brand && cp brand/* site/brand/
cp brand/favicon.ico site/favicon.ico 2>/dev/null || true
touch site/.nojekyll
echo "site built: $(find site -type f | wc -l) files"
