#!/usr/bin/env bash
# hook-post-rootfs.sh — Titanoboa ISO post-rootfs hook
# Runs inside podman --rootfs (the extracted container image IS /)
# /app is titanoboa's own repo, NOT ours — clone naia-os to get assets.
set -euo pipefail

# Branding assets are baked into the image at /usr/share/naia/installer-assets
# by the `files` module. The hook runs inside the extracted container image, so
# they are already on disk. Do not clone a repository here: the previous
# https://github.com/nextain/naia-os.git target is now a tombstone containing
# only README.md, and `cp` under `set -e` would abort the whole ISO build.
SRC="/usr/share/naia"

# ==============================================================================
# 1. Install Anaconda + branding
# ==============================================================================

# Bazzite versionlocks NetworkManager (COPR build) and sets repo-level excludes
# via dnf5 config-manager (repos.override.d). Clear both so anaconda-live can install.
dnf -qy versionlock clear 2>/dev/null || true
rm -f /etc/dnf/repos.override.d/99-config_manager.repo 2>/dev/null || true

# Critical packages (must succeed)
dnf install -y --allowerasing anaconda-live libblockdev-btrfs libblockdev-lvm libblockdev-dm

# Anaconda WebUI (F42+)
mkdir -p /var/lib/rpm-state
dnf install -y anaconda-webui || true

# Optional packages
dnf install -y --allowerasing git firefox || true

# Fallback: if Firefox RPM is unavailable (Bazzite excludes it in favor of
# Flatpak), create a wrapper at /usr/bin/firefox that delegates to the Flatpak.
# Anaconda WebUI hardcodes /usr/bin/firefox in webui-desktop; without this shim
# the installer silently fails with "No such file or directory".
if [ ! -x /usr/bin/firefox ]; then
    echo "[naia] Firefox RPM not available — creating Flatpak wrapper at /usr/bin/firefox"
    cat > /usr/bin/firefox <<'FIREFOXWRAP'
#!/bin/bash
# Bridge /usr/bin/firefox → Flatpak Firefox for Anaconda WebUI compatibility.
# --filesystem grants access to Anaconda's custom Firefox profile directory
# and the cockpit web server socket.
exec flatpak run \
    --filesystem=/run/user \
    --filesystem=/tmp \
    --filesystem=/run/anaconda \
    org.mozilla.firefox "$@"
FIREFOXWRAP
    chmod +x /usr/bin/firefox
fi

if [ ! -d "${SRC}/assets/installer" ]; then
    echo "[naia] FATAL: branding assets missing at ${SRC}/assets/installer." >&2
    echo "[naia] The image was built without the files module payload." >&2
    exit 1
fi

# Branding assets
cp "${SRC}/assets/installer/sidebar-logo.png" /usr/share/anaconda/pixmaps/
cp "${SRC}/assets/installer/sidebar-bg.png" /usr/share/anaconda/pixmaps/
cp "${SRC}/assets/installer/topbar-bg.png" /usr/share/anaconda/pixmaps/
cp "${SRC}/assets/installer/anaconda_header.png" /usr/share/anaconda/pixmaps/
cp "${SRC}/assets/installer/fedora.css" /usr/share/anaconda/pixmaps/

# "Install to Hard Drive" icon — SVG + PNG sizes (KDE prefers PNG over SVG)
cp "${SRC}/assets/installer/anaconda-installer.svg" \
   /usr/share/icons/hicolor/scalable/apps/org.fedoraproject.AnacondaInstaller.svg
if [ -f "${SRC}/assets/installer/anaconda-installer-symbolic.svg" ]; then
    cp "${SRC}/assets/installer/anaconda-installer-symbolic.svg" \
       /usr/share/icons/hicolor/scalable/apps/org.fedoraproject.AnacondaInstaller-symbolic.svg
