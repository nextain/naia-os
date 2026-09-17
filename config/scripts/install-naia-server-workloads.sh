#!/usr/bin/env bash
# Image-build check: the voice quadlet is on disk and is not enabled.
# Secrets never ship. nextain/naia-os#5
set -euo pipefail

command -v podman >/dev/null
test -f /usr/share/containers/systemd/naia-voice-host.container

# Must not be enabled in the image. Provision starts the one workload for this board.
for path in \
    /etc/systemd/user/default.target.wants/naia-voice-host.service \
    /usr/lib/systemd/user/default.target.wants/naia-voice-host.service \
    /etc/containers/systemd/naia-voice-host.container; do
    if [ -e "$path" ]; then
        echo "[naia] FATAL: workload unit enabled in the image: $path" >&2
        exit 1
    fi
done

found=$(find /usr /etc -xdev -type f \( \
    -name 'account-key' -o -name 'voice-host-token' -o -name 'relay-key' \
    -o -name 'cf-api-token' -o -name 'cf-tunnel-token' -o -name 'cloudflared.env' \
    \) 2>/dev/null || true)
if [ -n "$found" ]; then
    echo "[naia] FATAL: secret filenames in the image:" >&2
    echo "$found" >&2
    exit 1
fi

if grep -R -l 'TUNNEL_TOKEN=' /usr/share/containers/systemd 2>/dev/null | grep -q .; then
    echo "[naia] FATAL: TUNNEL_TOKEN baked into a quadlet" >&2
    exit 1
fi

echo "[naia] server workloads: quadlet present, not enabled, no secrets"
