#!/usr/bin/env bash
# Install libvosk shared library for Vosk STT runtime support.
# Called during BlueBuild OS image build (recipe.yml).
set -euo pipefail

VOSK_VERSION="0.3.45"
VOSK_URL="https://github.com/alphacep/vosk-api/releases/download/v${VOSK_VERSION}/vosk-linux-x86_64-${VOSK_VERSION}.zip"
VOSK_SHA256="bbdc8ed85c43979f6443142889770ea95cbfbc56cffb5c5dcd73afa875c5fbb2"
TMP_ZIP="/tmp/vosk-linux-x86_64-${VOSK_VERSION}.zip"

echo "[naia] Installing libvosk ${VOSK_VERSION}..."

curl -fL -o "${TMP_ZIP}" "${VOSK_URL}"

# Verify integrity
echo "${VOSK_SHA256}  ${TMP_ZIP}" | sha256sum --check --status

# Extract and install
cd /tmp
unzip -q "${TMP_ZIP}" "vosk-linux-x86_64-${VOSK_VERSION}/libvosk.so"
install -Dm755 "vosk-linux-x86_64-${VOSK_VERSION}/libvosk.so" /usr/lib/libvosk.so
ldconfig

# Cleanup
rm -rf "${TMP_ZIP}" "/tmp/vosk-linux-x86_64-${VOSK_VERSION}"

echo "[naia] libvosk ${VOSK_VERSION} installed to /usr/lib/libvosk.so"