fi
# Render PNG from SVG for sizes KDE actually uses
for size in 32 48 64 256; do
    dst="/usr/share/icons/hicolor/${size}x${size}/apps/org.fedoraproject.AnacondaInstaller.png"
    mkdir -p "$(dirname "$dst")"
    if command -v rsvg-convert &>/dev/null; then
        rsvg-convert -w "$size" -h "$size" \
            "${SRC}/assets/installer/anaconda-installer.svg" -o "$dst" 2>/dev/null || true
    fi
done

# ==============================================================================
# 2. Anaconda profile
# ==============================================================================

# Anaconda conf.d (always loaded, no profile detection needed)
# fedora-kinoite profile is auto-detected via ID=fedora + VARIANT_ID=kinoite (section 2b)
mkdir -p /etc/anaconda/conf.d
cat > /etc/anaconda/conf.d/naia.conf <<'EOF'
[Bootloader]
efi_dir = fedora

[Storage]
default_scheme = BTRFS
btrfs_compression = zstd:1

[User Interface]
custom_stylesheet = /usr/share/anaconda/pixmaps/fedora.css
hidden_spokes = NetworkSpoke
# Override fedora.conf profile default (slitherer not installed in our image)
webui_web_engine = firefox
EOF

# ==============================================================================
# 2b. os-release override for Anaconda profile detection
#     Anaconda needs ID=fedora + VARIANT_ID=kinoite to detect fedora-kinoite
#     profile chain. branding.sh sets ID=naia-os, so we override here.
#     The installed system gets ID=naia-os from the original container image.
# ==============================================================================

sed -i "s/^VARIANT_ID=.*/VARIANT_ID=kinoite/" /usr/lib/os-release
sed -i "s/^ID=.*/ID=fedora/" /usr/lib/os-release
echo "[naia] os-release: set ID=fedora, VARIANT_ID=kinoite for Anaconda"

# ==============================================================================
# 2c. image-info.json — fix image reference for ostreecontainer
#     BlueBuild bakes Bazzite's values; we need our image URL.
# ==============================================================================

# The image name is per-variant — the NVIDIA build and the AMD build are
# different repositories, and a machine installed from one must not be pointed
# at the other. Each recipe ships its own /usr/share/naia/image-ref, so this
# reads the value instead of hardcoding one and silently sending, say, a BC-250
# to the NVIDIA image for the rest of its life.
NAIA_IMAGE_REF_FILE="/usr/share/naia/image-ref"
if [ ! -f "${NAIA_IMAGE_REF_FILE}" ]; then
    echo "[naia] FATAL: ${NAIA_IMAGE_REF_FILE} missing — the image did not declare which repository it came from." >&2
    exit 1
fi
NAIA_IMAGE="$(tr -d '[:space:]' < "${NAIA_IMAGE_REF_FILE}")"
case "${NAIA_IMAGE}" in
    ghcr.io/*/*) : ;;
    *) echo "[naia] FATAL: implausible image ref '${NAIA_IMAGE}'" >&2; exit 1 ;;
esac
NAIA_IMAGE_NAME="${NAIA_IMAGE##*/}"
echo "[naia] image ref: ${NAIA_IMAGE} (name ${NAIA_IMAGE_NAME})"

IMAGE_INFO="/usr/share/ublue-os/image-info.json"
if [ -f "$IMAGE_INFO" ]; then
    # Read current values and replace
    tmpjson=$(mktemp)
    jq --arg name "${NAIA_IMAGE_NAME}" --arg ref "ostree-image-signed:docker://${NAIA_IMAGE}" '
        .["image-name"] = $name |
        .["image-ref"] = $ref |
        .["image-tag"] = "latest" |
        .["image-branch"] = "latest"
    ' "$IMAGE_INFO" > "$tmpjson" && mv "$tmpjson" "$IMAGE_INFO"
    echo "[naia] image-info.json updated: image-ref → ${NAIA_IMAGE}:latest"

    # The installer reads this back. If the write did not take, the machine
    # would install and then track whatever Bazzite value was baked in.
    got="$(jq -r '."image-ref"' < "$IMAGE_INFO")"
    test "$got" = "ostree-image-signed:docker://${NAIA_IMAGE}" || {
        echo "[naia] FATAL: image-info.json did not take the new ref (got '$got')" >&2
        exit 1
    }
