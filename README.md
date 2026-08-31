# Naia OS image

The Bazzite-based boot image and live ISO that ship Naia Shell as the desktop.

This repository is the distribution layer only. The shell itself lives in
[`nextain/naia-shell`](https://github.com/nextain/naia-shell) and arrives here
as a published release RPM — that release asset URL is the entire interface
between the two.

**The build automation lives in `naia-shell`, not here.** `SIGNING_SECRET` — the
private half of `cosign.pub` — is a secret of that repository and cannot be read
back out, and it exists nowhere else. An image signed with any other key would be
rejected by every machine in the field. So the `Naia OS image`, `Naia OS ISO` and
`Naia OS ISO promote` workflows run there and check this repository out. This
repository holds no credentials and needs none.

## How a build flows

```
naia-shell release          this repository                users
─────────────────           ───────────────                ─────
Naia-X.Y.Z-1.x86_64.rpm  →  recipes/recipe.yml          
   (prerelease asset)          rpm-ostree layers it
                              config/files → /usr
                              branding.sh
                              /usr/libexec/naia-verify-image   ← hard gate
                                       ↓
                            ghcr.io/nextain/naia-os:latest  →  rpm-ostree update
                                       ↓
                            titanoboa live ISO           →  R2 download
```

## Three things that must not change casually

**The image name.** Installed machines track
`ostree-image-signed:docker://ghcr.io/nextain/naia-os:latest`. Renaming the
image orphans every machine in the field.

**The cosign key.** Those same machines pin this repository to the public key in
`cosign.pub` through `/etc/containers/policy.json`. Rotating it makes every
update fail signature verification. The private half is the `SIGNING_SECRET`
repository secret.

**The shell RPM URL pin.** `recipes/recipe.yml` names an exact release tag, never
`:latest`. An image has to be able to say which shell version it shipped.
Bumping the shell means editing that one URL and
`config/files/usr/share/naia/naia-os-version`.

## Why the shell is an RPM and not a Flatpak

It used to be a Flatpak bundle downloaded into `/usr/share/naia/` and installed
on first boot. That path carried a Flatpak manifest, a `shared-modules`
submodule, a hand-written `libvosk.so` install rule, and a runtime dependency on
`org.gnome.Platform` — and it fought the sandbox over the things the shell
actually does: spawning PTYs, embedding Chrome over CDP, reaching the GPU.

In an image where Naia *is* the desktop, the sandbox buys nothing. `rpm-ostree`
layering is the base system's own mechanism, and the RPM already ships
`libvosk.so` with a `RUNPATH` that resolves it. The Flatpak path stays relevant
only if Naia is ever published on Flathub, which is a separate concern.

## The gate

`config/files/usr/libexec/naia-verify-image` asserts that the image contains what
it claims: the layered RPM, an executable `naia-shell` whose libraries all
resolve, the desktop entry the taskbar pin points at, the rebranded os-release,
every installer asset the ISO hook reads, and no leftover Flatpak app IDs.

Nothing in it ends in `|| true`. That is deliberate. The pipeline it replaces
installed the shell with `flatpak install ... || true`, so an ISO that shipped
with no shell at all still reported success, and the failure only surfaced when
someone booted it.

It runs three times: during the image build, against the published image, and
again before the ISO build spends forty minutes wrapping an image around it. It
takes a `ROOT=` prefix so the same predicate can be run against a fixture tree.

## Layout

| path | what it is |
| --- | --- |
| `recipes/recipe.yml` | BlueBuild recipe — base image, layered packages, module order |
| `config/files/usr/` | everything copied verbatim into `/usr` |
| `config/scripts/` | build-time scripts, in the order the recipe lists them |
| `installer/hook-post-rootfs.sh` | titanoboa hook — Anaconda, branding, live session |
| `installer/flatpaks` | Flatpaks preinstalled into the live session |
| `cosign.pub` | image signing public key — must match what installed machines pin |
| `assets/` | source branding assets (also baked into the image under `/usr/share/naia/assets`) |

## Module order is load-bearing

`files` runs before every script. `branding.sh` reads what it delivers — the
version file, the `start-here` icon sizes it symlinks over Bazzite's, the
Plymouth theme directory. In the previous ordering those reads sat behind
`if [ -f ... ]` guards against files that did not exist yet, so they silently did
nothing and the build stayed green.

## The ISO does not go public on its own

`Naia OS ISO` publishes each build under `builds/<version>.<stamp>/` and stops.
The public download keeps serving the previous ISO until a person runs
`Naia OS ISO promote` — which refuses to run unless they confirm they booted the
build and saw the Naia window render.

That confirmation is not ceremony. Until the session environment set the GTK
backend, the shell forced itself onto X11 under KDE Wayland and its main window
mapped at 1x1: the app ran, the agent connected, the sidecar came up, every log
line was clean, and the screen was empty. Measured on real hardware, not
inferred — 1x1 before the fix, a rendered window after. No file-level check sees
the difference.
