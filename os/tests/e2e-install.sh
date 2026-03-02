#!/usr/bin/env bash
# Naia OS E2E Installation Test (VNC Graphics Mode)
# Boot ISO in QEMU VM with VNC → GNOME desktop → liveinst → boot verification
#
# Usage: ./os/tests/e2e-install.sh --iso <path> [OPTIONS]
#
# Prerequisites: qemu-system-x86_64, qemu-img, xorriso, OVMF (edk2-ovmf), sshpass, socat

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────

ISO_PATH=""
SKIP_VERIFY=false
KEEP_WORKDIR=false
WORKDIR="/var/tmp/naia-e2e"
INSTALL_TIMEOUT=2400    # 40 min (graphical boot takes longer)
BOOT_TIMEOUT=300
SSH_TIMEOUT=300
VERBOSE=false
QEMU_SMP=4
QEMU_MEM="8G"
DISK_SIZE="60G"
SSH_PORT=2222
VNC_DISPLAY=1

OVMF_CODE="/usr/share/edk2/ovmf/OVMF_CODE.fd"
OVMF_VARS="/usr/share/edk2/ovmf/OVMF_VARS.fd"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KS_FILE="$SCRIPT_DIR/e2e-install.ks"

# ── Colors ────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────

log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }
ok()   { echo -e "${GREEN}[PASS]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }
bold() { echo -e "${BOLD}$*${NC}"; }

usage() {
    cat <<'EOF'
Usage: ./os/tests/e2e-install.sh [OPTIONS]

Required:
  --iso <path>       Path to Naia OS ISO

Options:
  --skip-verify      Skip post-install boot verification
  --keep             Keep workdir after test (for debugging)
  --workdir <path>   Working directory (default: /tmp/naia-e2e)
  --timeout <sec>    Installation timeout in seconds (default: 2400)
  --verbose          Show serial console output in real-time
  --help             Show this help
EOF
    exit 0
}

cleanup() {
    local exit_code=$?
    # Kill any lingering QEMU processes
    if [[ -n "${QEMU_PID:-}" ]] && kill -0 "$QEMU_PID" 2>/dev/null; then
        log "Killing QEMU process $QEMU_PID"
        kill "$QEMU_PID" 2>/dev/null || true
        wait "$QEMU_PID" 2>/dev/null || true
    fi
    # Kill socat
    if [[ -n "${SOCAT_PID:-}" ]] && kill -0 "$SOCAT_PID" 2>/dev/null; then
        kill "$SOCAT_PID" 2>/dev/null || true
    fi
    # Kill verbose tail
    if [[ -n "${TAIL_PID:-}" ]] && kill -0 "$TAIL_PID" 2>/dev/null; then
        kill "$TAIL_PID" 2>/dev/null || true
    fi

    if [[ "$KEEP_WORKDIR" == false && -d "$WORKDIR" ]]; then
        log "Cleaning up $WORKDIR"
        rm -rf "$WORKDIR"
    elif [[ -d "$WORKDIR" ]]; then
        log "Workdir preserved: $WORKDIR"
    fi

    exit "$exit_code"
}

send_serial_cmd() {
    local cmd_file="$1" text="$2"
    # echo adds \n which both: (1) flushes tail -f pipe buffer, and
    # (2) acts as Enter key for the serial shell
    echo "$text" >> "$cmd_file"
}

wait_serial_pattern() {
    local log_file="$1" pattern="$2" timeout="${3:-300}"
    local start
    start=$(date +%s)
    while true; do
        if grep -q "$pattern" "$log_file" 2>/dev/null; then return 0; fi
        if (( $(date +%s) - start >= timeout )); then return 1; fi
        sleep 3
    done
}

find_free_port() {
    local port="$1"
    while ss -tln | grep -q ":${port} "; do
        port=$(( port + 1 ))
    done
    echo "$port"
}

ssh_cmd() {
    local cmd="$1"
    sshpass -p "naia-e2e-test" ssh \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o ConnectTimeout=5 \
        -o LogLevel=ERROR \
        -p "$SSH_PORT" liveuser@localhost "$cmd"
}

ssh_cmd_t() {
    # With PTY allocation (for interactive commands)
    local cmd="$1"
    sshpass -p "naia-e2e-test" ssh -t \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o ConnectTimeout=10 \
        -o LogLevel=ERROR \
        -p "$SSH_PORT" liveuser@localhost "$cmd"
}

scp_to_vm() {
    local src="$1" dst="$2"
    sshpass -p "naia-e2e-test" scp \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o LogLevel=ERROR \
        -P "$SSH_PORT" "$src" "liveuser@localhost:$dst"
}

# ── Argument Parsing ──────────────────────────────────────────────────────────

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --iso)        ISO_PATH="$2"; shift 2 ;;
            --skip-verify) SKIP_VERIFY=true; shift ;;
            --keep)       KEEP_WORKDIR=true; shift ;;
            --workdir)    WORKDIR="$2"; shift 2 ;;
            --timeout)    INSTALL_TIMEOUT="$2"; shift 2 ;;
            --verbose)    VERBOSE=true; shift ;;
            --help|-h)    usage ;;
            *)            err "Unknown option: $1"; usage ;;
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

# ── Phase 0: Prerequisites ───────────────────────────────────────────────────