fi

# ==============================================================================
# 2d. ostreecontainer kickstart + post-scripts (原本 titanoboa 패턴)
#     This is the CORE of the installation flow. Without this, Anaconda
#     falls back to rsync (LiveImagePayload) which doesn't handle boot setup.
# ==============================================================================

# Variables from image-info.json (MUST exist — BlueBuild bakes this into the image)
if [ ! -f "$IMAGE_INFO" ]; then
    echo "[naia] FATAL: $IMAGE_INFO not found. Cannot configure ostreecontainer." >&2
    exit 1
fi
imageref="$(jq -r '."image-ref"' < "$IMAGE_INFO")"
imageref="${imageref##*://}"
imagetag="$(jq -r 'if ."image-branch" then ."image-branch" else ."image-tag" end' < "$IMAGE_INFO")"

# Secureboot key (store in persistent path, not /run/ which is tmpfs)
sbkey='https://github.com/ublue-os/akmods/raw/main/certs/public_key.der'
mkdir -p /usr/share/ublue-os
curl -Lo /usr/share/ublue-os/sb_pubkey.der "$sbkey" || echo "[naia] WARNING: secureboot key download failed"

# Default Kickstart — ostreecontainer transport
cat <<EOF >>/usr/share/anaconda/interactive-defaults.ks
ostreecontainer --url=$imageref:$imagetag --transport=containers-storage --no-signature-verification
%include /usr/share/anaconda/post-scripts/install-configure-upgrade.ks
%include /usr/share/anaconda/post-scripts/disable-fedora-flatpak.ks
%include /usr/share/anaconda/post-scripts/install-flatpaks.ks
%include /usr/share/anaconda/post-scripts/flatpak-restore-selinux-labels.ks
%include /usr/share/anaconda/post-scripts/secureboot-enroll-key.ks
EOF
echo "[naia] interactive-defaults.ks: ostreecontainer + post-scripts"

