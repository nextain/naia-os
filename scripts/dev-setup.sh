#!/bin/bash
# Dev environment setup for Naia OS (Ubuntu distrobox / container)
# Run this once after creating the dev container.
#
# Usage: bash scripts/dev-setup.sh

set -euo pipefail

echo "[dev-setup] Installing build dependencies..."

# Detect package manager
if command -v apt-get &>/dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y --no-install-recommends \
        build-essential \
        libwebkit2gtk-4.1-dev \
        libgtk-3-dev \
        libayatana-appindicator3-dev \
        librsvg2-dev \
        libssl-dev \
        pkg-config \
        pipewire-alsa \
        libasound2-dev
elif command -v dnf &>/dev/null; then
    sudo dnf install -y \
        webkit2gtk4.1-devel \
        gtk3-devel \
        libappindicator-gtk3-devel \
        librsvg2-devel \
        openssl-devel \
        pipewire-alsa \
        alsa-lib-devel
else
    echo "[dev-setup] Error: unsupported package manager"
    exit 1
fi

echo "[dev-setup] Verifying PipeWire ALSA bridge..."
if [ -f /usr/lib/x86_64-linux-gnu/alsa-lib/libasound_module_pcm_pipewire.so ] || \
   [ -f /usr/lib64/alsa-lib/libasound_module_pcm_pipewire.so ]; then
    echo "[dev-setup] ✓ PipeWire ALSA plugin found"
else
    echo "[dev-setup] ✗ PipeWire ALSA plugin not found — STT mic may not work"
fi

echo "[dev-setup] ✓ Dev environment ready"