check_prerequisites() {
    bold "=== Phase 0: Prerequisites ==="
    local missing=()

    for cmd in qemu-system-x86_64 qemu-img xorriso sshpass socat; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done

    if [[ ! -f "$OVMF_CODE" ]]; then missing+=("OVMF_CODE ($OVMF_CODE)"); fi
    if [[ ! -f "$OVMF_VARS" ]]; then missing+=("OVMF_VARS ($OVMF_VARS)"); fi
    if [[ ! -f "$KS_FILE" ]]; then missing+=("Kickstart ($KS_FILE)"); fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        err "Missing prerequisites:"
        for m in "${missing[@]}"; do err "  - $m"; done
        exit 1
    fi

    if [[ ! -r /dev/kvm ]]; then
        warn "/dev/kvm not readable — VM will be much slower"
    fi

    # Find free ports
    SSH_PORT=$(find_free_port "$SSH_PORT")
    VNC_DISPLAY=$(find_free_port $(( 5900 + VNC_DISPLAY )))
    VNC_DISPLAY=$(( VNC_DISPLAY - 5900 ))

    ok "All prerequisites satisfied"
    log "SSH port: $SSH_PORT, VNC display: :$VNC_DISPLAY (port $((5900 + VNC_DISPLAY)))"
}

# ── Phase 1: ISO Patching ────────────────────────────────────────────────────

patch_iso_with_kickstart() {
    bold "=== Phase 1: ISO Patching ==="

    mkdir -p "$WORKDIR"
    local patched_iso="$WORKDIR/naia-e2e.iso"

    # Find grub.cfg in ISO (use -find with -name for reliable matching)
    log "Searching for GRUB config..."
    local grub_path=""
    grub_path=$(xorriso -indev "$ISO_PATH" -find / -name "grub.cfg" -exec echo 2>/dev/null \
        | grep -v '^$' | head -1 | tr -d "'") || true

    if [[ -z "$grub_path" ]]; then
        err "Could not find grub.cfg in ISO"
        xorriso -indev "$ISO_PATH" -ls / 2>/dev/null || true
        exit 1
    fi
    log "Found GRUB config: $grub_path"

    # Extract and patch grub.cfg
    local grub_dir="$WORKDIR/grub-extract"
    mkdir -p "$grub_dir"
    xorriso -osirrox on -indev "$ISO_PATH" -extract "$grub_path" "$grub_dir/grub.cfg" 2>/dev/null

    cp "$grub_dir/grub.cfg" "$grub_dir/grub.cfg.orig"

    # Patch: add serial console for logging + debug shell for SSH bootstrap
    # VNC provides the graphical display, serial is for logging/setup only
    sed -i \
        '/^\s*\(linux\|linuxefi\)\s.*vmlinuz/ {
            s| quiet||g
            s| rhgb||g
            /console=ttyS0/! s|$| console=ttyS0,115200 systemd.debug_shell=ttyS0 systemd.mask=serial-getty@ttyS0.service|
        }' \
        "$grub_dir/grub.cfg"

    if $VERBOSE; then
        log "GRUB config diff:"
        diff "$grub_dir/grub.cfg.orig" "$grub_dir/grub.cfg" || true
    fi

    # Build patched ISO
    log "Building patched ISO..."
    local vol_id
    vol_id=$(xorriso -indev "$ISO_PATH" -pvd_info 2>/dev/null \
        | grep "Volume Id" | sed 's/.*: //' | tr -d '[:space:]') || vol_id="NAIA-E2E"

    xorriso -indev "$ISO_PATH" \
        -outdev "$patched_iso" \
        -boot_image any replay \
        -volid "$vol_id" \
        -map "$KS_FILE" /ks.cfg \
        -map "$grub_dir/grub.cfg" "$grub_path" \
        -end 2>&1 | {
            if $VERBOSE; then cat; else grep -i "error\|warning" || true; fi
        }

    if [[ ! -f "$patched_iso" ]]; then
        err "Failed to create patched ISO"
        exit 1
    fi

    ok "Patched ISO: $patched_iso ($(du -h "$patched_iso" | cut -f1))"
}

# ── Phase 2: QEMU Installation ───────────────────────────────────────────────

