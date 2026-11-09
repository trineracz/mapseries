#!/bin/bash
# Tests of the admin editors.
#   ./editor-tests.sh roundtrip                    # all templates: the form rewrites only what changed (node, no app needed)
#   ./editor-tests.sh fields                       # Pole šablony in the form: add/remove/edit whole fields (no app needed)
#   SESSION=<JSESSIONID> ./editor-tests.sh admin   # the admin on the app on :8080 — Mapová díla, Mřížky,
#                                                  # Série, the guide for a new dílo, "+ přidat do šablony",
#                                                  # Uživatelé. Run the app with MAPSERIES_EDITOR_DRY_RUN=true!
# Needs: ../../../mapseries-data with remote "upstream" (roundtrip), python3 not needed. Output: out/.
set -e
cd "$(dirname "$0")"
REPO="$(cd ../../.. && pwd)"; DATA="$REPO/../mapseries-data"
mkdir -p out/tpl
if [ "$1" = roundtrip ]; then
  for f in $(git -C "$DATA" ls-tree --name-only upstream/master template/); do
    git -C "$DATA" show "upstream/master:$f" > "out/tpl/$(basename "$f")"; done
  exec node roundtrip.cjs "$REPO/index-boot/src/main/resources/static/assets/series-editor/template-form.js" out/tpl
fi
if [ "$1" = fields ]; then
  mkdir -p out/fields
  cp fields/index.html "$REPO/index-boot/src/main/resources/static/assets/series-editor/"{template-form.js,editor.css} out/fields/
  for f in evropa-karte-ungarn-175-000 evropa-befestigungskarte-tschechoslowakei-125-000; do
    git -C "$DATA" show "upstream/master:template/$f.txt" > "out/fields/$f.txt"; done
fi
docker run --rm --ipc=host -e SESSION -v "$PWD/..":/work -w /work \
  mcr.microsoft.com/playwright:v1.48.2-jammy bash -c "npm install --silent >/dev/null && node editor/$1.mjs"
