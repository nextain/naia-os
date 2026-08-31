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

# Enable the mount unit so systemd attempts to mount on boot
systemctl enable var-naia.mount

echo "[naia] Persistent data mount registered (var-naia.mount enabled)"

# The shell moved from a Flatpak bundle to a layered RPM. Machines updating from
# an older image still carry the Flatpak in mutable /var/lib/flatpak, which no
# image update touches — so without this the user keeps launching the old shell
# and nothing reports a problem. Enabling here rather than in a separate script
# keeps every systemctl call in one place, after the files module.
chmod 0755 /usr/libexec/naia-flatpak-migration
systemctl enable naia-flatpak-migration.service

echo "[naia] Flatpak retirement unit registered (naia-flatpak-migration.service enabled)"