generate_anaconda_script() {
    # Python script that runs anaconda in text mode with pty-based automation
    cat > "$WORKDIR/anaconda-automate.py" << 'PYEOF'
#!/usr/bin/env python3
"""Anaconda text-mode automator for E2E testing.

Launches anaconda --liveinst --text with kickstart, then navigates
the TUI spokes and presses 'b' to begin installation.
"""
import os, sys, pty, select, subprocess, time, re

TIMEOUT = 1800  # 30 min total
KS_PATH = "/run/initramfs/live/ks.cfg"

class Automator:
    def __init__(self):
        self.master = None
        self.proc = None
        self.buf = b""
        self.logf = open("/tmp/anaconda-e2e.log", "wb")

    def start_anaconda(self):
        master, slave = pty.openpty()
        env = os.environ.copy()
        env["PKEXEC_UID"] = str(os.getuid())
        env["LANG"] = "en_US.UTF-8"
        env["TERM"] = "linux"

        self.proc = subprocess.Popen(
            ["sudo", "-E", "/usr/sbin/anaconda",
             "--liveinst", "--text", "--kickstart", KS_PATH],
            stdin=slave, stdout=slave, stderr=slave,
            env=env, preexec_fn=os.setsid
        )
        os.close(slave)
        self.master = master
        print(f"[e2e] Anaconda started (PID {self.proc.pid})")

    def read_until(self, pattern, timeout=300):
        """Read pty output until pattern matches or timeout."""
        start = time.time()
        compiled = re.compile(pattern.encode() if isinstance(pattern, str) else pattern)
        while time.time() - start < timeout:
            r, _, _ = select.select([self.master], [], [], 2)
            if r:
                try:
                    data = os.read(self.master, 4096)
                except OSError:
                    break
                self.buf += data
                self.logf.write(data)
                self.logf.flush()
                if compiled.search(self.buf):
                    return True
            if self.proc.poll() is not None:
                return False
        return False

    def send(self, text, delay=2):
        """Send text to anaconda's pty."""
        time.sleep(delay)
        os.write(self.master, (text + "\r").encode())
        self.buf = b""  # reset buffer after send

    def detect_incomplete_spokes(self):
        """Parse menu output for spokes marked [!] (need attention)."""
        incomplete = []
        text = self.buf.decode("utf-8", errors="replace")
        for line in text.split("\n"):
            m = re.match(r"\s*(\d+)\)\s*\[!\]", line)
            if m:
                incomplete.append(int(m.group(1)))
        return incomplete

    def navigate_spoke_destination(self):
        """Spoke: Installation Destination"""
        print("[e2e] Navigating: Installation Destination")
        self.send("3")
        if not self.read_until(r"disk|Disk|select|DISK", 30):
            print("[e2e]   Warning: disk prompt not detected, pressing c anyway")
        self.send("c", 5)  # accept disk
        time.sleep(3)
        self.send("c", 3)  # accept partitioning (Use All Space)
        time.sleep(3)
        self.send("c", 3)  # accept partition type (Btrfs)
        self.read_until(r"begin installation|Installation", 30)
        print("[e2e]   Destination done")

    def navigate_spoke_root_password(self):
        """Spoke: Root Password (keep locked)"""
        print("[e2e] Navigating: Root Password")
        self.send("4")
        time.sleep(5)
        self.send("c", 3)  # accept locked
        self.read_until(r"begin installation|Installation", 15)
        print("[e2e]   Root password done")

    def navigate_spoke_user(self):
        """Spoke: User Creation"""
        print("[e2e] Navigating: User Creation")
        self.send("5")
        time.sleep(5)
        self.send("1", 2)  # toggle Create user
        self.send("2", 2)  # Full name
        self.send("testuser", 2)
        self.send("3", 2)  # Username
        self.send("testuser", 2)
        self.send("5", 2)  # Password
        time.sleep(3)
        self.send("naia-e2e-test", 3)  # password
        self.send("naia-e2e-test", 3)  # confirm
        self.send("c", 5)  # finish
        self.read_until(r"begin installation|Installation", 15)
        print("[e2e]   User creation done")

    def run(self):
        self.start_anaconda()

        # Wait for text mode main menu
        print("[e2e] Waiting for Anaconda text menu...")
        if not self.read_until(r"begin installation", 300):
            print("[e2e] ERROR: Anaconda text menu not found")
            return 1

        print("[e2e] Menu displayed. Checking spoke status...")
        time.sleep(3)

        # Check which spokes need attention
        incomplete = self.detect_incomplete_spokes()
        if incomplete:
            print(f"[e2e] Incomplete spokes: {incomplete}")
            for spoke in sorted(incomplete):
                if spoke == 3:
                    self.navigate_spoke_destination()
                elif spoke == 4:
                    self.navigate_spoke_root_password()
                elif spoke == 5:
                    self.navigate_spoke_user()
                else:
                    print(f"[e2e] Warning: Unknown spoke {spoke}, skipping")
                time.sleep(3)
        else:
            print("[e2e] All spokes completed by kickstart")

        # Begin installation
        print("[e2e] Pressing 'b' to begin installation...")
        self.send("b", 3)

        # Wait for anaconda to finish (VM will reboot)
        print("[e2e] Waiting for installation to complete...")
        self.proc.wait()
        print(f"[e2e] Anaconda exited with code {self.proc.returncode}")
        self.logf.close()
        return self.proc.returncode

if __name__ == "__main__":
    a = Automator()
    sys.exit(a.run())
PYEOF
    chmod +x "$WORKDIR/anaconda-automate.py"
}

