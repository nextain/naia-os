#!/usr/bin/env bash
# Naia OS Installation Screenshot Capture Tool
#
# Boots the ISO in QEMU with VNC for interactive use.
# User navigates the installer via VNC and captures screenshots at each step.
# Screenshots are saved to docs/installation-guide/images/.
#
# Usage:
#   ./os/tools/capture-install-screenshots.sh --iso <path>
#   ./os/tools/capture-install-screenshots.sh --iso ../titanoboa/output.iso
#
# Prerequisites: qemu-system-x86_64, qemu-img, socat, OVMF (edk2-ovmf)
# Optional: TigerVNC viewer (flatpak org.tigervnc.vncviewer)

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────

ISO_PATH=""
WORKDIR="/var/home/luke/dev/naia-e2e-screenshot"
QEMU_SMP=4
QEMU_MEM="8G"
DISK_SIZE="64G"
VNC_DISPLAY=5
OVMF_CODE="/usr/share/edk2/ovmf/OVMF_CODE.fd"
OVMF_VARS="/usr/share/edk2/ovmf/OVMF_VARS.fd"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/docs/installation-guide/images"

# ── Colors ────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── Screenshot definitions ────────────────────────────────────────────────────
# Each entry: "filename|description"
# Phase 1: Installation
# Phase 2: First boot (after reboot from installed disk)

INSTALL_SCREENSHOTS=(
    "00-grub|GRUB boot menu"
    "01-welcome|Welcome — Language & Keyboard"
    "02-datetime|Date and Time"
    "03-installation-method|Installation Method (disk selection)"
    "04-storage|Storage Configuration (encryption)"
    "05-create-account|Create Account"
    "06-review|Review and Install"
    "07-installing|Installation started"
    "08-installing-progress|Installation in progress"
    "09-complete|Installation complete"
)

FIRSTBOOT_SCREENSHOTS=(
    "10-login|Login screen (first boot)"
    "11-desktop|KDE Plasma desktop"
    "12-naia-app|Naia app running"
)

# ── Usage ─────────────────────────────────────────────────────────────────────

usage() {
    cat <<'EOF'
Naia OS Installation Screenshot Capture Tool

Usage: ./os/tools/capture-install-screenshots.sh --iso <path> [OPTIONS]

Required:
  --iso <path>        Path to Naia OS ISO

Options:
  --workdir <path>    Working directory (default: /var/tmp/naia-screenshot)
  --output <path>     Screenshot output directory (default: docs/installation-guide/images/)
  --vnc <display>     VNC display number (default: 5, port 5905)
  --mem <size>        VM memory (default: 8G)
  --smp <cores>       VM CPU cores (default: 4)
  --disk <size>       Virtual disk size (default: 64G)
  --help              Show this help

Workflow:
  1. Script boots ISO in QEMU with VNC
  2. Connect via VNC viewer (auto-opened if available)
  3. Navigate the installer step by step
  4. Press Enter in this terminal to capture each screenshot
  5. After install completes, script reboots from disk for first-boot captures
EOF
    exit 0
}

# ── Argument parsing ──────────────────────────────────────────────────────────

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --iso)     ISO_PATH="$2"; shift 2 ;;
            --workdir) WORKDIR="$2"; shift 2 ;;
            --output)  OUTPUT_DIR="$2"; shift 2 ;;
            --vnc)     VNC_DISPLAY="$2"; shift 2 ;;
            --mem)     QEMU_MEM="$2"; shift 2 ;;
            --smp)     QEMU_SMP="$2"; shift 2 ;;
            --disk)    DISK_SIZE="$2"; shift 2 ;;
            --help|-h) usage ;;
            *)         err "Unknown option: $1"; usage ;;
        esac
    done

    if [[ -z "$ISO_PATH" ]]; then
        err "--iso <path> is required"
        usage
    fi
    if [[ ! -f "$ISO_PATH" ]]; then
        err "ISO not found: $ISO_PATH"
        exit 1
    fi
    ISO_PATH="$(realpath "$ISO_PATH")"
}

# ── Prerequisites ─────────────────────────────────────────────────────────────

check_prerequisites() {
    local missing=()
    for cmd in qemu-system-x86_64 qemu-img socat python3; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done
    if [[ ! -f "$OVMF_CODE" ]]; then missing+=("OVMF ($OVMF_CODE)"); fi
    if [[ ! -f "$OVMF_VARS" ]]; then missing+=("OVMF ($OVMF_VARS)"); fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        err "Missing prerequisites:"
        for m in "${missing[@]}"; do err "  - $m"; done
        exit 1
    fi

    # Find free VNC port
    while ss -tln | grep -q ":$((5900 + VNC_DISPLAY)) "; do
        VNC_DISPLAY=$(( VNC_DISPLAY + 1 ))
    done

    ok "Prerequisites OK"
}

