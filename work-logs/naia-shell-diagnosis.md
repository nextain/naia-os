# Naia Shell 흰 화면(White Screen) 진단 보고서

## 환경 정보
- **OS**: Naia OS (Bazzite 기반 커스텀 OS, BlueBuild로 빌드)
- **소스코드 위치**: `/var/roothome/naia-os/` (GitHub: `nextain/naia-os`)
- **설치된 바이너리**: `/usr/bin/naia-shell` (AppImage, ELF 64-bit static-pie linked)
- **자동시작**: `/usr/etc/xdg/autostart/naia-shell.desktop` → 로그인 시 자동 실행
- **로그 파일**: `/root/.naia/logs/naia.log`

## 앱 기술 스택
- **프론트엔드**: React 18 + Vite 6 + TypeScript
- **백엔드/래퍼**: Tauri 2 (Rust) — `webkit2gtk 4.1` 기반 WebView
- **빌드 방식**: `pnpm build` → Vite가 `shell/dist/`로 빌드 → Tauri가 `frontendDist: "../dist"`를 번들에 임베드
- **배포 방식**: GitHub Actions에서 AppImage 빌드 → `install-naia-shell.sh`가 릴리스에서 다운로드하여 `/usr/bin/naia-shell`로 설치

## 현재 증상
- 앱 실행 시 **흰 화면(white screen)** 만 표시됨
- Tauri 윈도우 자체는 정상적으로 열림 (로그에 세션 시작, 윈도우 도킹 등 확인)
- Rust 백엔드는 정상 동작 (agent-core 시작됨)

## 로그 분석 (`/root/.naia/logs/naia.log`)
```
[Naia] === Session started ===
[Naia] Log files at: /root/.naia/logs
[Naia] Gateway not available: OpenClaw not installed at /root/.naia/openclaw/node_modules/.bin/openclaw
[Naia] Running without Gateway (tools will be unavailable)
[Naia] agent-core started
```
- Gateway 없음은 정상 (옵션 기능) — 흰 화면과 무관
- **JavaScript 에러 로그가 없음** — WebView 내부 에러는 이 로그에 안 찍힘

## 의심 원인 분석

### 1. [가장 유력] 기본 테마의 CSS 변수 — 흰 배경 + 흰/밝은 텍스트
**`shell/src/styles/global.css`** 1~16행:
```css
:root,
[data-theme="espresso"] {
    --espresso: #ffffff;        /* ← 배경색이 순수 흰색! */
    --espresso-light: #f1f5f9;  /* 밝은 회색 */
    --espresso-dark: #f8fafc;   /* 거의 흰색 */
    --cream: #0f172a;           /* 텍스트 색 — 진한 남색 */
    --cream-dim: #94a3b8;       /* 보조 텍스트 */
    ...
}
```
그리고 `body` 스타일:
```css
html, body, #root {
    background: var(--espresso);  /* → #ffffff (순백) */
    color: var(--cream);          /* → #0f172a (진한 남색) */
}
```

**"espresso"** 테마는 사실상 **라이트 테마**다. 배경이 `#ffffff`이므로:
- 앱이 처음 로드될 때 onboarding이 안 뜨면 → **`main-area`가 `display: none`**이고 SidePanel만 보이는데
- SidePanel 내부 컴포넌트들이 제대로 렌더링되지 않으면 → **흰 배경만 보임**

### 2. [유력] 초기 상태가 `showOnboarding = false` → 조건부 렌더링 문제
**`shell/src/App.tsx`** 핵심 로직:
```tsx
const [showOnboarding, setShowOnboarding] = useState(false);  // 초기값 false

useEffect(() => {
    const config = loadConfig();
    applyTheme(config?.theme ?? "espresso");
    if (!isOnboardingComplete()) {
        setShowOnboarding(true);  // localStorage에 config 없으면 → true
    }
}, []);
```

- `useState(false)` → 첫 렌더에서 onboarding 안 보임
- `useEffect`는 마운트 후 비동기로 실행
- **첫 렌더 시점**: onboarding도 아니고, 메인 UI가 렌더됨
- 메인 UI는 `<SidePanel />`인데, 이게 내부적으로 gateway/agent 연결이 안 되면 비어있을 수 있음

**그러나** `isOnboardingComplete()`가 `loadConfig()?.onboardingComplete === true`를 체크하므로, 처음 설치 시 localStorage에 아무것도 없으면 `false` → onboarding이 떠야 함. **onboarding이 정상적으로 뜬다면 흰 화면이 아닐 것**.

### 3. [가능성] localStorage 접근 타이밍 또는 WebView 초기화 순서 문제
- `tauri.conf.json`에서 `"visible": false`로 설정 → setup에서 `window.show()` 호출
- `window.show()`가 WebView의 DOM 렌더링 완료 전에 호출될 수 있음
- WebView가 아직 `index.html`을 로드 중이거나, Vite 빌드 결과물을 파싱 중일 때 보이면 → 흰 화면

