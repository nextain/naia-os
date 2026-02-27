#!/usr/bin/env bash
set -euo pipefail

# Download Naia Shell Flatpak bundle from GitHub Releases.
# The bundle is stored in the image and installed:
#   - On first boot: by naia-flatpak-install.service
#   - On live ISO: by hook-post-rootfs.sh
#
# This runs during BlueBuild container image build.

REPO="nextain/naia-os"
BUNDLE_DIR="/usr/share/naia"
BUNDLE_PATH="${BUNDLE_DIR}/naia-shell.flatpak"

echo "[naia] Downloading Naia Shell Flatpak bundle..."

CURL_AUTH=()
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  CURL_AUTH=(-H "Authorization: token ${GITHUB_TOKEN}")
fi

# Search all releases (including pre-releases) for the Flatpak asset
DOWNLOAD_URL=$(curl -sfL "${CURL_AUTH[@]+"${CURL_AUTH[@]}"}" \
  "https://api.github.com/repos/${REPO}/releases" \
  | jq -r '[.[] | .assets[] | select(.name == "Naia-Shell-x86_64.flatpak")] | first | .browser_download_url' \
  | head -1)

if [[ -z "${DOWNLOAD_URL}" || "${DOWNLOAD_URL}" == "null" ]]; then
  echo "[naia] ERROR: No Flatpak bundle found in releases."
  echo "[naia] Build and upload first: flatpak-builder + gh release upload"
  exit 1
fi

echo "[naia] Downloading: ${DOWNLOAD_URL}"
mkdir -p "${BUNDLE_DIR}"
curl -fL -o "${BUNDLE_PATH}" "${CURL_AUTH[@]+"${CURL_AUTH[@]}"}" "${DOWNLOAD_URL}"
echo "[naia] Flatpak bundle saved to ${BUNDLE_PATH}"
ls -lh "${BUNDLE_PATH}"

# Create first-boot systemd service as fallback.
# Primary install path: ISO hook-post-rootfs.sh installs for live session,
# Anaconda carries flatpak state to installed OS.
# This service is a safety net — works offline if runtime was already installed.
cat > /usr/lib/systemd/system/naia-flatpak-install.service <<'EOF'
[Unit]
Description=Install Naia Shell Flatpak (fallback)
After=flatpak-system-helper.service
ConditionPathExists=/usr/share/naia/naia-shell.flatpak

[Service]
Type=oneshot
# Try runtime from Flathub (ok to fail offline — already installed from ISO)
ExecStart=-/usr/bin/flatpak install --system --noninteractive flathub org.gnome.Platform//49
# Install from local bundle (works offline if runtime is present)
ExecStart=/usr/bin/flatpak install --system --noninteractive --bundle /usr/share/naia/naia-shell.flatpak
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl enable naia-flatpak-install.service

echo "[naia] First-boot Flatpak install service enabled."
