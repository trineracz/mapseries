#!/bin/bash
# UI tests of the template editor (template-form.js) and of "+ přidat do šablony".
#   ./editor-tests.sh roundtrip   # all templates: rewriting keeps the text (node, no app needed)
#   ./editor-tests.sh form        # editor page: layout (save bar, no sideways scroll), swap animation
#   ./editor-tests.sh e2e         # catalogue on :8080 -> addition -> editor page gets the row
#   SESSION=<JSESSIONID> ./editor-tests.sh real   # the real admin page (app with MAPSERIES_EDITOR_DRY_RUN=true!)
# Needs: ../../../mapseries-data with remote "upstream" (templates, geojson), the app on :8080
# for form/e2e (assets, /api/authorities), python3 with bs4. Output: out/ (screenshots, texts).
set -e
cd "$(dirname "$0")"
REPO="$(cd ../../.. && pwd)"; DATA="$REPO/../mapseries-data"; GRID=${GRID:-evropa-deutsche-heereskarte-1200-000}
mkdir -p out/tpl
for f in $(git -C "$DATA" ls-tree --name-only upstream/master template/); do
  git -C "$DATA" show "upstream/master:$f" > "out/tpl/$(basename "$f")"; done
cp "out/tpl/$GRID.txt" out/t.txt
git -C "$DATA" show "upstream/master:geojson/$GRID.json" > out/g.json
if [ "$1" = roundtrip ]; then
  exec node roundtrip.cjs "$REPO/index-boot/src/main/resources/static/assets/series-editor/template-form.js" out/tpl
fi
python3 render.py "$GRID" out/index.html
docker run --rm --ipc=host -e SESSION -e GRID -v "$PWD/..":/work -v "$REPO":/src:ro -w /work \
  mcr.microsoft.com/playwright:v1.48.2-jammy bash -c "npm install --silent >/dev/null && node editor/$1.mjs"
