# White Screen 진단 및 EGL 수정

## 날짜
2026-02-23

## 증상
- Naia Shell 실행 시 흰 화면(white screen)만 표시
- Tauri 윈도우 자체는 정상적으로 열림
- Rust 백엔드 로그 정상 (agent-core started 등)

## 환경
- Naia OS (Bazzite 기반), root 계정으로 데스크톱 로그인
- Intel HD Graphics 610 (Kaby Lake)
- Wayland 세션 (KDE Plasma), XWayland 활성
- AppImage 배포 (FUSE mount)

## 근본 원인
**WebKit2GTK의 WebKitWebProcess가 EGL 초기화에 실패하여 즉시 abort됨**

```
Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...
```

### 진단 과정

1. **프로세스 트리 확인** (`pstree -p $(pgrep naia-shell)`)
   - `WebKitNetworkProcess` → 존재 (정상)
   - **`WebKitWebProcess` → 없음** (HTML/JS 렌더링 불가 → 흰 화면)
   - `node` (agent-core) → zombie (`<defunct>`)

2. **프론트엔드 에셋 임베딩 확인** — 정상
   - `strings` 명령으로 `index-DK-LkzrM.css`, `index-CwGfjqGO.js` 확인
   - 바이너리 크기 147MB (정상)

3. **라이브러리 의존성 확인** — 정상
   - `ldd WebKitWebProcess` → `not found` 없음

4. **시스템 EGL 확인** — 정상
   - `eglinfo` → EGL extensions 정상 출력 (x11, wayland, gbm 플랫폼 모두 지원)

5. **환경변수 시도** — 모두 실패
   - `WEBKIT_DISABLE_DMABUF_RENDERER=1` → 실패
   - `WEBKIT_DISABLE_COMPOSITING_MODE=1` → 실패
   - `LIBGL_ALWAYS_SOFTWARE=1` → 실패
   - `GDK_BACKEND=wayland` (기본 x11 대신) → 실패
   - `EGL_PLATFORM=x11` / `wayland` → 미시도 (환경변수 전달 자체가 무효)
   - 모두 AppRun 경유/직접 실행 양쪽 시도

6. **AppImage GTK 훅 확인** (`linuxdeploy-plugin-gtk.sh`)
   - `export GDK_BACKEND=x11` 강제 설정
   - Wayland 세션에서 X11 백엔드 강제 → XWayland EGL 호환성 문제 가능성

7. **root 세션 문제**
   - 전체 데스크톱이 root(uid=0)로 실행 중
   - WebKit sandbox, EGL 권한, /proc 접근 등 다수 이슈
   - myuser로 검증 시도 → AppImage 권한/X11 인증 문제로 불가

### 결론
- EGL 에러는 환경변수로 우회 불가 → 코드 레벨 수정 필요
- root 데스크톱 세션이 근본적 문제일 가능성 높음

## 수정: 보류 (소스 원복)

코드 수정(`HardwareAccelerationPolicy::Never`)은 GPU 가속을 완전히 끄기 때문에
Three.js VRM 3D 아바타 성능에 악영향. 일반 유저로 재설치 후 EGL 문제가
여전히 발생하면 그때 적용.

### 준비된 수정 (필요 시 적용)
- `main.rs`: `WEBKIT_DISABLE_DMABUF_RENDERER=1` 환경변수 (Tauri 초기화 전)
- `lib.rs`: `HardwareAccelerationPolicy::Never` (WebKit 설정)

## 추가 발견: agent-core 경로 문제
```
Error: Cannot find module '/tmp/.mount_naia-sXXXXXX/agent/dist/index.js'
```
AppImage 내부에 `agent/dist/`가 포함되어 있지 않음. 별도 이슈로 추적 필요.

## 해결 계획
1. **일반 사용자 계정으로 Bazzite 재설치** — root 데스크톱 세션이 EGL 문제의 근본 원인일 가능성 높음
2. 재설치 후 EGL 문제 재발 시 → 코드 수정 적용
3. AppImage GTK 훅의 `GDK_BACKEND=x11` 강제 설정 재검토 필요
