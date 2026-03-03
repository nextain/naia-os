#!/usr/bin/env bash
# hook-post-rootfs.sh — Titanoboa ISO post-rootfs hook
# Runs inside podman --rootfs (the extracted container image IS /)
# /app is titanoboa's own repo, NOT ours — clone naia-os to get assets.
set -euo pipefail

REPO_URL="https://github.com/nextain/naia-os.git"
SRC="/tmp/naia-os-repo"

# ==============================================================================
# 1. Install Anaconda + branding
# ==============================================================================

# Bazzite versionlocks NetworkManager (COPR build) and sets repo-level excludes
# via dnf5 config-manager (repos.override.d). Clear both so anaconda-live can install.
dnf -qy versionlock clear 2>/dev/null || true
rm -f /etc/dnf/repos.override.d/99-config_manager.repo 2>/dev/null || true

dnf install -y --allowerasing \
    git anaconda-live libblockdev-btrfs libblockdev-lvm libblockdev-dm \
    libblockdev-mpath

git clone --depth 1 --quiet "${REPO_URL}" "${SRC}"

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

mkdir -p /etc/anaconda/profile.d
cat > /etc/anaconda/profile.d/naia.conf <<'EOF'
[Profile]
profile_id = naia-os

[Profile Detection]
os_id = naia-os

[Bootloader]
efi_dir = fedora

[Storage]
default_scheme = BTRFS
btrfs_compression = zstd:1

[User Interface]
custom_stylesheet = /usr/share/anaconda/pixmaps/fedora.css
hidden_spokes = NetworkSpoke
EOF

# ==============================================================================
# 3. Anaconda pre-install cleanup wrapper
#    Stop Naia Shell, OpenClaw Gateway, and other runtime processes before
#    Anaconda's rsync copies the live filesystem. Running processes create
#    transient files (sockets, PID files, locks) that vanish during rsync,
#    causing exit code 23 (partial transfer).
# ==============================================================================

cat > /usr/libexec/naia-liveinst-wrapper.sh <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail

echo "[naia] Stopping runtime processes before installation..."

# 1. Stop Naia Shell (Flatpak)
flatpak kill io.nextain.naia 2>/dev/null || true

# 2. Stop OpenClaw Gateway (Node.js)
pkill -f "openclaw.*gateway" 2>/dev/null || true

# 3. Clean up transient runtime files
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

# ==============================================================================
# 3-ost. Anaconda ostreecontainer kickstart (Bazzite upstream 방식)
#        Generates interactive-defaults.ks with ostreecontainer directive and
#        post-scripts for bootc switch, flatpak install, and Fedora flatpak disable.
#        Reference: titanoboa/.github/workflows/ci_dummy_hook_postrootfs.sh
# ==============================================================================

# Image reference for ostreecontainer
NAIA_IMAGE_REF="ghcr.io/nextain/naia-os"
NAIA_IMAGE_TAG="latest"

# Try to read from image-info.json (only if it's a Naia image, not Bazzite base)
if [ -f /usr/share/ublue-os/image-info.json ]; then
    _name="$(jq -r '."image-name" // empty' /usr/share/ublue-os/image-info.json)"
    if [[ "$_name" == *naia* ]]; then
        _ref="$(jq -r '."image-ref" // empty' /usr/share/ublue-os/image-info.json)"
        _tag="$(jq -r 'if ."image-branch" then ."image-branch" else ."image-tag" end // empty' /usr/share/ublue-os/image-info.json)"
        if [ -n "$_ref" ]; then
            NAIA_IMAGE_REF="${_ref##*://}"
        fi
        if [ -n "$_tag" ]; then
            NAIA_IMAGE_TAG="$_tag"
        fi
    else
        echo "[naia] image-info.json has non-Naia image ('$_name'), using default ref"
    fi
fi

echo "[naia] Image ref: ${NAIA_IMAGE_REF}:${NAIA_IMAGE_TAG}"