run_installation() {
    bold "=== Phase 2: QEMU Installation (VNC Graphics Mode) ==="

    local disk="$WORKDIR/disk.qcow2"
    local efivars="$WORKDIR/efivars.fd"
    local serial_log="$WORKDIR/install-serial.log"
    local serial_sock="$WORKDIR/serial.sock"
    local serial_cmd="$WORKDIR/serial-cmd"

    # Create virtual disk + OVMF vars copy
    log "Creating ${DISK_SIZE} virtual disk..."
    qemu-img create -f qcow2 "$disk" "$DISK_SIZE" >/dev/null
    cp "$OVMF_VARS" "$efivars"

    # Generate the Python automation script
    generate_anaconda_script

    local kvm_flag=""
    if [[ -r /dev/kvm ]]; then kvm_flag="-enable-kvm"; fi

    log "Starting QEMU (VNC :$VNC_DISPLAY, SSH port $SSH_PORT)..."
    qemu-system-x86_64 \
        $kvm_flag \
        -machine q35 \
        -cpu host \
        -smp "$QEMU_SMP" \
        -m "$QEMU_MEM" \
        -drive "if=pflash,format=raw,readonly=on,file=$OVMF_CODE" \
        -drive "if=pflash,format=raw,file=$efivars" \
        -drive "file=$disk,format=qcow2,if=virtio" \
        -cdrom "$WORKDIR/naia-e2e.iso" \
        -boot d \
        -display none \
        -vnc ":$VNC_DISPLAY" \
        -vga virtio \
        -netdev "user,id=net0,hostfwd=tcp::${SSH_PORT}-:22" \
        -device virtio-net-pci,netdev=net0 \
        -chardev "socket,id=ser0,path=$serial_sock,server=on,wait=off" \
        -serial chardev:ser0 \
        -no-reboot &

    QEMU_PID=$!
    log "QEMU PID: $QEMU_PID"

    local install_start
    install_start=$(date +%s)

    # Set up serial communication (for initial setup + logging)
    sleep 2
    touch "$serial_log"
    > "$serial_cmd"
    tail -f "$serial_cmd" | socat - UNIX-CONNECT:"$serial_sock" >> "$serial_log" 2>/dev/null &
    SOCAT_PID=$!

    if $VERBOSE; then
        tail -f "$serial_log" &
        TAIL_PID=$!
    fi

    # ── Phase 2a: Bootstrap SSH via serial debug shell ──
    log "Waiting for debug shell on serial..."
    if ! wait_serial_pattern "$serial_log" "sh-[0-9]" 300; then
        err "Debug shell not detected within 300s"
        dump_failure_logs
        exit 1
    fi
    ok "Debug shell ready"

    # Wait for basic networking (QEMU user-mode NAT is typically 10.0.2.x)
    log "Waiting for network..."
    # Simple network wait — avoid complex for loops over serial (bracket paste issues)
    send_serial_cmd "$serial_cmd" "sleep 10; ip -4 addr show | grep -q 'inet [0-9]'; echo NET_READY"
    if ! wait_serial_pattern "$serial_log" "NET_READY" 90; then
        warn "Network check timed out, continuing anyway..."
    fi

    # Set liveuser password, enable passwordless sudo, and start sshd
    log "Enabling SSH access..."
    # Wait for shell to be fully ready after network check
    sleep 3
    # Set password — use chpasswd with echo pipe (simpler than passwd --stdin)
    send_serial_cmd "$serial_cmd" "echo liveuser:naia-e2e-test | chpasswd; echo PASSWD_OK"
    sleep 5
    # Unlock account (may be locked by default)
    send_serial_cmd "$serial_cmd" "passwd -u liveuser 2>/dev/null; echo UNLOCK_OK"
    sleep 3
    send_serial_cmd "$serial_cmd" "echo 'liveuser ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/liveuser-nopasswd; echo SUDO_OK"
    sleep 3
    # Enable password auth in sshd (Fedora may default to no)
    send_serial_cmd "$serial_cmd" "mkdir -p /etc/ssh/sshd_config.d; echo 'PasswordAuthentication yes' > /etc/ssh/sshd_config.d/99-e2e.conf; echo SSHD_CONF_OK"
    sleep 2
    # daemon-reload needed because live session modifies unit files
    send_serial_cmd "$serial_cmd" "systemctl daemon-reload; systemctl start sshd; echo SSHD_OK"
    if ! wait_serial_pattern "$serial_log" "SSHD_OK" 30; then
        warn "sshd start confirmation not detected, retrying..."
        sleep 5
        send_serial_cmd "$serial_cmd" "systemctl start sshd"
        sleep 5
    fi
    ok "SSH enabled"

    # CRITICAL: Expand /run tmpfs via SSH (reliable channel)
    # The live overlay upperdir is at /run/overlayfs, constrained by /run tmpfs size.
    # systemd defaults /run to 20% of RAM (1.6GB on 8GB) which fills up.
    # Serial is unreliable for this (boot messages interfere), so use SSH.
    log "Expanding /run tmpfs (overlay fix)..."
    local run_expand_attempts=0
    while (( run_expand_attempts < 5 )); do
        if ssh_cmd "sudo mount -o remount,size=6G /run" 2>/dev/null; then
            local run_size
            run_size=$(ssh_cmd "df -h /run | tail -1 | awk '{print \$2}'" 2>/dev/null) || true
            ok "/run expanded to ${run_size:-6G}"
            break
        fi
        run_expand_attempts=$(( run_expand_attempts + 1 ))
        sleep 3
    done
    if (( run_expand_attempts >= 5 )); then
        warn "/run expansion failed — overlay may run out of space"
    fi

    # ── Phase 2b: Wait for GNOME desktop session ──
    log "Waiting for GNOME session (liveuser auto-login)..."
    local gnome_start
    gnome_start=$(date +%s)
    local gnome_ready=false

    while (( $(date +%s) - gnome_start < 600 )); do
        # First check: can we SSH in?
        if ! sshpass -p "naia-e2e-test" ssh \
                -o StrictHostKeyChecking=no \
                -o UserKnownHostsFile=/dev/null \
                -o ConnectTimeout=5 \
                -o LogLevel=ERROR \
                -p "$SSH_PORT" liveuser@localhost "echo SSH_OK" 2>/dev/null; then
            sleep 5
            continue
        fi

        # Second check: is graphical session active?
        local session_status
        session_status=$(ssh_cmd "systemctl --user is-active graphical-session.target 2>/dev/null" 2>/dev/null) || true
        if [[ "$session_status" == "active" ]]; then
            gnome_ready=true
            break
        fi
        sleep 5
    done

    if ! $gnome_ready; then
        # Fallback: check if we can at least SSH in (GNOME might not use systemd targets)
        if ssh_cmd "echo FALLBACK_OK" 2>/dev/null; then
            warn "graphical-session.target not active, but SSH works. Checking D-Bus..."
            # Verify D-Bus session exists
            if ssh_cmd "test -S /run/user/\$(id -u)/bus && echo DBUS_OK" 2>/dev/null | grep -q "DBUS_OK"; then
                gnome_ready=true
                ok "D-Bus session available (fallback check)"
            fi
        fi
    fi

    if ! $gnome_ready; then
        err "GNOME session not ready within 600s"
        dump_failure_logs
        exit 1
    fi
    ok "GNOME session ready ($(( $(date +%s) - gnome_start ))s)"

    # Let the desktop and all services fully settle
    log "Waiting 30s for desktop services to stabilize..."
    sleep 30

    # ── Phase 2b+: Patch Anaconda efi.py for ostree bootloader install ──
    # On ostree live images, /boot/grub2 and /boot/efi/EFI/fedora don't exist
    # after rsync. gen_grub_cfgstub needs them for grub2-probe/grub2-mkrelpath.
    # Also, EFI binaries (shimx64.efi, grubx64.efi) are not copied to ESP.
    # Note: We patch efi.py (loaded by live Anaconda) instead of gen_grub_cfgstub
    # (which lives in the target sysroot, populated by rsync from read-only squashfs).
    log "Patching Anaconda efi.py for ostree bootloader compatibility..."
    ssh_cmd 'sudo python3 << '\''PYEOF'\''
import os, re

# Find efi.py
import pyanaconda.modules.storage.bootloader.efi as efi_mod
efi_py = efi_mod.__file__
print(f"Patching: {efi_py}")

with open(efi_py, "r") as f:
    content = f.read()

# Find the EFIGRUB.write_config method and replace the FULL method
# Fixes: 1) Missing /boot/grub2 and EFI dirs  2) Missing EFI binaries
#         3) grub2-mkconfig fails due to missing /sysroot in ostree rootfs
old = """    def write_config(self):
        rc = util.execWithRedirect(
            "gen_grub_cfgstub",
            [self.config_dir, self.efi_config_dir],
            root=conf.target.system_root,
        )

        if rc != 0:
            raise BootLoaderError("gen_grub_cfgstub script failed")

        super().write_config()"""

new = """    def write_config(self):
        # [naia] Create boot dirs and copy EFI binaries for ostree live installs
        import glob as _glob
        import shutil as _shutil
        _sysroot = conf.target.system_root
        for _d in [self.config_dir, self.efi_config_dir]:
            _fp = os.path.join(_sysroot, _d.lstrip("/"))
            os.makedirs(_fp, exist_ok=True)
            log.info("[naia] Created directory: %s", _fp)
        _efi_dir = os.path.join(_sysroot, self.efi_config_dir.lstrip("/"))
        for _pat, _name in [
            ("usr/lib/efi/shim/*/EFI/fedora/shimx64.efi", "shimx64.efi"),
            ("usr/lib/efi/grub2/*/EFI/fedora/grubx64.efi", "grubx64.efi"),
        ]:
            _dst = os.path.join(_efi_dir, _name)
            if not os.path.exists(_dst):
                for _src in _glob.glob(os.path.join(_sysroot, _pat)):
                    _shutil.copy2(_src, _dst)
                    log.info("[naia] Copied EFI binary: %s -> %s", _src, _dst)
                    break
        _boot_dir = os.path.join(os.path.dirname(_efi_dir), "BOOT")
        os.makedirs(_boot_dir, exist_ok=True)
        _bootx64 = os.path.join(_boot_dir, "BOOTX64.EFI")
        if not os.path.exists(_bootx64):
            for _src in _glob.glob(os.path.join(_sysroot, "usr/lib/efi/shim/*/EFI/BOOT/BOOTX64.EFI")):
                _shutil.copy2(_src, _bootx64)
                log.info("[naia] Copied EFI fallback: %s -> %s", _src, _bootx64)
                break
        # [naia] Create /sysroot symlink for grub2-probe compatibility
        # ostree systems have /sysroot as real root; grub2-probe expects it
        _sysroot_link = os.path.join(_sysroot, "sysroot")
        if not os.path.exists(_sysroot_link):
            try:
                os.symlink("/", _sysroot_link)
                log.info("[naia] Created /sysroot -> / symlink for grub2-probe")
            except OSError as e:
                log.warning("[naia] Could not create /sysroot symlink: %s", e)
        rc = util.execWithRedirect(
            "gen_grub_cfgstub",
            [self.config_dir, self.efi_config_dir],
            root=conf.target.system_root,
        )
        if rc != 0:
            raise BootLoaderError("gen_grub_cfgstub script failed")
        # [naia] Wrap super().write_config() (grub2-mkconfig) — may fail on ostree
        # due to /sysroot probe issues. CreateBLSEntriesTask will regenerate grub config.
        try:
            super().write_config()
        except BootLoaderError as _e:
            log.warning("[naia] grub2-mkconfig failed (expected on ostree): %s", _e)
            log.warning("[naia] Continuing — CreateBLSEntriesTask will regenerate grub config")"""

if old in content:
    content = content.replace(old, new)
    with open(efi_py, "w") as f:
        f.write(content)
    # Verify syntax
    import py_compile
    py_compile.compile(efi_py, doraise=True)
    print("Successfully patched efi.py")
else:
    print("ERROR: Could not find write_config pattern in efi.py")
    # Print around the method for debugging
    for i, line in enumerate(content.split("\n")):
        if "write_config" in line and "def " in line:
            print(f"  Found at line {i}: {line}")
PYEOF' 2>/dev/null && ok "Anaconda efi.py patched" || warn "efi.py patch failed"

    # ── Phase 2c: Run Anaconda via SSH ──
    log "Copying automation script to VM..."
    scp_to_vm "$WORKDIR/anaconda-automate.py" "/tmp/anaconda-automate.py"

    # Verify kickstart is accessible
    ssh_cmd "ls -la /run/initramfs/live/ks.cfg" 2>/dev/null && ok "Kickstart found on VM" || warn "Kickstart not at expected path"

    log "Launching Anaconda installer via SSH..."
    log "  (This runs in the GNOME session's D-Bus context)"

    # Run the Python automator via SSH with PTY
    # The script handles: launch anaconda → navigate spokes → begin install
    set +e
    ssh_cmd_t "export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/\$(id -u)/bus XDG_RUNTIME_DIR=/run/user/\$(id -u); python3 /tmp/anaconda-automate.py" &
    local ssh_automation_pid=$!
    set -e

    # ── Phase 2d: Wait for installation to complete ──
    log "Waiting for installation to complete..."
    log "  (VM will reboot on success → QEMU exits due to -no-reboot)"

    local install_done=false
    while kill -0 "$QEMU_PID" 2>/dev/null; do
        local elapsed=$(( $(date +%s) - install_start ))
        if [[ $elapsed -ge $INSTALL_TIMEOUT ]]; then
            err "Installation timed out after ${INSTALL_TIMEOUT}s"
            kill "$ssh_automation_pid" 2>/dev/null || true
            dump_failure_logs
            exit 1
        fi
        if (( elapsed % 60 == 0 )); then
            log "  ${elapsed}s elapsed..."
        fi

        # Check if Anaconda finished (before reboot)
        if ! $install_done; then
            if ssh_cmd "sudo grep -q 'The installation has finished' /tmp/anaconda.log" 2>/dev/null; then
                install_done=true
                ok "Anaconda installation finished, running post-install steps..."

                # ── Phase 2e: Post-install kernel + system fixups ──
                # kickstart %post doesn't run in --liveinst --text mode,
                # so we SCP a script and run it via SSH before triggering reboot.
                log "Running post-install fixups on target..."
                cat > "$WORKDIR/post-install.sh" <<'POSTSCRIPT'
#!/bin/bash
set -eu

SYSROOT="/var/mnt/sysroot"

# 1. Install kernel + initramfs + BLS entry
# Find a kernel version that has vmlinuz (not all module dirs have it)
KVER=""
for k in $(ls "$SYSROOT/usr/lib/modules/" | sort -rV); do
    if [ -f "$SYSROOT/usr/lib/modules/${k}/vmlinuz" ]; then
        KVER="$k"
        break
    fi
done
if [ -z "$KVER" ]; then
    echo "[naia] WARNING: No kernel with vmlinuz found in $SYSROOT/usr/lib/modules/"
    ls -la "$SYSROOT/usr/lib/modules/"*/vmlinuz 2>/dev/null || echo "  (no vmlinuz files)"
    exit 1
fi

echo "[naia] Installing kernel ${KVER} into target /boot/..."
sudo cp "$SYSROOT/usr/lib/modules/${KVER}/vmlinuz" "$SYSROOT/boot/vmlinuz-${KVER}"

echo "[naia] Generating initramfs with dracut (this takes a few minutes)..."
sudo chroot "$SYSROOT" dracut --force "/boot/initramfs-${KVER}.img" "${KVER}" 2>&1

echo "[naia] Creating BLS entry..."
sudo mkdir -p "$SYSROOT/boot/loader/entries"
MACHINE_ID=$(sudo cat "$SYSROOT/etc/machine-id")
ROOT_UUID=$(sudo chroot "$SYSROOT" findmnt -n -o UUID /)
sudo tee "$SYSROOT/boot/loader/entries/${MACHINE_ID}-${KVER}.conf" > /dev/null <<BLSEOF
title Naia OS (${KVER})
version ${KVER}
linux /vmlinuz-${KVER}
initrd /initramfs-${KVER}.img
options root=UUID=${ROOT_UUID} rootflags=subvol=root ro
BLSEOF

echo "[naia] Regenerating grub config..."
sudo chroot "$SYSROOT" grub2-mkconfig -o /boot/grub2/grub.cfg 2>&1 || true

echo "[naia] Kernel installation complete:"
ls -la "$SYSROOT/boot/vmlinuz-"* "$SYSROOT/boot/initramfs-"* 2>/dev/null
ls -la "$SYSROOT/boot/loader/entries/" 2>/dev/null

# 2. Disable greenboot + other ostree-only services (cause failures on non-ostree installs)
echo "[naia] Disabling ostree-only services..."
for svc in greenboot-healthcheck greenboot-task-runner greenboot-set-rollback-trigger \
           greenboot-grub2-set-counter greenboot-grub2-set-success greenboot-rpm-ostree-grub2-check-fallback \
           bootloader-update rpm-ostreed; do
    sudo chroot "$SYSROOT" systemctl disable "${svc}.service" 2>/dev/null || true
    sudo chroot "$SYSROOT" systemctl mask "${svc}.service" 2>/dev/null || true
done

# 3. Enable sshd for boot verification
echo "[naia] Enabling sshd..."
sudo chroot "$SYSROOT" systemctl enable sshd.service 2>/dev/null || true

# 4. Create E2E install marker (kickstart %post doesn't run in --liveinst mode)
echo "[naia] Creating E2E marker..."
echo "NAIA_E2E_INSTALL_COMPLETE=$(date -Iseconds)" | sudo tee "$SYSROOT/var/log/naia-e2e-marker" > /dev/null

# 5. Fix /home symlink (ostree uses /home -> /var/home, ensure it works)
if [ -L "$SYSROOT/home" ] && [ ! -d "$SYSROOT/var/home" ]; then
    sudo mkdir -p "$SYSROOT/var/home"
fi

echo "[naia] Post-install fixups complete"
POSTSCRIPT
                chmod +x "$WORKDIR/post-install.sh"
                scp_to_vm "$WORKDIR/post-install.sh" "/tmp/post-install.sh"
                ssh_cmd "bash /tmp/post-install.sh" 2>&1 && ok "Post-install fixups complete" || warn "Post-install fixups had issues"

                # Trigger reboot (QEMU will exit due to --no-reboot)
                log "Triggering VM reboot..."
                ssh_cmd "sudo systemctl reboot" 2>/dev/null || true
            fi
        fi

        sleep 10
    done

    wait "$QEMU_PID" 2>/dev/null || true
    local qemu_exit=$?
    QEMU_PID=""

    # Cleanup background processes
    kill "$ssh_automation_pid" 2>/dev/null || true
    kill "$SOCAT_PID" 2>/dev/null || true; SOCAT_PID=""
    if [[ -n "${TAIL_PID:-}" ]]; then kill "$TAIL_PID" 2>/dev/null || true; TAIL_PID=""; fi

    local install_duration=$(( $(date +%s) - install_start ))

    if $install_done; then
        ok "Installation completed in ${install_duration}s"
        INSTALL_RESULT="PASS"
        INSTALL_DURATION="$install_duration"
    elif [[ $qemu_exit -eq 0 ]]; then
        ok "Installation completed in ${install_duration}s"
        INSTALL_RESULT="PASS"
        INSTALL_DURATION="$install_duration"
    else
        fail "Installation failed (QEMU exit code: $qemu_exit, ${install_duration}s)"
        INSTALL_RESULT="FAIL"
        INSTALL_DURATION="$install_duration"
        dump_failure_logs
        exit 1
    fi
}

