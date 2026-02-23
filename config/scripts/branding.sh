#!/usr/bin/env bash
set -euo pipefail

# Preserve base OS VERSION_ID for rpm-ostree/dnf compatibility
# (GPG key paths use $releasever which comes from VERSION_ID)
BASE_VERSION_ID=$(grep -oP '(?<=^VERSION_ID=).*' /usr/lib/os-release | tr -d '"')

# Override os-release to identify as Naia OS
cat > /usr/lib/os-release <<OSRELEASE
NAME="Naia OS"
PRETTY_NAME="Naia OS 0.1.0 (Bazzite)"
ID=naia-os
ID_LIKE="fedora"
VERSION_ID="${BASE_VERSION_ID}"
NAIA_VERSION="0.1.0"
HOME_URL="https://naia.nextain.io"
DOCUMENTATION_URL="https://naia.nextain.io"
SUPPORT_URL="https://naia.nextain.io"
BUG_REPORT_URL="https://github.com/nextain/naia-os/issues"
VARIANT="Naia"
VARIANT_ID=naia
OSRELEASE

# Set fcitx5 as default virtual keyboard for Korean input
# KDE Plasma (Bazzite base) virtual keyboard config
mkdir -p /usr/etc/skel/.config
cat > /usr/etc/skel/.config/fcitx5-profile <<'FCITX'
[Groups/0]
Name=Default
Default Layout=us
DefaultIM=hangul

[Groups/0/Items/0]
Name=keyboard-us
Layout=

[Groups/0/Items/1]
Name=hangul
Layout=

[GroupOrder]
0=Default
FCITX

# Set fcitx5 as the virtual keyboard in KDE Plasma Wayland
mkdir -p /usr/etc/skel/.config
cat > /usr/etc/skel/.config/kwinrc-naia-ime <<'KWIN'
[Wayland]
InputMethod=/usr/share/applications/org.fcitx.Fcitx5.wayland.desktop
KWIN

# Ensure fcitx5-wayland .desktop file is available for virtual keyboard selection
if [ -f /usr/share/applications/org.fcitx.Fcitx5.wayland.desktop ]; then
    echo "fcitx5-wayland desktop entry found"
else
    # Create desktop entry if package didn't provide one
    cat > /usr/share/applications/org.fcitx.Fcitx5.wayland.desktop <<'DESKTOP'
[Desktop Entry]
Name=Fcitx 5 (Wayland)
Comment=Input Method
Exec=/usr/bin/fcitx5
Icon=org.fcitx.Fcitx5
Type=Application
Categories=System;Utility;
X-KDE-Wayland-VirtualKeyboard=true
DESKTOP
fi
