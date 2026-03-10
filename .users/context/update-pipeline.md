# Update Pipeline

## App Updates (Naia Shell)

Naia Shell has an in-app auto-updater powered by the Tauri updater plugin.

### How It Works

```
GitHub Release tagged (v*)
  ↓
CI builds AppImage with Ed25519 signing
  ↓
latest.json uploaded to Release assets
  ↓
App checks: GET /releases/latest/download/latest.json
  ↓ update available
Banner notification in app → "Update Now" / "View Details" / "Later"
  ↓ user clicks "Update Now"
Download + verify signature → install → relaunch
```

### Key Files
- `shell/src/lib/updater.ts` — Update check logic (dynamic import for Flatpak compatibility)
- `shell/src/components/UpdateBanner.tsx` — Notification banner UI
- `shell/src/components/SettingsTab.tsx` — VersionFooter (manual check button)
- `shell/src-tauri/src/lib.rs` — Conditional plugin registration (`FLATPAK=1` → skip updater)
- `shell/src-tauri/tauri.conf.json` — Updater endpoint, public key, and `createUpdaterArtifacts: true`
- `.github/workflows/release-app.yml` — Signing, latest.json generation, itch.io push
- `releases/v*.yaml` — Centralized multilingual changelog with optional `issue` field (consumed by CI, web, and in-app)
- `CHANGELOG.md` / `CHANGELOG.ko.md` — Language-specific changelogs generated from releases/*.yaml, with GitHub issue links

### Changelog Flow
`releases/v*.yaml` is the single source for changelog data. It feeds three consumers:
1. **CI** (`.github/workflows/release-app.yml`) — renders release notes with issue links on GitHub Release
2. **Web** (`naia.nextain.io/download`) — shows latest 2 releases with issue links; "View all" → language-specific CHANGELOG on GitHub
3. **CHANGELOG.md** / **CHANGELOG.ko.md** — full history in Markdown with issue links, linked from web

### Signing
Ed25519 signing via `tauri-plugin-updater`. Key must be generated with a non-empty password (empty password causes GitHub Actions issues). Required secrets: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Key backup: `~/.tauri/naia.key` + `my-envs/tauri-signing.key`.

### Flatpak Exception
Flatpak manages its own updates. When `FLATPAK=1` environment variable is set, the Tauri updater plugin is not registered. The JS side uses `try-catch` with dynamic `import()` to gracefully handle the missing plugin.

### Manual Check
Users can check for updates manually in Settings → bottom of page → "Check for Updates" button.

---

## OS Updates (bootc)

### How Updates Work

Naia OS is built on [Bazzite](https://github.com/ublue-os/bazzite) (Fedora Atomic). Your system receives updates through **atomic container image deployments**, not traditional package upgrades.

### Update Flow

```
Bazzite publishes new base image
  ↓ (every Wednesday, automatic rebuild)
Naia container rebuilt on top of Bazzite (BlueBuild)
  ↓
Container smoke test (verify packages, branding, Naia Shell)
  ↓ pass
Push to GHCR (ghcr.io/nextain/naia-os:latest)
  ↓                              ↓
ISO rebuilt + uploaded to R2     Installed systems: bootc update
```

### What We Customize (Our Overlay)

| Category | What | Risk to Boot |
|----------|------|-------------|
| Packages | fcitx5 (Korean input), fonts, jq, sqlite, podman | None — standard Fedora packages |
| Naia Shell | Flatpak app (sandboxed, independent update) | None — runs in Flatpak sandbox |
| Branding | os-release, wallpaper, login screen, Plymouth theme | None — cosmetic only |
| KDE Config | Taskbar pins, kickoff icon, wallpaper setting | None — user-session scope |
| Autostart | Naia Shell XDG autostart entry | None — app launch only |

**We never touch:** kernel, initrd, bootloader, systemd core, SELinux policy, ostree/bootc internals.

## Safety Guarantees

### Atomic Updates
New images deploy alongside the current one. The switch happens at reboot. If deployment fails, the old image remains untouched.

### Automatic Rollback
Every update keeps the previous deployment. If the new image fails to boot:
1. Reboot the machine
2. In GRUB menu, select the previous entry
3. System boots with the last known-good image

### Container Smoke Test
Every build runs automated checks before deployment:
- Required packages installed (fcitx5, fonts)
- Branding applied (os-release says "Naia")
- Naia Shell bundle present
- KDE Plasma scripts in place
- Autostart entry exists

If any check fails, the build is marked as failed and no ISO is generated.

### ISO Rollback
Before uploading a new ISO to the download server (R2), the previous version is backed up to `previous/`. If a bad ISO is published, it can be rolled back immediately.

## Testing Tiers

| Tier | What | Automated | When |
|------|------|-----------|------|
| 1. Container Smoke | Package/branding/file verification | Yes (CI) | Every build |
| 2. ISO Boot | QEMU boot test | Semi-auto | Major changes |
| 3. Manual Verify | VNC install + feature check | Manual | Fedora version bumps |
| 4. Update Path | bootc upgrade + reboot on real VM | Manual | Before enabling auto-update |

## Known Risks

### Bazzite Breaking Change (Medium)
If Bazzite pushes a broken base image, our weekly rebuild will pick it up. Container smoke test catches package/config issues, but subtle runtime breakages may pass through. ostree rollback provides recovery.

### .origin File Format Change (High, ISO-only)
The ISO installer uses `sed` to set the container image reference in ostree's `.origin` file. If bootc changes the format, installation may fail. This only affects new installations, not updates to existing systems.

### KDE Config Conflict (Low)
If Bazzite changes KDE defaults, our Plasma update scripts may conflict. Our scripts use `naia-*` prefix and run in user-session scope, minimizing collision risk.

### Plymouth Theme Revert (Low)
Plymouth boot theme may revert to Bazzite after updates (requires initrd regeneration). Visual-only issue — does not affect boot functionality.

## For Users

### How to Update
On an installed Naia OS system:
```bash
# Check for updates
sudo bootc upgrade --check

# Apply update (takes effect on next reboot)
sudo bootc upgrade
```

### How to Rollback
If an update causes issues:
1. Reboot your machine
2. In the GRUB boot menu, select the previous deployment
3. Your system will boot with the previous working version

### Checking Current Version
```bash
# See OS version
cat /etc/os-release | grep PRETTY_NAME

# See container image info
cat /usr/share/ublue-os/image-info.json
```
