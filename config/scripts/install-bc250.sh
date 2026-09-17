#!/usr/bin/env bash
# Wire BC-250 helpers that the files module already placed under /usr.
# Only the AMD recipe runs this: NVIDIA images must not carry a sleep block
# that keys off DMI they will never match, but the binaries are small and
# no-op off-board (is_bc250()). Enabling here makes live+installed agree.
set -euo pipefail
for tool in naia-bc250-dp-audio naia-bc250-nosleep naia-bc250-noddc; do
    test -x "/usr/libexec/$tool"
    test -f "/usr/lib/systemd/system/$tool.service"
done
mkdir -p /usr/lib/systemd/system/sysinit.target.wants \
         /usr/lib/systemd/system/multi-user.target.wants \
         /etc/systemd/system/sysinit.target.wants \
         /etc/systemd/system/multi-user.target.wants
ln -sfn ../naia-bc250-nosleep.service /usr/lib/systemd/system/sysinit.target.wants/naia-bc250-nosleep.service
ln -sfn ../naia-bc250-noddc.service /usr/lib/systemd/system/sysinit.target.wants/naia-bc250-noddc.service
ln -sfn /usr/lib/systemd/system/naia-bc250-dp-audio.service \
    /usr/lib/systemd/system/multi-user.target.wants/naia-bc250-dp-audio.service
ln -sfn /usr/lib/systemd/system/naia-bc250-nosleep.service /etc/systemd/system/sysinit.target.wants/naia-bc250-nosleep.service
ln -sfn /usr/lib/systemd/system/naia-bc250-noddc.service /etc/systemd/system/sysinit.target.wants/naia-bc250-noddc.service
ln -sfn /usr/lib/systemd/system/naia-bc250-dp-audio.service \
    /etc/systemd/system/multi-user.target.wants/naia-bc250-dp-audio.service
echo "[naia] BC-250 sleep/DDC/DP-audio units enabled (no-op off this board)"
