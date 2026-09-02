#!/usr/bin/env bash
set -euo pipefail

# install-naia-data-mount.sh — register the var-naia.mount unit during image build.
#
# At runtime, var-naia.mount auto-mounts a partition labeled "naia-data" at /var/naia.
# A xdg-autostart entry then symlinks ~/naia-adk → /var/naia/naia-adk per user.
#
# If no naia-data partition exists (e.g., installed system without persistent USB),
# the mount is a no-op (ConditionPathExists + nofail).
#
# See issue #262.

echo "[naia] Setting up persistent data mount..."

# Ensure the symlink helper is executable
chmod 0755 /usr/libexec/naia-adk-link

# /var/naia mount target is created at boot via tmpfiles.d
# (config/files/usr/lib/tmpfiles.d/naia-data-mount.conf) — /var is regenerated
# per-deployment on rpm-ostree systems, so we cannot create it at image build.

# Mount the persistent partition at the live user's HOME, not at /var/naia.
#
# The whole home persists this way — settings, Wi-Fi is separate (system-wide),
# conversations, memory and ~/naia-adk — instead of only the ADK directory.
# livesys-main handles a pre-existing /home/liveuser (useradd -M, then chown +
# restorecon), so a pre-mounted home is safe and gets its labels fixed each boot.
#
# Ordered Before=livesys.service by the unit itself, so the mount is in place
# before the live user is created. Without that ordering, user data would land
# on the RAM overlay and vanish on reboot.
#
# No naia-data partition (installed system, or a live boot from a USB without
# one) makes this a no-op via nofail + the device Requires.
systemctl enable var-home-liveuser.mount

# Legacy: var-naia.mount + the ~/naia-adk symlink stay in the image but are NOT
# enabled — superseded by whole-home persistence. The helper stays executable so
# it remains a harmless no-op if anything still calls it.
chmod 0755 /usr/libexec/naia-adk-link

echo "[naia] Persistent home mount registered (var-home-liveuser.mount enabled)"

# Wi-Fi profiles and the system locale live in /etc, not in $HOME, so the
# persistent home does not cover them. Bind-mounting them out of the persistent
# partition is what stops a demo USB from asking for the Wi-Fi password and the
# language again on every boot.
chmod 0755 /usr/libexec/naia-persist-system
systemctl enable naia-persist-system.service

echo "[naia] System settings persistence registered (naia-persist-system.service enabled)"

# A dd-written stick has free space and no naia-data partition. Creating it on
# first boot means any flashing tool on any OS produces a persistent USB, with no
# Naia-specific writer to ship for three platforms.
chmod 0755 /usr/libexec/naia-create-persistence
systemctl enable naia-create-persistence.service

echo "[naia] First-boot persistence partition registered (naia-create-persistence.service enabled)"

# The shell moved from a Flatpak bundle to a layered RPM. Machines updating from
# an older image still carry the Flatpak in mutable /var/lib/flatpak, which no
# image update touches — so without this the user keeps launching the old shell
# and nothing reports a problem. Enabling here rather than in a separate script
# keeps every systemctl call in one place, after the files module.
chmod 0755 /usr/libexec/naia-flatpak-migration
systemctl enable naia-flatpak-migration.service

echo "[naia] Flatpak retirement unit registered (naia-flatpak-migration.service enabled)"
