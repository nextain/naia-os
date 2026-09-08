#!/usr/bin/env bash
# Build-time only: materialize BC250 support in both live and installed images.
set -euo pipefail
src="$(cd "$(dirname "$0")" && pwd)"
archive=/tmp/naia-bc250-governor.tar.gz
curl -fL --retry 3 https://github.com/filippor/cyan-skillfish-governor/releases/download/v0.4.12/cyan-skillfish-governor-smu-v0.4.12-x86_64-linux.tar.gz -o "$archive"
echo "43cf992d4a2078bb4d208c6bf411293c8ba127f5170f4e59cb09e8cc25ec0821  $archive" | sha256sum -c -
mkdir -p /tmp/naia-bc250-governor
tar -xzf "$archive" -C /tmp/naia-bc250-governor --strip-components=1
install -Dm0755 /tmp/naia-bc250-governor/cyan-skillfish-governor-smu /usr/libexec/naia-cyan-skillfish-governor-smu
install -Dm0644 /tmp/naia-bc250-governor/LICENSE /usr/share/licenses/naia-bc250/governor-LICENSE
for tool in naia-bc250-governor naia-bc250-dp-audio; do
    install -Dm0755 "$src/$tool" "/usr/libexec/$tool"
    install -Dm0644 "$src/$tool.service" "/usr/lib/systemd/system/$tool.service"
    # /usr/etc feeds installed deployments; /etc is also required in live ISO.
    for base in /usr/etc /etc; do
        mkdir -p "$base/systemd/system/multi-user.target.wants"
        ln -sfn "/usr/lib/systemd/system/$tool.service" "$base/systemd/system/multi-user.target.wants/$tool.service"
    done
done
install -Dm0644 "$src/governor.toml" /usr/share/naia/bc250/governor.toml
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
rm -rf /tmp/naia-bc250-governor "$archive"