# ── QMP helper ────────────────────────────────────────────────────────────────

generate_qmp_helper() {
    cat > "$WORKDIR/qmp-helper.py" << 'PYEOF'
#!/usr/bin/env python3
"""QMP helper for screendump."""
import json, socket, sys

class QMP:
    def __init__(self, sock_path):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(sock_path)
        self.sock.settimeout(10)
        self._recv()
        self._send({"execute": "qmp_capabilities"})
        self._recv()

    def _send(self, cmd):
        self.sock.sendall(json.dumps(cmd).encode() + b"\n")

    def _recv(self):
        buf = b""
        while True:
            chunk = self.sock.recv(4096)
            buf += chunk
            if b"\n" in buf:
                break
        return json.loads(buf.decode().strip())

    def screendump(self, filename, fmt="ppm"):
        args = {"filename": filename}
        if fmt == "png":
            args["format"] = "png"
        self._send({"execute": "screendump", "arguments": args})
        resp = self._recv()
        retries = 0
        while "return" not in resp and "error" not in resp and retries < 10:
            resp = self._recv()
            retries += 1
        return resp

    def quit(self):
        self._send({"execute": "quit"})

    def close(self):
        self.sock.close()

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("sock")
    p.add_argument("action", choices=["screendump", "quit"])
    p.add_argument("--output", "-o")
    p.add_argument("--format", "-f", default="ppm", choices=["ppm", "png"])
    args = p.parse_args()
    try:
        q = QMP(args.sock)
        if args.action == "screendump":
            if not args.output:
                print("ERROR: --output required", file=sys.stderr)
                sys.exit(1)
            resp = q.screendump(args.output, args.format)
            if "error" in resp:
                if args.format == "png":
                    ppm_path = args.output.rsplit(".", 1)[0] + ".ppm"
                    resp = q.screendump(ppm_path, "ppm")
                    if "error" not in resp:
                        print(f"FALLBACK_PPM:{ppm_path}")
                    else:
                        sys.exit(1)
                else:
                    sys.exit(1)
            else:
                print(f"OK:{args.output}")
        elif args.action == "quit":
            q.quit()
        q.close()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
PYEOF
    chmod +x "$WORKDIR/qmp-helper.py"
}

take_screenshot() {
    local sock="$1" output="$2"
    local result
    result=$(python3 "$WORKDIR/qmp-helper.py" "$sock" screendump -o "$output" -f png 2>&1) || true

    if [[ "$result" == OK:* ]]; then
        return 0
    elif [[ "$result" == FALLBACK_PPM:* ]]; then
        local ppm_path="${result#FALLBACK_PPM:}"
        if command -v magick &>/dev/null; then
            magick "$ppm_path" "$output" 2>/dev/null && rm -f "$ppm_path" && return 0
        elif command -v convert &>/dev/null; then
            convert "$ppm_path" "$output" 2>/dev/null && rm -f "$ppm_path" && return 0
        fi
        # Keep PPM if no converter
        mv "$ppm_path" "${output%.png}.ppm"
        warn "Saved as PPM (install ImageMagick for PNG): ${output%.png}.ppm"
        return 0
    fi
    warn "Screenshot failed: $result"
    return 1
}

# ── Cleanup ───────────────────────────────────────────────────────────────────

QEMU_PID=""
VNC_PID=""

cleanup() {
    local exit_code=$?
    if [[ -n "$QEMU_PID" ]] && kill -0 "$QEMU_PID" 2>/dev/null; then
        log "Stopping QEMU (PID $QEMU_PID)..."
        kill "$QEMU_PID" 2>/dev/null || true
        wait "$QEMU_PID" 2>/dev/null || true
    fi
    if [[ -n "$VNC_PID" ]] && kill -0 "$VNC_PID" 2>/dev/null; then
        kill "$VNC_PID" 2>/dev/null || true
    fi
    exit "$exit_code"
}

trap cleanup EXIT INT TERM

# ── Open VNC viewer ───────────────────────────────────────────────────────────

open_vnc_viewer() {
    local vnc_addr="localhost:$((5900 + VNC_DISPLAY))"
    if command -v vncviewer &>/dev/null; then
        vncviewer "$vnc_addr" &>/dev/null &
        VNC_PID=$!
    elif flatpak info org.tigervnc.vncviewer &>/dev/null 2>&1; then
        flatpak run org.tigervnc.vncviewer "$vnc_addr" &>/dev/null &
        VNC_PID=$!
    else
        warn "No VNC viewer found. Connect manually: vncviewer $vnc_addr"
    fi
}

# ── Interactive capture loop ──────────────────────────────────────────────────

