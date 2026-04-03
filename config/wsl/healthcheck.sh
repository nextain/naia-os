#!/bin/bash
# NaiaEnv health check — verifies Gateway prerequisites are available

set -e

echo "=== NaiaEnv Health Check ==="

# Node.js
if command -v node &>/dev/null; then
    echo "[OK] Node.js $(node -v)"
else
    echo "[FAIL] Node.js not found"
    exit 1
fi

# Naia Gateway
GATEWAY_MJS="/opt/naia/openclaw/node_modules/openclaw/openclaw.mjs"
if [ -f "$GATEWAY_MJS" ]; then
    echo "[OK] Naia Gateway found at $GATEWAY_MJS"
else
    echo "[FAIL] Naia Gateway not found at $GATEWAY_MJS"
    exit 1
fi

# Network — check if localhost is reachable from WSL
if curl -sf --max-time 2 http://127.0.0.1:18789/__openclaw__/canvas/ &>/dev/null; then
    echo "[OK] Gateway already running on port 18789"
else
    echo "[INFO] Gateway not running (will be started by Naia Shell)"
fi

echo "=== Health Check Complete ==="