# ── Phase 3: Boot Verification ───────────────────────────────────────────────

run_boot_verification() {
    bold "=== Phase 3: Boot Verification ==="

    if $SKIP_VERIFY; then
        warn "Skipped (--skip-verify)"
        BOOT_RESULT="SKIP"; BOOT_DURATION="0"
        SMOKE_RESULT="SKIP"; SMOKE_TOTAL="0"; SMOKE_PASSED="0"
        return
    fi

    local disk="$WORKDIR/disk.qcow2"
    local efivars="$WORKDIR/efivars.fd"
    local serial_log="$WORKDIR/boot-serial.log"

    # Find free SSH port for boot phase
    local boot_ssh_port
    boot_ssh_port=$(find_free_port "$SSH_PORT")

    local kvm_flag=""
    if [[ -r /dev/kvm ]]; then kvm_flag="-enable-kvm"; fi

    log "Booting installed system (SSH port $boot_ssh_port)..."
    local boot_start
    boot_start=$(date +%s)

    qemu-system-x86_64 \
        $kvm_flag \
        -machine q35 \
        -cpu host \
        -smp "$QEMU_SMP" \
        -m "$QEMU_MEM" \
        -drive "if=pflash,format=raw,readonly=on,file=$OVMF_CODE" \
        -drive "if=pflash,format=raw,file=$efivars" \
        -drive "file=$disk,format=qcow2,if=virtio" \
        -boot c \
        -netdev "user,id=net0,hostfwd=tcp::${boot_ssh_port}-:22" \
        -device virtio-net-pci,netdev=net0 \
        -display none \
        -serial "file:$serial_log" \
        -no-reboot &

    QEMU_PID=$!

    # Wait for SSH with testuser (created by kickstart)
    log "Waiting for SSH (testuser)..."
    local ssh_ready=false
    local ssh_opts="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -o LogLevel=ERROR"

    while (( $(date +%s) - boot_start < SSH_TIMEOUT )); do
        if sshpass -p "naia-e2e-test" ssh $ssh_opts -p "$boot_ssh_port" testuser@localhost "echo ok" 2>/dev/null; then
            ssh_ready=true
            break
        fi
        sleep 5
    done

    local boot_duration=$(( $(date +%s) - boot_start ))

    if ! $ssh_ready; then
        fail "SSH not available after ${SSH_TIMEOUT}s"
        BOOT_RESULT="FAIL"; BOOT_DURATION="$boot_duration"
        SMOKE_RESULT="FAIL"; SMOKE_TOTAL="0"; SMOKE_PASSED="0"
        kill "$QEMU_PID" 2>/dev/null || true; wait "$QEMU_PID" 2>/dev/null || true; QEMU_PID=""
        dump_failure_logs
        return
    fi

    ok "VM booted, SSH ready (${boot_duration}s)"
    BOOT_RESULT="PASS"; BOOT_DURATION="$boot_duration"

    # Run smoke tests
    run_smoke_tests "$boot_ssh_port"

    # Shutdown
    sshpass -p "naia-e2e-test" ssh $ssh_opts -p "$boot_ssh_port" testuser@localhost "sudo poweroff" 2>/dev/null || true
    local wait_ct=0
    while kill -0 "$QEMU_PID" 2>/dev/null && (( wait_ct < 30 )); do sleep 2; wait_ct=$((wait_ct+2)); done
    kill "$QEMU_PID" 2>/dev/null || true; wait "$QEMU_PID" 2>/dev/null || true; QEMU_PID=""
}