### 4. [가능성] frontendDist 임베딩 실패
- `tauri.conf.json`: `"frontendDist": "../dist"`
- 빌드 시 `pnpm build` → `dist/` 폴더 생성 → Tauri가 이를 바이너리에 임베드
- **만약 CI에서 `pnpm build`가 실패하거나 `dist/`가 비어있는 상태로 Tauri 빌드가 진행되면** → 프론트엔드 에셋이 없어서 흰 화면
- AppImage 내부에서 프론트엔드 에셋이 실제로 임베드되었는지 확인 필요

### 5. [가능성 낮음] CSP(Content Security Policy) 차단
- `tauri.conf.json`의 CSP가 매우 구체적:
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ...
```
- `script-src 'self'`만 허용 → 인라인 스크립트 차단 가능
- 그러나 Vite 빌드 결과물은 보통 외부 파일이므로 문제없을 것

## 확인이 필요한 사항

### 즉시 확인 가능
1. **AppImage 내부에 프론트엔드 에셋이 임베드되어 있는지 확인**
   ```bash
   strings /tmp/squashfs-root/usr/bin/naia-shell | grep -E "(index\.html|<!doctype|/assets/)" | head -20
   ```
   또는 Tauri 바이너리의 임베드된 리소스 검색

2. **WebView 개발자 도구로 JavaScript 콘솔 에러 확인**
   ```bash
   WEBKIT_INSPECTOR_SERVER=0.0.0.0:1234 /usr/bin/naia-shell
   ```
   그 후 Chrome에서 `chrome://inspect`로 접속하여 콘솔 에러 확인

3. **첫 실행 시 onboarding이 실제로 뜨는지 확인**
   - localStorage를 클리어한 상태에서 앱 실행

### 소스코드 추가 확인 필요
4. **`SidePanel.tsx`** — 메인 화면에서 실제로 무엇을 렌더하는지
5. **`OnboardingWizard.tsx`** — 첫 화면이 제대로 렌더되는지
6. **GitHub Actions 빌드 로그** — `pnpm build`가 성공했는지, `dist/` 폴더에 파일이 있었는지
7. **`shell/src-tauri/src/lib.rs`의 agent spawn 로직** — 에러가 프론트엔드 렌더링을 블록하는지

## 파일 구조 요약
```
/var/roothome/naia-os/
├── shell/                          # Naia Shell 앱 (Tauri 2 + React)
│   ├── index.html                  # 엔트리 HTML
│   ├── src/
│   │   ├── main.tsx                # React 엔트리
│   │   ├── App.tsx                 # 루트 컴포넌트 (onboarding 분기)
│   │   ├── lib/config.ts           # 설정 관리 (localStorage)
│   │   ├── components/
│   │   │   ├── SidePanel.tsx
│   │   │   ├── TitleBar.tsx
│   │   │   ├── OnboardingWizard.tsx
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── AvatarCanvas.tsx    # VRM 3D 아바타
│   │   │   └── ...
│   │   └── styles/global.css       # 전역 CSS (테마 변수)
│   ├── src-tauri/
│   │   ├── tauri.conf.json         # Tauri 설정 (창 크기, CSP 등)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs             # Rust 엔트리
│   │       └── lib.rs              # 핵심 로직 (2100+ 줄)
│   ├── package.json
│   └── vite.config.ts
├── config/
│   ├── scripts/
│   │   ├── install-naia-shell.sh   # AppImage 다운로드/설치
│   │   ├── install-pnpm.sh
│   │   └── branding.sh
│   ├── files/usr/
│   │   ├── etc/xdg/autostart/naia-shell.desktop  # 자동시작
│   │   ├── share/applications/naia-shell.desktop
│   │   └── lib/systemd/user/naia-gateway.service
│   └── systemd/naia-gateway.service
└── recipes/recipe.yml              # BlueBuild 레시피 (OS 이미지 정의)
```

## 결론 및 우선순위

| 순위 | 원인 | 확인 방법 |
|------|------|-----------|
| 1 | frontendDist 임베딩 실패 (빌드 시 dist/ 비어있음) | `strings` 명령으로 바이너리 내 HTML 검색 |
| 2 | WebView JS 에러 (React 렌더링 실패) | `WEBKIT_INSPECTOR_SERVER` 환경변수로 디버깅 |
| 3 | espresso 테마가 라이트 테마인데 컴포넌트가 안 보임 | 테마 변경 후 확인 |
| 4 | WebView 초기화 전 window.show() 호출 | Rust 코드에서 show 타이밍 조정 |
