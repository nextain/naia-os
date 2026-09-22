#!/usr/bin/env bash
# install-naia-toolchain.sh — the tools every Naia OS install needs out of the box.
#
# Fresh installs were missing gh and herdr, and owners installed them by hand after
# every reinstall (naia-os#2 section 4, naia-os#3). brew and tailscale come from the
# Bazzite base; they are asserted here so a base change cannot drop them silently.
#
#   gh        Fedora RPM layered into the image
#   herdr     pinned standalone release -> /usr/bin/herdr. The version matches
#             naia-shell's HERDR_VERSION: its embedded Workspace resolves herdr on
#             PATH on Linux (naia-shell#584)
#   brew      Bazzite ships /usr/share/homebrew.tar.zst + brew-setup.service
#   tailscale Bazzite ships the RPM; tailscaled is enabled here, login stays with the owner
set -euo pipefail

HERDR_VERSION="0.8.2"
HERDR_URL="https://github.com/herdrdev/herdr/releases/download/v${HERDR_VERSION}/herdr-linux-x86_64"
HERDR_SHA256="976150a14d490c94b243ea2e1a7eb2dfb67f12e36b182db90936f6728e6aecf4"
HERDR_LICENSE_URL="https://raw.githubusercontent.com/herdrdev/herdr/v${HERDR_VERSION}/LICENSE"

echo "[naia] toolchain: gh"
if ! rpm -q gh >/dev/null 2>&1; then
    if command -v dnf5 >/dev/null 2>&1; then
        dnf5 -y install gh
        dnf5 clean all
    else
        rpm-ostree install -y gh
    fi
fi
rpm -q gh

echo "[naia] toolchain: herdr ${HERDR_VERSION}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl --fail --location --retry 3 --retry-delay 2 --silent --show-error -o "$tmp/herdr" "$HERDR_URL"
printf '%s  %s\n' "$HERDR_SHA256" "$tmp/herdr" | sha256sum --check --status - || {
    echo "[naia] FATAL: herdr ${HERDR_VERSION} does not match its pinned SHA-256" >&2
    exit 1
}
install -Dm0755 "$tmp/herdr" /usr/bin/herdr
curl --fail --location --retry 3 --silent --show-error -o "$tmp/LICENSE" "$HERDR_LICENSE_URL"
install -Dm0644 "$tmp/LICENSE" /usr/share/licenses/herdr/LICENSE

echo "[naia] toolchain: nodejs and npm"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    if command -v dnf5 >/dev/null 2>&1; then
        dnf5 -y install nodejs npm
        dnf5 clean all
    else
        rpm-ostree install -y nodejs npm
    fi
fi
rpm -q nodejs npm >/dev/null 2>&1 || rpm -q nodejs22 nodejs22-npm >/dev/null 2>&1 || (command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1)

echo "[naia] toolchain: google-chrome"
mkdir -p /var/opt
if ! rpm -q google-chrome-stable >/dev/null 2>&1; then
    if command -v dnf5 >/dev/null 2>&1; then
        dnf5 -y install https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm
        dnf5 clean all
    else
        rpm-ostree install -y https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm
    fi
fi
rpm -q google-chrome-stable

if [ -d /var/opt/google ] && [ ! -d /usr/lib/opt/google ]; then
    mkdir -p /usr/lib/opt
    cp -a /var/opt/google /usr/lib/opt/
    mkdir -p /usr/lib/tmpfiles.d
    echo "C /var/opt/google - - - - /usr/lib/opt/google" > /usr/lib/tmpfiles.d/naia-google-chrome.conf
fi

echo "[naia] toolchain: brew and tailscale from the base"
test -s /usr/share/homebrew.tar.zst
test -f /usr/lib/systemd/system/brew-setup.service
test -x /usr/bin/tailscale
test -f /usr/lib/systemd/system/tailscaled.service
test -f /usr/lib/systemd/system/sshd.service
systemctl enable tailscaled.service brew-setup.service sshd.service

mkdir -p /usr/etc/profile.d
cat > /usr/etc/profile.d/00-naia-brew.sh <<'BREWEOF'
if [ -d /home/linuxbrew/.linuxbrew/bin ]; then
    export PATH="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:$PATH"
fi
BREWEOF
chmod 0644 /usr/etc/profile.d/00-naia-brew.sh

echo "[naia] toolchain ready: $(gh --version | head -1); herdr ${HERDR_VERSION}; node $(node --version); npm $(npm --version); chrome $(rpm -q --qf '%{VERSION}' google-chrome-stable); brew (first boot); tailscale $(rpm -q --qf '%{VERSION}' tailscale)"