# Post-script: set signed image reference (no network needed)
# bootc switch --transport registry requires network, which may not be available.
# Instead, directly update the ostree origin file (same approach as Bazzite production).
mkdir -p /usr/share/anaconda/post-scripts
cat <<EOF >>/usr/share/anaconda/post-scripts/install-configure-upgrade.ks
%post --erroronfail
sed -i 's|container-image-reference=.*|container-image-reference=ostree-image-signed:docker://$imageref:$imagetag|' /ostree/deploy/default/deploy/*.origin
%end
EOF

# Post-script: enroll secureboot key
cat <<EOF >>/usr/share/anaconda/post-scripts/secureboot-enroll-key.ks
%post --erroronfail --nochroot
set -oue pipefail

readonly ENROLLMENT_PASSWORD="universalblue"
readonly SECUREBOOT_KEY="/usr/share/ublue-os/sb_pubkey.der"

if [[ ! -d "/sys/firmware/efi" ]]; then
	echo "EFI mode not detected. Skipping key enrollment."
	exit 0
fi

if [[ ! -f "\$SECUREBOOT_KEY" ]]; then
	echo "Secure boot key not provided: \$SECUREBOOT_KEY"
	exit 0
fi

SYS_ID="\$(cat /sys/devices/virtual/dmi/id/product_name)"
if [[ ":Jupiter:Galileo:" =~ ":\$SYS_ID:" ]]; then
	echo "Steam Deck hardware detected. Skipping key enrollment."
	exit 0
fi

mokutil --timeout -1 || :
echo -e "\$ENROLLMENT_PASSWORD\n\$ENROLLMENT_PASSWORD" | mokutil --import "\$SECUREBOOT_KEY" || :
%end
EOF

# Post-script: copy flatpaks to installed system (ostree deploy path)
cat <<'EOF' >>/usr/share/anaconda/post-scripts/install-flatpaks.ks
%post --erroronfail --nochroot
deployment="$(ostree rev-parse --repo=/mnt/sysimage/ostree/repo ostree/0/1/0)"
target="/mnt/sysimage/ostree/deploy/default/deploy/$deployment.0/var/lib/"
mkdir -p "$target"
rsync -aAXUHKP /var/lib/flatpak "$target"
%end
EOF

# Post-script: restore SELinux labels on rsync'd flatpak data
cat <<EOF >>/usr/share/anaconda/post-scripts/flatpak-restore-selinux-labels.ks
%post --erroronfail
chcon -R -t var_lib_t /var/lib/flatpak
%end
EOF

# Post-script: disable fedora flatpak repo
cat <<EOF >>/usr/share/anaconda/post-scripts/disable-fedora-flatpak.ks
%post --erroronfail
systemctl disable flatpak-add-fedora-repos.service
%end
EOF

# Anaconda payload config: use flathub
cat <<EOF >>/etc/anaconda/conf.d/anaconda.conf
[Payload]
flatpak_remote = flathub https://dl.flathub.org/repo/
EOF

echo "[naia] ostreecontainer flow configured (kickstart + 5 post-scripts + payload)"

# ==============================================================================
# 3. Anaconda pre-install cleanup wrapper
#    Stop Naia Shell, Naia Gateway, and other runtime processes before
#    Anaconda starts. Cleans up transient files (sockets, PID files, locks).
# ==============================================================================

cat > /usr/libexec/naia-liveinst-wrapper.sh <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail

echo "[naia] Stopping runtime processes before installation..."

# 1. Stop Naia Shell (Flatpak)
pkill -x naia-shell 2>/dev/null || true

# 2. Stop Naia Gateway (Node.js)
pkill -f "naia.*gateway" 2>/dev/null || true

# 3. Clean up transient runtime files
# ~/.openclaw/ is a backward-compat path kept for users who had openclaw installed.
# Naia Agent (built into Naia Shell) no longer requires openclaw as a runtime.
LIVEUSER_HOME="/var/home/liveuser"
rm -rf "${LIVEUSER_HOME}/.openclaw/"*.lock 2>/dev/null || true
rm -rf "${LIVEUSER_HOME}/.openclaw/"*.pid 2>/dev/null || true
rm -rf "${LIVEUSER_HOME}/.openclaw/"*.sock 2>/dev/null || true

# 5. Wait briefly for processes to fully exit
sleep 1

echo "[naia] Cleanup done. Launching Anaconda installer..."
exec /usr/bin/liveinst "$@"
WRAPPER
chmod +x /usr/libexec/naia-liveinst-wrapper.sh

# Override the "Install to Hard Drive" desktop entry to use our wrapper
# Anaconda's liveinst-setup copies it to Desktop; we override the system .desktop
ANACONDA_DESKTOP="/usr/share/applications/org.fedoraproject.AnacondaInstaller.desktop"
if [ -f "$ANACONDA_DESKTOP" ]; then
    sed -i 's|Exec=.*liveinst.*|Exec=/usr/libexec/naia-liveinst-wrapper.sh|' "$ANACONDA_DESKTOP"
fi
# Also check alternative desktop entry location
ANACONDA_DESKTOP2="/usr/share/applications/liveinst.desktop"
if [ -f "$ANACONDA_DESKTOP2" ]; then
    sed -i 's|Exec=.*liveinst.*|Exec=/usr/libexec/naia-liveinst-wrapper.sh|' "$ANACONDA_DESKTOP2"
fi

# Polkit: auto-approve liveuser for pkexec (liveinst needs root elevation)
mkdir -p /etc/polkit-1/rules.d
cat > /etc/polkit-1/rules.d/99-liveinst.rules <<'POLKIT'
polkit.addRule(function(action, subject) {
    if (subject.user == "liveuser") {
        return polkit.Result.YES;
    }
});
POLKIT

# ==============================================================================
# 3g. Plymouth + start-here icon branding
#     Replace Bazzite spinner watermark and set naia Plymouth theme.
#     NOTE: dracut cannot run in podman --rootfs (xattr unsupported) and the
#     live boot initramfs is built before this hook. Plymouth config files
#     are set here; the installed system gets its own initramfs via bootc switch.
# ==============================================================================

echo "[naia] Setting Plymouth theme to 'naia'..."

# Replace Bazzite spinner watermark with Naia text logo
if [ -f "${SRC}/assets/logos/text-mix-naia-logo.png" ]; then
    # Resize to spinner watermark size (~149x43) for compatibility
    if command -v rsvg-convert &>/dev/null || command -v convert &>/dev/null; then
        convert "${SRC}/assets/logos/text-mix-naia-logo.png" \
            -resize 149x43 -background none -gravity center -extent 149x43 \
            /usr/share/plymouth/themes/spinner/watermark.png 2>/dev/null || \
        cp "${SRC}/assets/logos/text-mix-naia-logo.png" \
            /usr/share/plymouth/themes/spinner/watermark.png
    else
        cp "${SRC}/assets/logos/text-mix-naia-logo.png" \
            /usr/share/plymouth/themes/spinner/watermark.png
    fi
    echo "[naia] Replaced spinner watermark with Naia logo"
fi

# Install start-here icon (Kickoff app launcher) to hicolor theme
if [ -f "${SRC}/assets/installer/start-here.svg" ]; then
    cp "${SRC}/assets/installer/start-here.svg" \
        /usr/share/icons/hicolor/scalable/apps/start-here.svg
    for size in 16 22 24 32 48 64 128 256; do
        dst="/usr/share/icons/hicolor/${size}x${size}/apps/start-here.png"
        mkdir -p "$(dirname "$dst")"
        if command -v rsvg-convert &>/dev/null; then
            rsvg-convert -w "$size" -h "$size" \
                "${SRC}/assets/installer/start-here.svg" -o "$dst" 2>/dev/null || true
        elif command -v convert &>/dev/null; then
            convert "${SRC}/assets/installer/start-here.svg" \
                -resize "${size}x${size}" "$dst" 2>/dev/null || true
        fi
    done
    # Rebuild icon cache
    gtk-update-icon-cache -f -t /usr/share/icons/hicolor 2>/dev/null || true
    echo "[naia] Installed start-here icon to hicolor theme"
fi

# Set default theme via plymouthd.conf (more reliable than plymouth-set-default-theme
# which may not persist in all build contexts)
mkdir -p /etc/plymouth
cat > /etc/plymouth/plymouthd.conf <<'PLYMOUTHCONF'
[Daemon]
Theme=naia
ShowDelay=0
PLYMOUTHCONF

# Also run the official command as belt-and-suspenders
plymouth-set-default-theme naia 2>/dev/null || true

echo "[naia] Plymouth theme set to 'naia'"

# ==============================================================================
# 3h. Remove Steam autostart (inherited from Bazzite gaming defaults)
# ==============================================================================

rm -f /etc/skel/.config/autostart/steam.desktop
echo "[naia] Removed Steam autostart from skel"

# ==============================================================================
# 4. Live session — KDE taskbar pins (Plasma update script)
#    Bazzite uses this approach: runs once per user when plasmashell detects it.
# ==============================================================================

mkdir -p /usr/share/plasma/shells/org.kde.plasma.desktop/contents/updates
cat > /usr/share/plasma/shells/org.kde.plasma.desktop/contents/updates/naia-pins.js <<'JSEOF'
var allPanels = panels();
for (var i = 0; i < allPanels.length; ++i) {
    var panel = allPanels[i];
    var widgets = panel.widgets();
    for (var j = 0; j < widgets.length; ++j) {
        var widget = widgets[j];
        if (widget.type === "org.kde.plasma.icontasks") {
            widget.currentConfigGroup = ["General"];
            widget.writeConfig("launchers", [
                "applications:Naia.desktop",
                "preferred://browser",
                "preferred://filemanager"
            ]);
            widget.reloadConfig();
        }
        // Replace Bazzite "B" icon on Kickoff (app launcher) with Naia start-here
        if (widget.type === "org.kde.plasma.kickoff") {
            widget.currentConfigGroup = ["General"];
            widget.writeConfig("icon", "start-here");
            widget.reloadConfig();
        }
    }
}
JSEOF

# ==============================================================================
# 5. Live session — Kickoff (start menu) favorites
# ==============================================================================

mkdir -p /etc/xdg
cat > /etc/xdg/kicker-extra-favoritesrc <<'EOF'
[General]
Prepend=Naia.desktop;firefox.desktop;com.discordapp.Discord.desktop;
IgnoreDefaults=false
EOF


# ==============================================================================
# 6. Live session — Korean input (fcitx5)
#    Bazzite already ships fcitx5 + fcitx5-hangul + fcitx5-wayland-launcher.
#    Use /etc/xdg/ system-wide defaults instead of /etc/skel/ (more reliable).
# ==============================================================================

# fcitx5 profile (hangul as default IM) — system-wide default
mkdir -p /etc/xdg/fcitx5
cat > /etc/xdg/fcitx5/profile <<'EOF'
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
EOF

# KDE Wayland virtual keyboard → fcitx5 (system-wide)
# Use kwriteconfig6 to avoid duplicate [Wayland] section
if command -v kwriteconfig6 &>/dev/null; then
    kwriteconfig6 --file /etc/xdg/kwinrc --group Wayland --key InputMethod \
        /usr/share/applications/org.fcitx.Fcitx5.wayland.desktop
else
    # Fallback: append only if [Wayland] section doesn't exist
    if ! grep -q '^\[Wayland\]' /etc/xdg/kwinrc 2>/dev/null; then
        cat >> /etc/xdg/kwinrc <<'KWINEOF'

[Wayland]
InputMethod=/usr/share/applications/org.fcitx.Fcitx5.wayland.desktop
KWINEOF
    fi
fi

# fcitx5 autostart for live session
mkdir -p /etc/xdg/autostart
cp /usr/etc/xdg/autostart/naia-fcitx5-setup.desktop /etc/xdg/autostart/ 2>/dev/null || true

# ==============================================================================
# 6b. Live session — /usr/etc is not /etc here
#     On an installed ostree system, /etc is populated from /usr/etc, so config
#     shipped there arrives where XDG and Plasma look for it. The live ISO has
#     no such deployment step: /usr/etc is an ordinary directory that nothing
#     reads. Anything the live session must see has to be copied into /etc.
#
#     Measured, not assumed. Booting the ISO with these two files only in
#     /usr/etc gave: GDK_BACKEND empty, no naia-shell.desktop in
#     /etc/xdg/autostart, the shell launching from the menu with a task-manager
#     entry and no visible window. Relaunching the same binary in the same
#     session with GDK_BACKEND=wayland rendered the onboarding screen at full
#     size. The line above, copying only fcitx5, was the surviving trace of this
#     same trap.
#
#     These are hard failures. A live session that boots to an invisible shell
#     is worse than one that fails to build.
# ==============================================================================

GDK_ENV_SRC="/usr/etc/xdg/plasma-workspace/env/naia-gdk-backend.sh"
GDK_ENV_DST="/etc/xdg/plasma-workspace/env/naia-gdk-backend.sh"
if [ ! -f "${GDK_ENV_SRC}" ]; then
    echo "[naia] FATAL: ${GDK_ENV_SRC} missing — the image did not ship the GTK backend selection." >&2
    exit 1
fi
mkdir -p "$(dirname "${GDK_ENV_DST}")"
cp "${GDK_ENV_SRC}" "${GDK_ENV_DST}"
chmod 0755 "${GDK_ENV_DST}"
echo "[naia] GTK backend selection installed for the live session"

AUTOSTART_SRC="/usr/etc/xdg/autostart/naia-shell.desktop"
if [ ! -f "${AUTOSTART_SRC}" ]; then
    echo "[naia] FATAL: ${AUTOSTART_SRC} missing — the image did not ship the autostart entry." >&2
    exit 1
fi
cp "${AUTOSTART_SRC}" /etc/xdg/autostart/
echo "[naia] Naia Shell autostart installed for the live session"

# Assert what the live session will actually read, not what the image shipped.
for f in "${GDK_ENV_DST}" /etc/xdg/autostart/naia-shell.desktop; do
    [ -f "$f" ] || { echo "[naia] FATAL: $f not in place after copy" >&2; exit 1; }
done
grep -q 'GDK_BACKEND=wayland' "${GDK_ENV_DST}" \
    || { echo "[naia] FATAL: backend selection never selects wayland" >&2; exit 1; }

# ==============================================================================
# 7. Live session — wallpaper (Plasma update script)
# ==============================================================================

cp "${SRC}/assets/installer/live-wallpaper.jpg" /usr/share/wallpapers/naia-live.jpg

cat > /usr/share/plasma/shells/org.kde.plasma.desktop/contents/updates/naia-wallpaper.js <<'JSEOF'
var allDesktops = desktops();
for (var i = 0; i < allDesktops.length; ++i) {
    var d = allDesktops[i];
    d.wallpaperPlugin = "org.kde.image";
    d.currentConfigGroup = ["Wallpaper", "org.kde.image", "General"];
    d.writeConfig("Image", "file:///usr/share/wallpapers/naia-live.jpg");
}
JSEOF

# ==============================================================================
# 8. Live session — warning notification (data is ephemeral)
# ==============================================================================

mkdir -p /etc/xdg/autostart /usr/libexec
cat > /usr/libexec/naia-live-warning.sh <<'SCRIPT'
#!/usr/bin/env bash
# Only show in live session (liveuser account)
[ "$(whoami)" = "liveuser" ] || exit 0

kdialog --msgbox "Welcome to Naia OS!\n\nRun 'Install to Hard Drive' on the desktop\nto install to your computer.\n\n[ Live USB Usage ]\n1. Connect to Wi-Fi\n2. Sign in to Google in browser\n3. Launch Naia Shell\n\n[ Input Method ]\nKorean input is configured by default (Ctrl+Space to toggle).\nTo use another language (Japanese, Chinese, etc.),\nchange the locale during installation. It will apply automatically.\n\n* Live session resets on reboot." \
    --title "Naia OS Live"
SCRIPT
chmod +x /usr/libexec/naia-live-warning.sh

# Autostart via system-wide /etc/xdg/autostart/ (script checks for liveuser)
cat > /etc/xdg/autostart/naia-live-warning.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Naia Live Session Warning
Exec=/usr/libexec/naia-live-warning.sh
X-KDE-autostart-phase=2
OnlyShowIn=KDE;
EOF

# ==============================================================================
# 9. Live session — Naia Shell is already present
#    The shell is layered into the image as an RPM (/usr/bin/naia-shell), so the
#    live session needs no install step. Assert it rather than assume it: an
#    image that reached the ISO stage without the shell must fail loudly here,
#    not boot to a desktop with a dead launcher.
# ==============================================================================

if [ ! -x /usr/bin/naia-shell ]; then
    echo "[naia] FATAL: /usr/bin/naia-shell missing or not executable." >&2
    echo "[naia] The naia RPM was not layered into the image." >&2
    exit 1
fi
echo "[naia] Naia Shell present: $(rpm -q naia)"

# ==============================================================================
# 10. Live session — DNS fallback
#    Some networks don't push DNS via DHCP; ensure a fallback is present.
# ==============================================================================

mkdir -p /etc/NetworkManager/conf.d

# NetworkManager global DNS fallback (single method — NM manages resolv.conf)
cat > /etc/NetworkManager/conf.d/99-naia-dns.conf <<'EOF'
[global-dns]
searches=

[global-dns-domain-*]
servers=8.8.8.8,1.1.1.1
EOF

# Method 2: Direct resolv.conf fallback (in case NM doesn't apply global-dns)
cat > /etc/NetworkManager/dispatcher.d/99-naia-dns-fallback <<'DISPATCH'
#!/usr/bin/env bash
# If resolv.conf has no working nameserver, inject Google/Cloudflare DNS
if ! grep -q '^nameserver' /etc/resolv.conf 2>/dev/null || \
   ! timeout 2 getent hosts google.com &>/dev/null; then
    printf "nameserver 8.8.8.8\nnameserver 1.1.1.1\n" >> /etc/resolv.conf
fi
DISPATCH
chmod +x /etc/NetworkManager/dispatcher.d/99-naia-dns-fallback

# Method 3: Replace resolv.conf (may be a systemd-resolved symlink that breaks DNS)
rm -f /etc/resolv.conf
printf "nameserver 8.8.8.8\nnameserver 1.1.1.1\n" > /etc/resolv.conf

# ==============================================================================
# 11. Wi-Fi power save off (Intel iwlwifi bug workaround)
#     Intel 8265 etc. connect but drop all packets with power_save on.
# ==============================================================================

# NM dispatcher: disable power save on every Wi-Fi connect
cat > /etc/NetworkManager/dispatcher.d/99-naia-wifi-powersave <<'DISPATCH'
#!/usr/bin/env bash
if [ "$2" = "up" ] && [ "$(nmcli -t -f DEVICE,TYPE dev | grep "^${DEVICE_IFACE}:wifi$")" ]; then
    iw dev "$DEVICE_IFACE" set power_save off 2>/dev/null || true
fi
DISPATCH
chmod +x /etc/NetworkManager/dispatcher.d/99-naia-wifi-powersave

# Also set via iwlwifi module param (persistent)
mkdir -p /etc/modprobe.d
echo "options iwlwifi power_save=0" > /etc/modprobe.d/naia-iwlwifi.conf

# ==============================================================================
# 12. fcitx5 input method environment variables
#     System defaults to ibus; override to fcitx5 for Korean input.
# ==============================================================================

mkdir -p /etc/environment.d
# Set fcitx5 as default input method — match host Bazzite settings.
# GTK_IM_MODULE and QT_IM_MODULE are set unconditionally (including Wayland)
# because terminals (Konsole, Ptyxis) require them for Korean composition.
cat > /etc/environment.d/input-method.conf <<'EOF'
INPUT_METHOD=fcitx
XMODIFIERS=@im=fcitx
GTK_IM_MODULE=fcitx
QT_IM_MODULE=fcitx
SDL_IM_MODULE=fcitx
GLFW_IM_MODULE=fcitx
EOF


# ==============================================================================
# 12b. Ensure Anaconda can create PID file + expand /run for live session
#      Default /run tmpfs (20% RAM) can be too small for Anaconda's PID file
#      when Bazzite services consume /run space. Only activates on live boot.
# ==============================================================================

mkdir -p /etc/tmpfiles.d
echo 'd /run/anaconda 0755 root root -' > /etc/tmpfiles.d/anaconda-run.conf

cat > /etc/systemd/system/naia-expand-run.service <<'UNIT'
[Unit]
Description=Expand /run tmpfs for Naia live session
DefaultDependencies=no
Before=display-manager.service liveinst-setup.service
ConditionKernelCommandLine=rd.live.image

[Service]
Type=oneshot
ExecStart=/usr/bin/mount -o remount,size=4G /run
RemainAfterExit=yes

[Install]
WantedBy=sysinit.target
UNIT
systemctl enable naia-expand-run.service 2>/dev/null || true
echo "[naia] /run expansion service installed"

# ==============================================================================
# 13. Cleanup
# ==============================================================================

# SRC used to be a temporary clone in /tmp, and this line removed it. It now
# points at /usr/share/naia — content the image ships — so deleting it here
# stripped the assets and the image-ref out of the live rootfs. Repurposing the
# variable without auditing its uses did that; the build stayed green because
# everything that reads it had already run.
#
# Nothing to clean up: there is no temporary directory any more.
[ -d "${SRC}" ] || { echo "[naia] FATAL: ${SRC} vanished during the hook" >&2; exit 1; }
[ -f "${SRC}/image-ref" ] || { echo "[naia] FATAL: ${SRC}/image-ref vanished during the hook" >&2; exit 1; }
echo "[naia] image payload intact at ${SRC}"

systemctl disable rpm-ostree-countme.timer 2>/dev/null || true
dnf clean all