# interactive-defaults.ks — Anaconda uses this for default installation settings
mkdir -p /usr/share/anaconda/post-scripts
cat <<EOF >>/usr/share/anaconda/interactive-defaults.ks
ostreecontainer --url=${NAIA_IMAGE_REF}:${NAIA_IMAGE_TAG} --transport=containers-storage --no-signature-verification
%include /usr/share/anaconda/post-scripts/install-configure-upgrade.ks
%include /usr/share/anaconda/post-scripts/disable-fedora-flatpak.ks
%include /usr/share/anaconda/post-scripts/install-flatpaks.ks
%include /usr/share/anaconda/post-scripts/install-naia-customizations.ks
EOF

# Post-install: bootc switch to registry-based updates
cat <<EOF >/usr/share/anaconda/post-scripts/install-configure-upgrade.ks
%post --erroronfail
bootc switch --mutate-in-place --transport registry ${NAIA_IMAGE_REF}:${NAIA_IMAGE_TAG}
%end
EOF

# Install flatpaks to ostree deployment path
cat <<'EOF' >/usr/share/anaconda/post-scripts/install-flatpaks.ks
%post --erroronfail --nochroot
deployment="$(ostree rev-parse --repo=/mnt/sysimage/ostree/repo ostree/0/1/0)"
target="/mnt/sysimage/ostree/deploy/default/deploy/$deployment.0/var/lib/"
mkdir -p "$target"
rsync -aAXUHKP /var/lib/flatpak "$target"
%end
EOF

# Disable Fedora flatpak repo
cat <<EOF >/usr/share/anaconda/post-scripts/disable-fedora-flatpak.ks
%post --erroronfail
systemctl disable flatpak-add-fedora-repos.service
%end
EOF

# Copy Naia customizations (Plasma scripts, wallpaper, configs) to installed system
# --nochroot: live rootfs = /, installed system = /mnt/sysimage
cat <<'CUSTEOF' >/usr/share/anaconda/post-scripts/install-naia-customizations.ks
%post --nochroot --log=/mnt/sysimage/var/log/naia-customizations.log
set -x
SYSROOT="/mnt/sysimage"

# Find the ostree deployment root
DEPLOY_ROOT=""
if [ -d "$SYSROOT/ostree/deploy" ]; then
    DEPLOY_ROOT="$(ls -d "$SYSROOT"/ostree/deploy/*/deploy/*.0 2>/dev/null | head -1)"
fi
# Fallback to sysroot itself (non-ostree or flat layout)
TARGET="${DEPLOY_ROOT:-$SYSROOT}"

echo "[naia] Customization target: $TARGET"

# 1. Plasma update scripts (taskbar pins, wallpaper)
PLASMA_UPDATES="$TARGET/usr/share/plasma/shells/org.kde.plasma.desktop/contents/updates"
mkdir -p "$PLASMA_UPDATES"
for f in naia-pins.js naia-wallpaper.js; do
    src="/usr/share/plasma/shells/org.kde.plasma.desktop/contents/updates/$f"
    if [ -f "$src" ]; then
        cp "$src" "$PLASMA_UPDATES/$f"
        echo "[naia] Copied $f"
    fi
done

# 2. Wallpaper image
mkdir -p "$TARGET/usr/share/wallpapers"
if [ -f /usr/share/wallpapers/naia-live.jpg ]; then
    cp /usr/share/wallpapers/naia-live.jpg "$TARGET/usr/share/wallpapers/naia-live.jpg"
    echo "[naia] Copied wallpaper"
fi

# 3. Kickoff favorites
if [ -f /etc/xdg/kicker-extra-favoritesrc ]; then
    mkdir -p "$TARGET/etc/xdg"
    cp /etc/xdg/kicker-extra-favoritesrc "$TARGET/etc/xdg/kicker-extra-favoritesrc"
    echo "[naia] Copied kickoff favorites"
fi

# 4. Fcitx5 Korean input setup
for f in /etc/xdg/autostart/naia-fcitx5-setup.desktop \
         /usr/etc/xdg/autostart/naia-fcitx5-setup.desktop; do
    if [ -f "$f" ]; then
        mkdir -p "$TARGET/etc/xdg/autostart"
        cp "$f" "$TARGET/etc/xdg/autostart/naia-fcitx5-setup.desktop"
        echo "[naia] Copied fcitx5 setup"
        break
    fi
done

