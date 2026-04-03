#!/usr/bin/env bash
# install-gateway.sh — Verify Node.js prerequisites for Naia Agent
# Safe to run multiple times (idempotent).
# Usage: bash install-gateway.sh
#
# Note: Naia Agent (TypeScript) is the built-in runtime — no additional
# gateway installation is required. OpenClaw is an optional external gateway
# that can be connected via Settings → Gateway URL.

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Paths ─────────────────────────────────────────────────────────────────────
CONFIG_DIR="$HOME/.openclaw"           # backward-compat path (kept for existing installs)
WORKSPACE_DIR="$CONFIG_DIR/workspace"
REQUIRED_NODE_MAJOR=22
GATEWAY_PORT=18789

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; }
step()    { echo -e "\n${CYAN}${BOLD}── $* ──${RESET}"; }

die() {
    error "$*"
    exit 1
}

# ── Step 1: Check Node.js ────────────────────────────────────────────────────
step "Step 1/2: Checking Node.js"

NODE_CMD=""

check_node_version() {
    local cmd="$1"
    if ! command -v "$cmd" &>/dev/null; then
        return 1
    fi
    local version
    version=$("$cmd" --version 2>/dev/null | sed 's/^v//')
    local major
    major=$(echo "$version" | cut -d. -f1)
    if [[ "$major" -ge "$REQUIRED_NODE_MAJOR" ]]; then
        NODE_CMD="$cmd"
        return 0
    fi
    return 1
}

# Find nvm.sh in common locations
find_nvm() {
    for nvm_path in "$HOME/.nvm/nvm.sh" "$HOME/.config/nvm/nvm.sh" "${NVM_DIR:-}/nvm.sh"; do
        if [[ -s "$nvm_path" ]]; then
            echo "$nvm_path"
            return 0
        fi
    done
    return 1
}

# Try system node first
if check_node_version "node"; then
    success "Found Node.js $(node --version) (system)"
# Try nvm if available
elif NVM_SH=$(find_nvm); then
    info "System Node.js too old ($(node --version 2>/dev/null || echo 'not found')). Trying nvm..."
    # shellcheck source=/dev/null
    source "$NVM_SH"
    if nvm use "$REQUIRED_NODE_MAJOR" &>/dev/null && check_node_version "node"; then
        success "Found Node.js $(node --version) (nvm)"
    else
        info "Installing Node.js $REQUIRED_NODE_MAJOR via nvm..."
        nvm install "$REQUIRED_NODE_MAJOR" || die "Failed to install Node.js $REQUIRED_NODE_MAJOR via nvm"
        nvm use "$REQUIRED_NODE_MAJOR"
        if check_node_version "node"; then
            success "Installed Node.js $(node --version) via nvm"
        else
            die "nvm install succeeded but Node.js $REQUIRED_NODE_MAJOR+ not available"
        fi
    fi
else
    echo ""
    error "Node.js $REQUIRED_NODE_MAJOR+ is required but not found."
    echo ""
    echo -e "  Install Node.js using one of these methods:"
    echo ""
    echo -e "  ${BOLD}Option 1: nvm (recommended)${RESET}"
    echo -e "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
    echo -e "    source ~/.bashrc"
    echo -e "    nvm install $REQUIRED_NODE_MAJOR"
    echo -e "    bash $0"
    echo ""
    echo -e "  ${BOLD}Option 2: NodeSource (Debian/Ubuntu)${RESET}"
    echo -e "    curl -fsSL https://deb.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x | sudo -E bash -"
    echo -e "    sudo apt-get install -y nodejs"
    echo ""
    echo -e "  ${BOLD}Option 3: Fedora/RHEL${RESET}"
    echo -e "    sudo dnf install -y nodejs"
    echo ""
    exit 1
fi

# ── Step 2: Ensure workspace directory exists ────────────────────────────────
step "Step 2/2: Setting up workspace directory"

mkdir -p "$WORKSPACE_DIR"
success "Workspace: $WORKSPACE_DIR"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}============================================${RESET}"
echo -e "${GREEN}${BOLD}  Naia Agent prerequisites verified!    ${RESET}"
echo -e "${GREEN}${BOLD}============================================${RESET}"
echo ""
echo -e "  ${BOLD}Naia Agent is built into Naia Shell — no separate installation needed.${RESET}"
echo -e "  Simply launch Naia Shell and the agent starts automatically."
echo ""
echo -e "  ${BOLD}Optional: connect an external OpenClaw gateway${RESET}"
echo -e "    1. Install OpenClaw separately (see https://github.com/nextain/naia-os)"
echo -e "    2. Start it on port $GATEWAY_PORT:"
echo -e "       ${CYAN}openclaw gateway run --bind loopback --port $GATEWAY_PORT${RESET}"
echo -e "    3. In Naia Shell → Settings → set Gateway URL:"
echo -e "       ${CYAN}http://127.0.0.1:$GATEWAY_PORT${RESET}"
echo ""
echo -e "  ${BOLD}To verify an external gateway is running:${RESET}"
echo ""
echo -e "    ${CYAN}curl -s http://127.0.0.1:$GATEWAY_PORT/__openclaw__/canvas/${RESET}"
echo ""