run_smoke_tests() {
    local port="$1"
    local ssh_opts="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -o LogLevel=ERROR"
    local passed=0 total=0

    log "Running smoke tests..."

    run_test() {
        local name="$1" cmd="$2"
        total=$(( total + 1 ))
        local output
        if output=$(sshpass -p "naia-e2e-test" ssh $ssh_opts -p "$port" testuser@localhost "$cmd" 2>&1); then
            ok "  [$total] $name"
            passed=$(( passed + 1 ))
            $VERBOSE && [[ -n "$output" ]] && echo "      $output"
        else
            fail "  [$total] $name"
            [[ -n "$output" ]] && echo "      $output"
        fi
    }

    run_test "E2E install marker"    "cat /var/log/naia-e2e-marker"
    run_test "OS release"            "cat /etc/os-release | head -5"
    run_test "BTRFS root"            "findmnt -t btrfs / -n"
    run_test "UEFI bootloader"       "test -d /sys/firmware/efi && efibootmgr 2>/dev/null | head -5 || (test -d /boot/efi/EFI && ls /boot/efi/EFI/)"
    run_test "Network (DNS)"         "getent hosts fedoraproject.org"
    run_test "Systemd operational"   "state=\$(systemctl is-system-running 2>/dev/null); echo \"\$state\"; [ \"\$state\" = running ] || [ \"\$state\" = degraded ]"

    SMOKE_PASSED="$passed"; SMOKE_TOTAL="$total"
    [[ $passed -eq $total ]] && SMOKE_RESULT="PASS" || SMOKE_RESULT="FAIL"
}