run_capture_loop() {
    local qmp_sock="$1"
    shift
    local -n screenshots=$1

    local index=0
    local total=${#screenshots[@]}

    echo ""
    echo -e "${BOLD}=== Screenshot Capture Mode ===${NC}"
    echo -e "${DIM}Navigate the installer in the VNC window.${NC}"
    echo -e "${DIM}Press Enter to capture, 's' to skip, 'r' to retake, 'c' for custom, 'q' to quit.${NC}"
    echo ""

    while [[ $index -lt $total ]]; do
        local entry="${screenshots[$index]}"
        local filename="${entry%%|*}"
        local desc="${entry#*|}"
        local output_path="$OUTPUT_DIR/${filename}.png"

        echo -e "${CYAN}[$((index+1))/$total]${NC} ${BOLD}${desc}${NC}"
        echo -e "  File: ${DIM}${filename}.png${NC}"
        echo -n "  [Enter]=capture  [s]=skip  [r]=retake last  [c]=custom name  [q]=quit > "
        read -r action

        case "$action" in
            s|S)
                warn "Skipped: $filename"
                index=$((index + 1))
                ;;
            r|R)
                if [[ $index -gt 0 ]]; then
                    index=$((index - 1))
                else
                    warn "Already at the first screenshot"
                fi
                ;;
            c|C)
                echo -n "  Custom filename (without .png): "
                read -r custom_name
                if [[ -n "$custom_name" ]]; then
                    local custom_path="$OUTPUT_DIR/${custom_name}.png"
                    if take_screenshot "$qmp_sock" "$custom_path"; then
                        ok "Captured: ${custom_name}.png ($(du -h "$custom_path" 2>/dev/null | cut -f1))"
                    fi
                fi
                # Don't advance index — let user continue with the same step
                ;;
            q|Q)
                log "Capture stopped by user."
                return 0
                ;;
            *)
                # Enter = capture
                if take_screenshot "$qmp_sock" "$output_path"; then
                    ok "Captured: ${filename}.png ($(du -h "$output_path" 2>/dev/null | cut -f1))"
                    index=$((index + 1))
                else
                    warn "Capture failed. Try again or press 's' to skip."
                fi
                ;;
        esac
    done

    echo ""
    ok "All screenshots for this phase captured!"
}

# ── Phase 1: Boot ISO for installation ────────────────────────────────────────

run_install_phase() {
    echo ""
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Phase 1: Installation (ISO → HDD)${NC}"
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
    echo ""

    local disk="$WORKDIR/disk.qcow2"
    local efivars="$WORKDIR/efivars.fd"
    local qmp_sock="$WORKDIR/qmp.sock"

    mkdir -p "$WORKDIR" "$OUTPUT_DIR"

    # Create disk + OVMF vars
    if [[ ! -f "$disk" ]]; then
        log "Creating ${DISK_SIZE} virtual disk..."
        qemu-img create -f qcow2 "$disk" "$DISK_SIZE" >/dev/null
    else
        log "Reusing existing disk: $disk"
    fi
    cp "$OVMF_VARS" "$efivars"

    generate_qmp_helper

    local kvm_flag=""
    if [[ -r /dev/kvm ]]; then kvm_flag="-enable-kvm"; fi

    log "Starting QEMU (VNC :$VNC_DISPLAY → port $((5900 + VNC_DISPLAY)))..."
    qemu-system-x86_64 \
        $kvm_flag \
        -machine q35 \
        -cpu host \
        -smp "$QEMU_SMP" \
        -m "$QEMU_MEM" \
        -drive "if=pflash,format=raw,readonly=on,file=$OVMF_CODE" \
        -drive "if=pflash,format=raw,file=$efivars" \
        -drive "file=$disk,format=qcow2,if=virtio" \
        -cdrom "$ISO_PATH" \
        -boot d \
        -display none \
        -vnc ":$VNC_DISPLAY" \
        -vga virtio \
        -netdev user,id=net0 \
        -device virtio-net-pci,netdev=net0 \
        -chardev "socket,id=qmp0,path=$qmp_sock,server=on,wait=off" \
        -mon chardev=qmp0,mode=control \
        -no-reboot &

    QEMU_PID=$!
    log "QEMU PID: $QEMU_PID"

    sleep 2
    open_vnc_viewer

    echo ""
    echo -e "${BOLD}VNC viewer should open automatically.${NC}"
    echo -e "If not, connect to: ${CYAN}localhost:$((5900 + VNC_DISPLAY))${NC}"
    echo ""
    echo -e "Navigate through the Anaconda installer in the VNC window."
    echo -e "When you reach each step, press Enter here to capture a screenshot."
    echo ""

    run_capture_loop "$qmp_sock" INSTALL_SCREENSHOTS

    echo ""
    echo -e "${YELLOW}Installation should now be completing or rebooting.${NC}"
    echo -e "Press Enter when QEMU has shut down (VM will stop after install due to --no-reboot)."
    read -r

    # Kill QEMU if still running
    if kill -0 "$QEMU_PID" 2>/dev/null; then
        log "Shutting down QEMU..."
        python3 "$WORKDIR/qmp-helper.py" "$qmp_sock" quit 2>/dev/null || true
        wait "$QEMU_PID" 2>/dev/null || true
    fi
    QEMU_PID=""

    ok "Phase 1 complete. Installation screenshots captured."
    echo ""

    # Ask about phase 2
    echo -n "Proceed to Phase 2 (first boot from installed disk)? [Y/n] "
    read -r proceed
    if [[ "$proceed" =~ ^[nN] ]]; then
        return 0
    fi

    run_firstboot_phase
}

