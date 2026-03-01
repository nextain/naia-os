#!/usr/bin/env bash
set -euo pipefail

# flatpak-clean-rebuild-and-run.sh — 캐시 포함 전체 삭제 후 Flatpak 풀 빌드
#
# flatpak-rebuild-and-run.sh와 동일하되, .flatpak-builder 캐시까지 삭제합니다.
# 의존성 변경, SDK 버전 변경 등 클린 빌드가 필요할 때 사용하세요.

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$SCRIPT_DIR"

echo ""
echo "  === Naia OS Flatpak 클린 재빌드 ==="
echo "  (.flatpak-builder 캐시 포함 전체 삭제)"
echo ""

rm -rf .flatpak-builder
echo "[0/4] Cache cleared."

exec bash "$(dirname "$0")/flatpak-rebuild-and-run.sh" "$@"