# 5. Fcitx5 environment variables
if [ -f /etc/environment.d/50-naia-fcitx5.conf ]; then
    mkdir -p "$TARGET/etc/environment.d"
    cp /etc/environment.d/50-naia-fcitx5.conf "$TARGET/etc/environment.d/50-naia-fcitx5.conf"
    echo "[naia] Copied fcitx5 env vars"
fi

# 6. Login/lock screen background + SDDM config
if [ -f /usr/share/wallpapers/naia-login.jpg ]; then
    mkdir -p "$TARGET/usr/share/wallpapers"
    cp /usr/share/wallpapers/naia-login.jpg "$TARGET/usr/share/wallpapers/naia-login.jpg"
    echo "[naia] Copied login background"
fi
if [ -f /etc/sddm.conf.d/naia-background.conf ]; then
    mkdir -p "$TARGET/etc/sddm.conf.d"
    cp /etc/sddm.conf.d/naia-background.conf "$TARGET/etc/sddm.conf.d/naia-background.conf"
    echo "[naia] Copied SDDM config"
fi
if [ -f /etc/xdg/kscreenlockerrc ]; then
    mkdir -p "$TARGET/etc/xdg"
    cp /etc/xdg/kscreenlockerrc "$TARGET/etc/xdg/kscreenlockerrc"
    echo "[naia] Copied lock screen config"
fi

echo "[naia] Customizations installed successfully"
%end
CUSTEOF

# Anaconda payload config
cat <<EOF >>/etc/anaconda/conf.d/anaconda.conf
[Payload]
flatpak_remote = flathub https://dl.flathub.org/repo/
EOF

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
            var existing = widget.readConfig("launchers", []);
            // Bazzite defaults (from main.xml) — used if no config written yet
            if (!existing || existing.length === 0) {
                existing = [
                    "preferred://browser",
                    "applications:steam.desktop",
                    "applications:net.lutris.Lutris.desktop",
                    "applications:org.gnome.Ptyxis.desktop",
                    "applications:io.github.kolunmi.Bazaar.desktop",
                    "preferred://filemanager"
                ];
            }
            var prepend = [
                "applications:io.nextain.naia.desktop"
            ];
            // Deduplicate: remove prepend items from existing if already there
            var filtered = [];
            for (var k = 0; k < existing.length; k++) {
                var dominated = false;
                for (var m = 0; m < prepend.length; m++) {
                    if (existing[k] === prepend[m]) { dominated = true; break; }
                }
                if (!dominated) filtered.push(existing[k]);
            }
            widget.writeConfig("launchers", prepend.concat(filtered));
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
Prepend=io.nextain.naia.desktop;
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
cat >> /etc/xdg/kwinrc <<'EOF'

[Wayland]
InputMethod=/usr/share/applications/org.fcitx.Fcitx5.wayland.desktop
EOF

# fcitx5 autostart for live session
mkdir -p /etc/xdg/autostart
cp /usr/etc/xdg/autostart/naia-fcitx5-setup.desktop /etc/xdg/autostart/ 2>/dev/null || true

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
# 7b. Plymouth watermark + system icons — replace Bazzite with Naia
# ==============================================================================

# Plymouth watermark (horizontal logo below UEFI logo during boot)
cp "${SRC}/assets/logos/text-mix-naia-logo.png" /usr/share/plymouth/themes/spinner/watermark.png

# Install ImageMagick for icon resizing
dnf install -y --setopt=install_weak_deps=False ImageMagick >/dev/null 2>&1 || true

NAIA_LOGO="${SRC}/assets/logos/start-launcher-icon.png"

# Replace all Bazzite/Fedora round logos in hicolor with Naia logo
for size in 16 22 24 32 36 48 64 96 128 256; do
    dir="/usr/share/icons/hicolor/${size}x${size}"
    if [ -d "$dir" ]; then
        magick "$NAIA_LOGO" -resize "${size}x${size}" /tmp/naia-icon-${size}.png 2>/dev/null || \
            convert "$NAIA_LOGO" -resize "${size}x${size}" /tmp/naia-icon-${size}.png 2>/dev/null || continue
        # Replace all logo variants
        for target in \
            "$dir/places/start-here.png" \
            "$dir/apps/bazzite.png" \
            "$dir/apps/fedora-logo-icon.png" \
            "$dir/bazzite-logo-icon.png"; do
            [ -f "$target" ] && cp /tmp/naia-icon-${size}.png "$target"
        done
        rm -f /tmp/naia-icon-${size}.png
    fi