# ── Phase 2: Boot from installed disk ─────────────────────────────────────────

run_firstboot_phase() {
    echo ""
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Phase 2: First Boot (HDD → Naia App)${NC}"
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
    echo ""

    local disk="$WORKDIR/disk.qcow2"
    local efivars="$WORKDIR/efivars.fd"
    local qmp_sock="$WORKDIR/qmp-boot.sock"

    if [[ ! -f "$disk" ]]; then
        err "No installed disk found at $disk. Run Phase 1 first."
        exit 1
    fi

    # Fresh OVMF vars for clean boot
    cp "$OVMF_VARS" "$efivars"

    local kvm_flag=""
    if [[ -r /dev/kvm ]]; then kvm_flag="-enable-kvm"; fi

    log "Booting from installed disk (VNC :$VNC_DISPLAY → port $((5900 + VNC_DISPLAY)))..."
    qemu-system-x86_64 \
        $kvm_flag \
        -machine q35 \
        -cpu host \
        -smp "$QEMU_SMP" \
        -m "$QEMU_MEM" \
        -drive "if=pflash,format=raw,readonly=on,file=$OVMF_CODE" \
        -drive "if=pflash,format=raw,file=$efivars" \
        -drive "file=$disk,format=qcow2,if=virtio" \
        -display none \
        -vnc ":$VNC_DISPLAY" \
        -vga virtio \
        -netdev user,id=net0 \
        -device virtio-net-pci,netdev=net0 \
        -chardev "socket,id=qmp0,path=$qmp_sock,server=on,wait=off" \
        -mon chardev=qmp0,mode=control &

    QEMU_PID=$!
    log "QEMU PID: $QEMU_PID"

    sleep 2
    open_vnc_viewer

    echo ""
    echo -e "${BOLD}VM is booting from the installed disk.${NC}"
    echo -e "Log in via VNC, then capture the first-boot screenshots."
    echo ""

    run_capture_loop "$qmp_sock" FIRSTBOOT_SCREENSHOTS

    # Allow extra captures
    echo ""
    echo -n "Take additional custom screenshots? [y/N] "
    read -r extra
    if [[ "$extra" =~ ^[yY] ]]; then
        while true; do
            echo -n "  Filename (without .png, empty to stop): "
            read -r custom_name
            [[ -z "$custom_name" ]] && break
            local custom_path="$OUTPUT_DIR/${custom_name}.png"
            if take_screenshot "$qmp_sock" "$custom_path"; then
                ok "Captured: ${custom_name}.png"
            fi
        done
    fi

    log "Shutting down VM..."
    python3 "$WORKDIR/qmp-helper.py" "$qmp_sock" quit 2>/dev/null || true
    wait "$QEMU_PID" 2>/dev/null || true
    QEMU_PID=""

    ok "Phase 2 complete!"
}

# ── Summary ───────────────────────────────────────────────────────────────────

print_summary() {
    echo ""
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Summary${NC}"
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
    echo ""

    if [[ -d "$OUTPUT_DIR" ]]; then
        local count
        count=$(find "$OUTPUT_DIR" -name "*.png" -o -name "*.ppm" 2>/dev/null | wc -l)
        ok "Captured $count screenshots in: $OUTPUT_DIR/"
        echo ""
        ls -lh "$OUTPUT_DIR"/*.png 2>/dev/null || ls -lh "$OUTPUT_DIR"/*.ppm 2>/dev/null || true
    fi

    echo ""
    echo -e "${DIM}Workdir preserved at: $WORKDIR${NC}"
    echo -e "${DIM}  disk.qcow2 — virtual disk (reusable for retakes)${NC}"
    echo -e "${DIM}  To clean up: rm -rf $WORKDIR${NC}"
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
    parse_args "$@"
    echo ""
    echo -e "${BOLD}Naia OS Installation Screenshot Capture Tool${NC}"
    echo ""
    check_prerequisites
    run_install_phase
    print_summary
}

main "$@"
