#!/bin/bash
# Run the parity harness in the official Playwright image.
#   ./parity.sh record oracle             # capture the reference from the app on :8080
#   CATALOG_URL=http://host.docker.internal:8090 ./parity.sh replay candidate
#                                         # capture a candidate build (same data:
#                                         # copy out/oracle/data.har to out/candidate/ first)
#   ./parity.sh compare oracle candidate  # report differences
# Env: SCENARIOS=keys (keyboard scenarios), ONLY_SERIES=a,b  SHEETS_PER_SERIES=n
#      WORKERS=n (parallel browser contexts, replay only)
set -e
cd "$(dirname "$0")"
docker run --rm --init --ipc=host \
  -v "$PWD":/work -w /work \
  -e SHEETS_PER_SERIES -e ONLY_SERIES -e CATALOG_URL -e SCENARIOS -e WORKERS -e MAX_REPORT \
  mcr.microsoft.com/playwright:v1.48.2-jammy \
  bash -c "npm install --no-audit --no-fund --silent >/dev/null && \
    if [ '$1' = compare ]; then node compare.mjs out/$2 out/$3; else node parity.mjs $1 out/$2; fi"