# ── Phase 4: Results ─────────────────────────────────────────────────────────

print_results() {
    echo ""
    bold "=== Naia OS E2E Installation Test ==="
    echo ""

    local c
    [[ "${INSTALL_RESULT:-FAIL}" == "PASS" ]] && c="$GREEN" || c="$RED"
    printf "  Installation:  ${c}%s${NC} (%ss)\n" "${INSTALL_RESULT:-FAIL}" "${INSTALL_DURATION:-?}"

    case "${BOOT_RESULT:-FAIL}" in
        PASS) c="$GREEN" ;; SKIP) c="$YELLOW" ;; *) c="$RED" ;;
    esac
    printf "  Boot:          ${c}%s${NC} (%ss)\n" "${BOOT_RESULT:-FAIL}" "${BOOT_DURATION:-?}"

    case "${SMOKE_RESULT:-FAIL}" in
        PASS) c="$GREEN" ;; SKIP) c="$YELLOW" ;; *) c="$RED" ;;
    esac
    printf "  Smoke Tests:   ${c}%s${NC} (%s/%s)\n" "${SMOKE_RESULT:-FAIL}" "${SMOKE_PASSED:-0}" "${SMOKE_TOTAL:-0}"

    echo ""
    log "Logs: $WORKDIR"
    echo ""

    if [[ "${INSTALL_RESULT:-FAIL}" == "PASS" ]] && \
       [[ "${BOOT_RESULT:-FAIL}" != "FAIL" ]] && \
       [[ "${SMOKE_RESULT:-FAIL}" != "FAIL" ]]; then
        ok "Overall: PASS"
        return 0
    else
        fail "Overall: FAIL"
        return 1
    fi
}

