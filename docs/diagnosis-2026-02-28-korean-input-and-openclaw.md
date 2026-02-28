# Naia OS Issue Diagnosis Report (2026-02-28)

## Issues Investigated

1. **Terminal Korean input composition (moasseugi) not working**
2. **Naia Shell OpenClaw gateway failing to start**

---

## Issue 1: Terminal Korean Input Composition (Hangul Moasseugi)

### Symptoms
- Korean input works in GUI apps (Chrome, etc.) but NOT in terminal (Konsole)
- Characters appear individually instead of composing (e.g., `ㅎ ㅏ ㄴ` instead of `한`)
- Boot warning: "Detect GTK_IM_MODULE and QT_IM_MODULE being set and Wayland Input method frontend is working"

### Root Cause

**`GTK_IM_MODULE` and `QT_IM_MODULE` environment variables were set globally, which overrides fcitx5's Wayland-native input frontend.**

On Wayland (KDE Plasma), fcitx5 uses the **Wayland Input Method v2 protocol** for text input. When `GTK_IM_MODULE=fcitx` or `QT_IM_MODULE=fcitx` is set, it forces applications to use the **legacy X11 IM module** instead, which:

1. Bypasses the Wayland-native input path
2. Breaks Korean character composition in terminal emulators (Konsole uses Qt's Wayland text-input)
3. Triggers the diagnostic warning from fcitx5

Additionally, `GLFW_IM_MODULE` was set to `ibus` (typo, should be `fcitx`).

Reference: https://fcitx-im.org/wiki/Using_Fcitx_5_on_Wayland#KDE_Plasma

### Affected Files & Changes

| File | Change |
|------|--------|
| `config/files/usr/etc/profile.d/fcitx5.sh` | Removed global `GTK_IM_MODULE`/`QT_IM_MODULE`. Now only set on `XDG_SESSION_TYPE=x11`. Fixed `GLFW_IM_MODULE=ibus` -> `fcitx` |
| `installer/hook-post-rootfs.sh` (lines 320-325) | Removed `GTK_IM_MODULE`/`QT_IM_MODULE` from `/etc/environment.d/input-method.conf`. Only `XMODIFIERS` and `INPUT_METHOD` remain. |

### Correct Configuration (Wayland)

```sh
# These should be set:
export INPUT_METHOD=fcitx
export XMODIFIERS=@im=fcitx
export SDL_IM_MODULE=fcitx
export GLFW_IM_MODULE=fcitx

# These should NOT be set on Wayland (only on X11):
# export GTK_IM_MODULE=fcitx   # breaks Wayland text-input
# export QT_IM_MODULE=fcitx    # breaks Wayland text-input
```

### Verification
- fcitx5 is running and has Hangul (Dubeolsik) configured as default IM
- KDE kwinrc has `InputMethod=/usr/share/applications/org.fcitx.Fcitx5.wayland.desktop`
- `naia-fcitx5-setup` autostart script correctly configures per-user fcitx5 profile

---

## Issue 2: OpenClaw Gateway Startup Failure

### Symptoms
- Gateway never becomes healthy (60s timeout)
- Infinite restart loop creating zombie processes
- Agent logs: "Gateway not healthy after 60s -- skipping Node Host spawn"
- Chat works but gateway-dependent features (tools, Discord DM, etc.) are unavailable

### Root Cause

**`gateway.mode` field missing from `~/.openclaw/openclaw.json`, AND the installed Flatpak binary doesn't pass `--allow-unconfigured` to the gateway process.**

The gateway startup logic requires either:
1. `gateway.mode=local` in the config file, OR
2. `--allow-unconfigured` CLI flag

The installed binary (compiled before the latest source fixes) had **neither**:
- `ensure_openclaw_config()` function (which patches `gateway.mode`) was added after the binary was compiled
- `--allow-unconfigured` flag was also added after the binary was compiled
- The config file was created by a `sync_openclaw_config` call that didn't include `gateway.mode`

### Gateway Error Log
```
Gateway start blocked: set gateway.mode=local (current: unset) or pass --allow-unconfigured.
```

### Timeline
1. Naia starts, spawns gateway without `--allow-unconfigured`
2. Gateway reads config, finds no `gateway.mode`
3. Gateway exits immediately with "blocked" error
4. Naia waits 60s for health check, fails
5. After 3 more health check failures (90s), auto-restarts gateway
6. Repeat infinitely, creating zombie processes

### Resolution

**Runtime fix (immediate):**
- Added `gateway.mode: "local"`, `port: 18789`, `bind: "loopback"`, `auth: { mode: "token" }` to `~/.openclaw/openclaw.json`
- Restarted Naia -> Gateway started successfully

**Source fixes (for next build):**
| File | Change |
|------|--------|
| `config/systemd/naia-gateway.service` | Added `--allow-unconfigured` to ExecStart |
| `shell/src-tauri/src/lib.rs` (already in source) | `ensure_openclaw_config()` function patches missing `gateway.mode` |
| `shell/src-tauri/src/lib.rs` (already in source) | `--allow-unconfigured` flag in `spawn_gateway()` |
| `shell/src-tauri/src/lib.rs` (already in source) | Defense-in-depth in `sync_openclaw_config()` |

### Verification (E2E)
```
PASS: Gateway health check returns HTTP 200
PASS: Port 18789 is listening
PASS: gateway.mode=local present in config
PASS: Naia agent is running
PASS: Gateway recovered successfully
```

---

## E2E Test Results Summary

| # | Test | Result |
|---|------|--------|
| 1 | OpenClaw Gateway Health (HTTP 200) | PASS |
| 2 | Gateway Port 18789 Listening | PASS |
| 3 | No Zombie Processes | PASS |
| 4 | Config gateway.mode=local | PASS |
| 5 | Naia Agent Running | PASS |
| 6 | Gateway Recovery Confirmed | PASS |
| 7 | Fcitx5 Running | PASS |
| 8 | fcitx5.sh Wayland-conditional GTK/QT_IM | PASS |
| 9 | GLFW_IM_MODULE=fcitx (was ibus) | PASS |
| 10 | Systemd --allow-unconfigured | PASS |

---

## Recommendations for Bazzite PR

1. **Korean input**: The `GTK_IM_MODULE`/`QT_IM_MODULE` removal is the key fix. Bazzite already ships fcitx5 but sets these X11 variables globally, which breaks Wayland input. The PR should condition these on `XDG_SESSION_TYPE`.

2. **OpenClaw**: The source already has the fixes (`ensure_openclaw_config`, `--allow-unconfigured`). The next Flatpak build will include them. The systemd service fix is an additional safety net for non-Flatpak installs.

3. **Build verification**: The Flatpak binary must be rebuilt from the latest source to include `ensure_openclaw_config()` and `--allow-unconfigured` in the compiled Rust binary.
