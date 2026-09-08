#!/usr/bin/env bash
# Build-time only: materialize BC250 support in both live and installed images.
set -euo pipefail
src="$(cd "$(dirname "$0")" && pwd)"
for tool in naia-bc250-dp-audio; do
    install -Dm0755 "$src/$tool" "/usr/libexec/$tool"
    install -Dm0644 "$src/$tool.service" "/usr/lib/systemd/system/$tool.service"
    # /usr/etc feeds installed deployments; /etc is also required in live ISO.
    for base in /usr/etc /etc; do
        mkdir -p "$base/systemd/system/multi-user.target.wants"
        ln -sfn "/usr/lib/systemd/system/$tool.service" "$base/systemd/system/multi-user.target.wants/$tool.service"
    done
done
install -Dm0644 "$src/SOURCES.md" /usr/share/naia/bc250/SOURCES.md
install -Dm0644 "$src/LICENSE.audio" /usr/share/licenses/naia-bc250/audio-LICENSE
# Preserve SVG alpha in every raster launcher size, including installed OS.
for size in 16 22 24 32 48 64 96 128 256; do
    dst="/usr/share/icons/hicolor/${size}x${size}/apps/start-here.png"
    mkdir -p "$(dirname "$dst")"
    if command -v rsvg-convert >/dev/null; then
        rsvg-convert -w "$size" -h "$size" /usr/share/naia/assets/installer/start-here.svg -o "$dst"
    else
        convert -background none /usr/share/naia/assets/installer/start-here.svg -resize "${size}x${size}" "$dst"
    fi
done