# ── Failure Diagnostics ──────────────────────────────────────────────────────

dump_failure_logs() {
    echo ""
    bold "=== Failure Diagnostics ==="

    for logfile in "$WORKDIR/install-serial.log" "$WORKDIR/boot-serial.log"; do
        if [[ -f "$logfile" ]]; then
            echo ""
            log "Last 50 lines of $(basename "$logfile"):"
            echo "---"
            tail -50 "$logfile"
            echo "---"
        fi
    done

    # Try to fetch anaconda log from VM (if still running)
    if [[ -n "${QEMU_PID:-}" ]] && kill -0 "$QEMU_PID" 2>/dev/null; then
        local anaconda_log
        anaconda_log=$(ssh_cmd "cat /tmp/anaconda-e2e.log 2>/dev/null" 2>/dev/null) || true
        if [[ -n "$anaconda_log" ]]; then
            echo ""
            log "Anaconda E2E log (last 30 lines):"
            echo "---"
            echo "$anaconda_log" | tail -30
            echo "---"
        fi
    fi

    echo ""
    log "Workdir preserved: $WORKDIR"
    KEEP_WORKDIR=true
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
    parse_args "$@"
    trap cleanup EXIT

    echo ""
    bold "Naia OS E2E Installation Test (VNC Graphics Mode)"
    log "ISO: $ISO_PATH"
    log "Workdir: $WORKDIR"
    echo ""

    check_prerequisites
    echo ""

    patch_iso_with_kickstart
    echo ""

    run_installation
    echo ""

    run_boot_verification
    echo ""

    print_results
}

main "$@"
