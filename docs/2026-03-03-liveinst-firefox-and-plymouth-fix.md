# Install to Hard Drive 실패 및 부팅 로고 미변경 수정

**날짜**: 2026-03-03
**영향 범위**: 라이브 USB 설치 + 부팅 브랜딩

---

## 문제 1: "Install to Hard Drive" 클릭 시 설치가 실행되지 않음

### 증상
바탕화면의 "Install to Hard Drive" 아이콘을 클릭해도 Anaconda 설치 프로그램이 표시되지 않고 즉시 종료됨.

### 근본 원인
Anaconda WebUI는 `/usr/libexec/anaconda/webui-desktop` 스크립트에서 Firefox를 실행하여 설치 UI를 표시한다.
이 스크립트에 Firefox 경로가 **하드코딩**되어 있다:

```bash
BROWSER=(/usr/bin/env "${BROWSER_ENV[@]}" /usr/bin/firefox --new-instance ...)
```

`hook-post-rootfs.sh`에서 `dnf install -y firefox`를 시도하지만, Bazzite 기반 이미지는 Firefox RPM 대신 **Flatpak Firefox**(`org.mozilla.firefox`)를 제공한다. Bazzite의 RPM 저장소 설정이 Firefox RPM 설치를 차단하거나, 이미지 빌드 과정에서 제거될 수 있다.

결과적으로 `/usr/bin/firefox` 바이너리가 존재하지 않아 다음 오류 발생:
```
env: '/usr/bin/firefox': No such file or directory
```

### 수정 내용

**`installer/hook-post-rootfs.sh`** — Firefox RPM 설치 실패 시 Flatpak Firefox 래퍼 생성:

```bash
# dnf install firefox가 실패해도 전체 빌드가 중단되지 않도록 || true 추가
dnf install -y --allowerasing ... firefox || true

# Firefox RPM이 없으면 Flatpak Firefox를 호출하는 래퍼 스크립트 생성
if [ ! -x /usr/bin/firefox ]; then
    cat > /usr/bin/firefox <<'FIREFOXWRAP'
#!/bin/bash
exec flatpak run \
    --filesystem=/run/user \
    --filesystem=/tmp \
    --filesystem=/run/anaconda \
    org.mozilla.firefox "$@"
FIREFOXWRAP
    chmod +x /usr/bin/firefox
fi
```

래퍼 스크립트의 `--filesystem` 옵션이 중요한 이유:
- `/run/user` — Anaconda가 생성하는 Firefox 커스텀 프로필 경로 (`/run/user/1000/anaconda/firefox-profile`)
- `/tmp` — Anaconda 임시 파일 및 Wayland 소켓 정보
- `/run/anaconda` — Anaconda 백엔드 통신 파일

### 라이브 시스템 즉시 수정 방법
```bash
sudo tee /usr/bin/firefox > /dev/null <<'EOF'
#!/bin/bash
exec flatpak run \
    --filesystem=/run/user \
    --filesystem=/tmp \
    --filesystem=/run/anaconda \
    org.mozilla.firefox "$@"
EOF
sudo chmod +x /usr/bin/firefox
```

---

## 문제 2: 부팅 시 Bazzite 로고가 여전히 표시됨

### 증상
1. **부팅 초기 하단**: 가로로 긴 "Bazzite" 텍스트 로고 (Plymouth spinner 테마의 `watermark.png`)
2. **부팅 중앙**: 동그란 Bazzite 스피너 애니메이션 (Plymouth spinner 테마의 `animation-*.png`)

Naia Plymouth 테마 파일(`/usr/share/plymouth/themes/naia/`)은 시스템에 존재하지만, 부팅 시 적용되지 않았다.

### 근본 원인

Plymouth 테마 변경에는 두 가지 작업이 필요하다:
1. **테마 설정** (`plymouthd.conf`에 `Theme=naia`)
2. **initrd 재빌드** (`dracut -f --regenerate-all` — 새 테마를 initramfs에 포함)

현재 빌드 파이프라인의 문제:

| 단계 | 파일 | 테마 설정 | dracut 재빌드 | 작동 여부 |
|------|------|-----------|---------------|-----------|
| BlueBuild (컨테이너) | `branding.sh` | `plymouth-set-default-theme naia` | `dracut -f --regenerate-all 2>/dev/null \|\| true` | **실패** — 컨테이너에 실제 커널이 없어 dracut이 실패하고, `|| true`로 무시됨 |
| Titanoboa (ISO hook) | `hook-post-rootfs.sh` | *(없음)* | *(없음)* | **누락** — Plymouth 관련 코드가 없었음 |

결과:
- `plymouthd.conf`에 `Theme=naia`가 설정되지 않음 (현재 시스템: `#Theme=fade-in` 주석만 존재)
- `plymouth-set-default-theme` 명령이 `bgrt`를 기본 테마로 보고
- initramfs에 naia Plymouth 테마가 포함되지 않음
- 부팅 시 Bazzite 기본 bgrt/spinner 테마가 표시됨

### 수정 내용

#### 1. `config/scripts/branding.sh` — 컨테이너에서 안정적으로 설정
`plymouth-set-default-theme`에만 의존하지 않고, `plymouthd.conf`를 직접 작성:

```bash
mkdir -p /etc/plymouth
cat > /etc/plymouth/plymouthd.conf <<PLYCFG
[Daemon]
Theme=naia
ShowDelay=0
PLYCFG
```

`dracut` 호출은 제거 (컨테이너에서 실패하므로 의미 없음).

#### 2. `installer/hook-post-rootfs.sh` — 실제 initrd 재빌드 추가
새로운 섹션 3g 추가:

```bash
# plymouthd.conf 직접 작성 (belt-and-suspenders)
mkdir -p /etc/plymouth
cat > /etc/plymouth/plymouthd.conf <<'PLYMOUTHCONF'
[Daemon]
Theme=naia
ShowDelay=0
PLYMOUTHCONF

plymouth-set-default-theme naia 2>/dev/null || true

# 핵심: Titanoboa hook은 실제 rootfs에서 실행되므로 dracut이 작동함
dracut -f --regenerate-all 2>&1 || echo "[naia] WARNING: dracut failed"
```

이 hook은 Titanoboa ISO 빌드 시 `podman --rootfs` 안에서 실행되므로
실제 커널과 모듈이 존재하여 `dracut`이 정상 작동한다.

### 빌드 파이프라인 정리 (수정 후)

```
BlueBuild 컨테이너 빌드
  └── branding.sh
       └── plymouthd.conf에 Theme=naia 기록 (설정만)
       └── dracut 호출 없음 (컨테이너에서 불가능)

Titanoboa ISO 빌드
  └── hook-post-rootfs.sh 섹션 3g
       └── plymouthd.conf 재확인
       └── plymouth-set-default-theme naia
       └── dracut -f --regenerate-all  ← 여기서 실제 initrd 재빌드
```

### 라이브 시스템 즉시 수정 방법
```bash
# 테마 설정 (현재 부팅에는 영향 없음, 설치된 시스템에 반영)
sudo mkdir -p /etc/plymouth
sudo tee /etc/plymouth/plymouthd.conf > /dev/null <<EOF
[Daemon]
Theme=naia
ShowDelay=0
EOF
```

참고: 라이브 USB의 부팅 로고는 ISO의 initramfs에 베이크되어 있으므로,
현재 라이브 세션에서는 변경할 수 없다. 다음 ISO 빌드부터 적용된다.