done

# Replace SVG logos
for svg in \
    /usr/share/icons/hicolor/scalable/places/start-here.svg \
    /usr/share/icons/hicolor/scalable/places/distributor-logo.svg \
    /usr/share/icons/hicolor/scalable/places/bazzite-logo.svg \
    /usr/share/icons/hicolor/scalable/apps/start-here.svg; do
    if [ -f "$svg" ]; then
        magick "$NAIA_LOGO" /tmp/naia-logo.svg 2>/dev/null || \
            convert "$NAIA_LOGO" /tmp/naia-logo.svg 2>/dev/null || continue
        cp /tmp/naia-logo.svg "$svg"
    fi
done
rm -f /tmp/naia-logo.svg

# Rebuild icon cache — KDE uses cached icons, without this Bazzite icons persist
if command -v gtk-update-icon-cache &>/dev/null; then
    gtk-update-icon-cache -f -t /usr/share/icons/hicolor 2>/dev/null || true
    echo "[naia] Icon cache rebuilt"
fi

# Rebuild initramfs with updated watermark
KERNEL_VER="$(ls /lib/modules/ | sort -V | tail -1)"
if [ -n "$KERNEL_VER" ]; then
    dracut --force --kver "$KERNEL_VER" 2>/dev/null || echo "[naia] dracut skipped (will apply on installed system)"
fi

# ==============================================================================
# 7c. Login/lock screen background (SDDM + kscreenlocker)
# ==============================================================================

cp "${SRC}/assets/installer/login-background.jpg" /usr/share/wallpapers/naia-login.jpg

# SDDM login screen background
mkdir -p /etc/sddm.conf.d
cat > /etc/sddm.conf.d/naia-background.conf <<'EOF'
[Theme]
Current=breeze
[General]
[theme]
background=/usr/share/wallpapers/naia-login.jpg
EOF

# KDE lock screen background (system-wide default)
mkdir -p /etc/xdg
cat >> /etc/xdg/kscreenlockerrc <<'EOF'
[Greeter][Wallpaper][org.kde.image][General]
Image=file:///usr/share/wallpapers/naia-login.jpg
PreviewImage=file:///usr/share/wallpapers/naia-login.jpg
EOF

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
# 9. Install Naia Shell Flatpak for live session
#    The bundle was baked into the image by install-naia-shell.sh (BlueBuild).
#    On installed OS, naia-flatpak-install.service handles this on first boot.
# ==============================================================================

NAIA_BUNDLE="/usr/share/naia/naia-shell.flatpak"

# Override bundle from titanoboa /app mount (for local ISO builds with updated Flatpak)
if [ -f /app/naia-shell-override.flatpak ]; then
    echo "[naia] Flatpak bundle override found at /app/naia-shell-override.flatpak"
    mkdir -p "$(dirname "${NAIA_BUNDLE}")"
    cp /app/naia-shell-override.flatpak "${NAIA_BUNDLE}"
fi

if [ -f "${NAIA_BUNDLE}" ]; then
    echo "[naia] Installing Naia Shell Flatpak for live session..."
    # GNOME Platform runtime (Naia Shell dependency)
    flatpak install --system --noninteractive flathub org.gnome.Platform//49 || true
    # Install from local bundle
    flatpak install --system --noninteractive --bundle "${NAIA_BUNDLE}" || true
    echo "[naia] Naia Shell Flatpak installed."
else
    echo "[naia] WARNING: Naia Shell Flatpak bundle not found at ${NAIA_BUNDLE}"
fi

# ==============================================================================
# 10. Live session — DNS fallback
#    Some networks don't push DNS via DHCP; ensure a fallback is present.
# ==============================================================================

mkdir -p /etc/NetworkManager/conf.d

# Method 1: NetworkManager global DNS override
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
    echo -e "nameserver 8.8.8.8\nnameserver 1.1.1.1" >> /etc/resolv.conf
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
ConditionPathExists=/home/liveuser

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

rm -rf "${SRC}"
systemctl disable rpm-ostree-countme.timer 2>/dev/null || true
dnf clean all
