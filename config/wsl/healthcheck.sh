#!/bin/bash
# NaiaEnv health check — verifies Naia Agent prerequisites are available

set -e

echo "=== NaiaEnv Health Check ==="

# Node.js
if command -v node &>/dev/null; then
    echo "[OK] Node.js $(node -v)"
else
    echo "[FAIL] Node.js not found"
    exit 1
fi

# Network — check if an optional external gateway is running on port 18789
# (/__openclaw__/canvas/ endpoint is backward-compatible with OpenClaw-based gateways)
if curl -sf --max-time 2 http://127.0.0.1:18789/__openclaw__/canvas/ &>/dev/null; then
    echo "[OK] External gateway already running on port 18789"
else
    echo "[INFO] No external gateway running (Naia Agent built into Naia Shell — this is normal)"
fi

echo "=== Health Check Complete ==="
