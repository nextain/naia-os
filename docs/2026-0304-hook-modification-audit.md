# hook-post-rootfs.sh 수정 전체 감사 (Audit)

- **날짜**: 2026-03-04
- **목적**: 우리가 원본(Bazzite/Anaconda)에 가한 모든 수정을 파악하고, 근본 원인 분석

## 근본 원인 (Root Cause)

**원본 Bazzite(titanoboa)는 `ostreecontainer` transport로 설치한다.**
우리 hook은 이 핵심 라인을 빠뜨려서 rsync(LiveImagePayload) 경로로 설치됨.
rsync 경로의 부작용을 패치(3b~3f)로 계속 쌓아올린 것이 모든 문제의 원인.

---

## 삭제 대상 (rsync 땜질 — 전부 불필요)

ostreecontainer 복원 시 **전량 삭제**. 검토 불필요.

| 섹션 | 줄 수 | 대상 파일 | 내용 | 삭제 이유 |
|------|-------|----------|------|----------|
| **3b** | 139-323 | `installation.py` 패치 | rsync `raise_on_nozero=False` + `_fixup_ostree_symlinks()` + rsync 2nd pass | rsync 안 씀 |
| **3c** | 325-406 | `gen_grub_cfgstub` 전체 교체 | 디렉토리 생성 + EFI 바이너리 복사 | ostree가 부트 관리 |
| **3d** | 408-506 | `efi.py` 패치 | EFI 디렉토리/바이너리 + /sysroot 심볼릭 + grub2-mkconfig 실패 무시 | ostree가 부트 관리 |
| **3e** | 508-568 | `post-install-kernel.sh` (신규) | kickstart %post용 kernel-install | ostree가 커널 관리 |
| **3f** | 570-585 | systemd 서비스 mask | greenboot, bootloader-update 비활성화 | ostree 시스템에서 필요한 서비스 |

**관련 파일도 삭제/수정:**
- `e2e-install.ks` %post의 kernel-install 워크어라운드 (lines 38-67) — 삭제

**관련 커밋 (모두 rsync 땜질):**
```
48723fc fix(installer): complete bootloader chain for ostree live image installs
65cecd6 fix(installer): patch gen_grub_cfgstub for ostree live image bootloader
05ef0cf fix(iso): tolerate rsync exit code 23 so ostree symlink fixup can run
32bed3f fix(iso): patch Anaconda rsync to handle ostree symlink vs BTRFS subvolume conflict
```

---

## 추가 대상 (원본 titanoboa 패턴 복원)

원본 hook(135줄)에 있지만 우리에게 없는 것. **원본 그대로 따라감.**

| 항목 | 원본 코드 | 설명 |
|------|----------|------|
| `ostreecontainer` kickstart | `ostreecontainer --url=$imageref:$imagetag --transport=containers-storage --no-signature-verification` → `interactive-defaults.ks` | **핵심 누락** |
| post-script: bootc switch | `bootc switch --mutate-in-place --enforce-container-sigpolicy --transport registry` | 설치 후 서명된 이미지로 전환 |
| post-script: flatpak rsync | `rsync -aAXUHKP /var/lib/flatpak "$target"` (ostree deploy 경로) | flatpak을 설치된 시스템에 복사 |
| post-script: secureboot | `mokutil --import` (sb_pubkey.der) | SecureBoot 키 등록 |
| post-script: disable fedora flatpak | `systemctl disable flatpak-add-fedora-repos.service` | fedora flatpak 저장소 비활성화 |
| `[Payload] flatpak_remote` | `/etc/anaconda/conf.d/anaconda.conf`에 `flatpak_remote = flathub` | Anaconda flatpak 소스 설정 |
| image-info.json 수정 | `image-ref` → `ghcr.io/nextain/naia-os`, `image-name` → `naia-os` | ostreecontainer URL 참조 |
| os-release 강제 | `ID=fedora`, `VARIANT_ID=kinoite` | Anaconda profile detection용 |
| naia.conf base_profile | `base_profile = fedora-kinoite` | fedora 설정 체인 상속 |
| secureboot 키 다운로드 | `curl -Lo /run/install/repo/sb_pubkey.der` | enrollment에 필요 |
| anaconda-webui 설치 | `mkdir -p /var/lib/rpm-state && dnf install -y anaconda-webui` (F42+) | WebUI 명시적 설치 |

---

## 유지 대상 (브랜딩/라이브 세션 — 안전 영역)

| 섹션 | 내용 | 비고 |
|------|------|------|
| 1 | Anaconda + Firefox 설치, 브랜딩 에셋 복사 | 원본도 같은 패턴 |
| 2 | Anaconda profile (naia.conf) | base_profile 추가 필요 |
| 3 | liveinst wrapper (프로세스 정리) | 유지 (ostreecontainer에서도 유용) |
| 3g | Plymouth naia 테마 + start-here 아이콘 | 유지 (dracut 삭제 — 원본에 없고 podman rootfs에서 실행 불가) |
| 3h | Steam autostart 제거 | 유지 |
| 4 | KDE 작업표시줄 핀 | 유지 |
| 5 | Kickoff 즐겨찾기 | 유지 |
| 6 | fcitx5 한국어 입력 | 유지 |
| 7 | 라이브 배경화면 | 유지 |
| 8 | 라이브 세션 경고 다이얼로그 | 유지 |
| 9 | Naia Shell Flatpak 설치 | 유지 |
| 10 | DNS fallback | 유지 |
| 11 | Wi-Fi power save off | 유지 |
| 12 | fcitx5 환경변수 | 유지 |
| 12b | /run 확장 서비스 | 유지 |
| 13 | Cleanup | 유지 |

### 유지 영역 발견 사항 (경미)

| 항목 | 섹션 | 내용 | 심각도 |
|------|------|------|--------|
| K | 6 | kwinrc에 `[Wayland]` 섹션 `cat >>`로 추가 — 기존 섹션 있으면 중복 | 낮음 |
| L | 10 | DNS 설정 3가지 방법 동시 사용 — 방법 3이 1-2를 덮어씀 | 낮음 |
| M | 1 | `dnf install || true`가 핵심 패키지 실패도 삼킴 — 분리 설치 필요 | 중간 |
| P | 3g | start-here 아이콘 convert 폴백이 `.png` 참조하지만 실제 에셋은 `.svg` | 낮음 |
| Q | branding.sh | fcitx5 profile을 `/usr/etc/skel/.config/fcitx5-profile`에 쓰지만 fcitx5는 `fcitx5/profile` (디렉토리) 경로를 읽음 — dead code | 낮음 |

---

## 참조

- 원본 hook: `/var/home/luke/dev/titanoboa/.github/workflows/ci_dummy_hook_postrootfs.sh` (135줄)
- 우리 hook: `/var/home/luke/dev/naia-os/installer/hook-post-rootfs.sh` (905줄 → 삭제 후 ~450줄)
- branding.sh: `/var/home/luke/dev/naia-os/config/scripts/branding.sh`
