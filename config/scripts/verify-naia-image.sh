#!/usr/bin/env bash
# Thin wrapper — the verifier itself ships inside the image at
# /usr/libexec/naia-verify-image so the same predicate can be re-run against the
# published container and, later, against an installed machine. One copy of the
# logic, two callers.
set -euo pipefail

VERIFIER=/usr/libexec/naia-verify-image
if [ ! -x "$VERIFIER" ]; then
    echo "[verify] FATAL: $VERIFIER missing — the files module did not run before this script" >&2
    exit 1
fi
exec "$VERIFIER"
