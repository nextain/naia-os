#!/usr/bin/env bash
# Run as root inside a freshly booted live ISO, after automatic login.
# Usage: bash installer/check-live-session.sh none|present
set -euo pipefail
export SYSTEMD_PAGER=cat SYSTEMD_COLORS=0
test "$(id -u)" = 0
case "${1:-}" in none|present) persistence=$1 ;; *) exit 2 ;; esac
grep -qw 'rd.live.image' /proc/cmdline
uid=$(id -u liveuser)
session=$(loginctl list-sessions --no-legend | awk '$3 == "liveuser" && $4 == "seat0" {print $1; exit}')
test -n "$session"
test "$(loginctl show-session "$session" -p Type --value)" = wayland
test "$(loginctl show-session "$session" -p Active --value)" = yes
test "$(loginctl show-session "$session" -p LockedHint --value)" = no
pgrep -u "$uid" -x kwin_wayland >/dev/null
pgrep -u "$uid" -x plasmashell >/dev/null
test -S "/run/user/$uid/wayland-0"
runuser -u liveuser -- env "XDG_RUNTIME_DIR=/run/user/$uid" \
    "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$uid/bus" \
    busctl --user --no-pager status org.kde.plasmashell >/dev/null
runuser -u liveuser -- jq -e '."image-ref" | startswith("ostree-image-signed:docker://ghcr.io/nextain/")' \
    /usr/share/ublue-os/image-info.json >/dev/null
test -x /usr/libexec/naia-liveinst-wrapper.sh
bash -n /usr/libexec/naia-liveinst-wrapper.sh
if [ "$persistence" = none ]; then
    ! blkid -L naia-data >/dev/null 2>&1
    test "$(systemctl show var-home-liveuser.mount -p LoadState --value)" = masked
    test "$(runuser -u liveuser -- kreadconfig6 --file kscreenlockerrc --group Daemon --key Autolock)" = false
    test "$(runuser -u liveuser -- kreadconfig6 --file kscreenlockerrc --group Daemon --key LockOnResume)" = false
else
    test "$(findmnt -n -o TARGET --target /var/home/liveuser)" = /var/home/liveuser
    test "$(findmnt -n -o FSTYPE --target /var/home/liveuser)" = btrfs
    test "$(findmnt -n -o LABEL --target /var/home/liveuser)" = naia-data
fi
echo "PASS: active KDE live desktop; persistence=$persistence; metadata readable; installer entry present"
