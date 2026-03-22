<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# 테스트 전략

> SoT: `.agents/context/testing.yaml`

## 철학

통합 테스트 우선 TDD. 목(mock) 내부가 아닌 실제 I/O를 테스트합니다.
- Agent 코어: stdio 기반 테스트 (JSON 파이프 입력, JSON 출력 검증)
- Shell: Tauri WebDriver (tauri-driver) 기반 테스트
- Gateway: WebSocket 클라이언트 기반 테스트
- OS: VM 부팅으로 테스트

## 프레임워크

| 유형 | 도구 |
|------|------|
| 유닛/통합 | Vitest (`describe.skipIf()` / `it.skipIf()` 조건부 스킵) |
| E2E (Shell) | @tauri-apps/cli (tauri-driver) + WebDriver |
| E2E (OS) | QEMU VM 부팅 (CI에서 libvirt) |
| Rust | cargo test |
| 모킹 | msw (Mock Service Worker) |

---

## 테스트 코드 리뷰 규칙

테스트 코드는 결과를 맹신하기 전에 반드시 반복 리뷰해야 합니다. 잘못된 테스트 로직은 실제 버그를 숨깁니다.

1. 테스트 작성 → 테스트 코드 리뷰 (assertion이 맞는지? 대상이 정확한지? 엣지 케이스 포함?)
2. 문제 수정 → 재리뷰 → 연속 2회 클린 패스까지 반복
3. 그 후에야 테스트 실행
4. 통과 후: "이 테스트가 진짜 의도한 동작을 검증하는가?" 재확인

**이유:** 잘못된 테스트 로직(잘못된 assertion, 누락된 엣지 케이스, 잘못된 mock 설정)으로 테스트가 통과하면 실제 버그가 존재해도 발견하지 못합니다. 테스트 자체가 문제점에 접근하는 것을 막게 됩니다.

---

## 테스트 태도 (Test Attitude)

테스트는 진단 도구이지, 점수판이 아닙니다. 정식 규칙은 `agents-rules.json`의 `testing.test_attitude`를 참조.

### 안티패턴

| 안티패턴 | 설명 | 올바른 대응 |
|----------|------|------------|
| **Assertion 느슨화** | `===`를 `includes`로 바꾸거나, 검사를 제거하거나, 매칭 패턴을 넓혀서 실패하는 테스트를 통과시킴 | 전체 에러 출력을 읽고, 실패 원인이 앱 코드인지 테스트 코드인지 진단 후 실제 원인을 수정 |
| **기대값 조작** | (버그 있는) 실제 출력에 맞추려고 기대값을 변경 | 실제 출력이 잘못되면, 기대값이 아니라 출력을 생성하는 코드를 수정 |
| **테스트 삭제** | 커버하는 코드를 수정하는 대신 실패하는 테스트를 삭제하거나 스킵 | 왜 실패하는지 조사하고, 앱 코드를 수정하고, 테스트를 유지 |

---

## Agent 테스트

Agent를 자식 프로세스로 실행하고, stdin에 파이프, stdout을 검증합니다.

**유닛** (`agent/src/**/__tests__/*.test.ts`): 도구 권한 검사, JSON 프로토콜 파싱, 감사 로그 형식.

**통합** (`agent/tests/integration/*.test.ts`): `--stdio`로 agent-core 실행, stdin에 JSON 입력, stdout 검증. 예: 기본 채팅 라운드트립, 도구 호출 (file_read), 권한 거부 (Tier 3), 서브 에이전트 생성, 스트리밍 취소.

**E2E** (`agent/tests/e2e/*.test.ts`): 실제 LLM API를 사용한 전체 플로우. CI에서는 스킵 (API 키 필요, 나이틀리만).

## Shell 테스트

**유닛** (`shell/src/**/__tests__/*.test.ts`): 채팅 메시지 포맷, 감정 추출, 권한 프롬프트 로직.

**컴포넌트** (`shell/src/**/__tests__/*.test.ts`): testing-library (실제 Tauri 없음). 채팅 패널, 권한 모달, 설정 패널. 아바타 3D 렌더링은 컴포넌트 테스트 제외 (E2E에서 커버).

**E2E Mock** (`shell/e2e/*.spec.ts`): Playwright + 모킹된 Tauri IPC. 빠르지만 실제 바이너리나 Gateway 없음.

#### E2E Mock 주의사항

| 함정 | 규칙 |
|------|------|
| `plugin:store\|get` 튜플 | `Store.get()`은 `[value, exists]` 튜플 반환. 모킹 시 반드시 `[null, false]` 반환 (`null` 아님). `plugin:store\|load`는 정수 RID (예: `1`) 반환. 잘못된 값은 무증상 실패 유발. |
| keepAlive 패널 가시성 | keepAlive 패널은 항상 DOM에 마운트됨. 비활성 패널은 부모 `.content-panel__slot`에 `opacity: 0` 적용. Playwright `toBeVisible()`은 조상 opacity를 검사하지 않아 거짓 양성 발생. 대신 `.content-panel__slot--active .panel-class` 셀렉터 사용. |
| `exposeFunction` 타이밍 | `page.exposeFunction()`은 반드시 `page.goto()` 이전에 호출. 네비게이션 후 등록 시 이미 로드된 페이지에 함수가 존재하지 않음. 순서: `exposeFunction → goto`. |
| xterm.js keepAlive 스태킹 | 터미널 컴포넌트는 `opacity:0 + pointerEvents:none` 스태킹 사용. `display:none` 절대 금지 — FitAddon.fit()이 숨겨진 요소에서 0×0 반환함. E2E에서 캔버스는 테스트 불가; 탭 바 UI만 테스트. `pty_create` mock → `{ pty_id, pid }`. `shell/e2e/119-pty-terminal.spec.ts` 참조. |

**E2E Tauri** (`shell/e2e-tauri/specs/*.spec.ts`): WebdriverIO v9 + tauri-driver로 실제 Tauri 앱 구동. 실제 LLM 호출 (Gemini), 실제 Gateway, 실제 스킬 실행.

### E2E Tauri 사전 요구 사항
- `webkit2gtk-driver` (apt/dnf)
- `cargo install tauri-driver --locked`
- `shell/.env`에 `GEMINI_API_KEY`
- Gateway가 `:18789`에서 실행 중
- 디버그 바이너리: `cargo build -p naia-shell`

### E2E Tauri 시나리오

| 스펙 | 테스트 내용 |
|------|------------|
| 01 앱 실행 | 초기 상태 -> 설정 모달 표시 |
| 02 설정 | 프로바이더, API 키, Gateway URL/토큰, 도구 사전 승인 |
| 03 기본 채팅 | 메시지 전송 -> 스트리밍 -> 비어있지 않은 응답 |
| 04 skill_time | 도구 성공 또는 시간 패턴 응답 |
| 05 skill_system | 도구 성공 또는 MB/GB/메모리 패턴 |
| 06-07 skill_memo | 메모 저장 + 읽기 + 삭제 |
| 14 Skills 탭 | 20+ 스킬 카드, 검색 필터, 빌트인 토글 없음 |
| 28 Skills 설치 | Gateway 카드, 설치 버튼, 피드백 |

### E2E 관찰성 (5가지 방법, #60)

E2E 실패 진단 시 동시에 사용:

| # | 방법 | 위치 | 비고 |
|---|------|------|------|
| 1 | `llm-debug.log` | `~/.naia/logs/llm-debug.log` | LLM 요청별 JSON 한 줄. 항상 활성화. provider/model 불일치 진단에 최적. |
| 2 | `log_entry` 청크 | DiagnosticsTab / `ui-message-trace.ndjson` | Agent가 LLM 시작/오류 시 emit |
| 3 | 스크린샷 | `shell/e2e-tauri/.artifacts/screenshots/` | E2E 주요 단계에서 촬영 |
| 4 | 브라우저 로그 | `shell/e2e-tauri/.artifacts/browser-console.ndjson` | `browser.getLogs("browser")` 이용 |
| 5 | `CAFE_DEBUG_E2E=1` | Rust stderr + `~/.naia/logs/naia.log` | `wdio.conf.ts`에서 자동 설정 |

### E2E Tauri 주의사항

- **panelVisible**: `config.panelVisible === false`이면 `ChatPanel`이 렌더링되지 않아 탭이 전혀 표시 안 됨. E2E 설정에서 반드시 `panelVisible: true` 명시. `ensureAppReady()`에서 강제 적용됨.
- **VRM 경로**: 로컬 절대 경로(`/home/.../assets/AvatarSample_B.vrm`)는 webview에서 실패. `/avatars/01-Sendagaya-Shino-uniform.vrm` 사용. VRM 실패는 탭 렌더링을 막지 않음.
- **WebKitGTK 클릭**: `element.click()`이 "unsupported operation" 반환. `browser.execute(() => el.click())` + `clickBySelector` 헬퍼 사용.
- **Stale 엘리먼트**: WebKitGTK는 React 리렌더 시 참조 무효화. 항상 `browser.execute()` + 새 `querySelector()` 사용.
- **React input**: 네이티브 property setter + `dispatchEvent('input')`으로 값 설정. 100ms 대기 후 send 클릭.
- **LLM 비결정성**: Gemini가 항상 도구를 사용하지 않을 수 있음. 유연한 검증: tool-success 엘리먼트 OR 텍스트 패턴.
- **ensureAppReady 키 없는 프로바이더**: `alreadyConfigured` 체크가 `apiKey` 또는 `naiaKey`를 요구하지만, `claude-code-cli`와 `ollama`는 API 키 불필요. 수정 없으면 이 프로바이더들은 항상 "미설정"으로 처리되어 gemini로 리셋됨. `noKeyProviders` 목록(또는 `isApiKeyOptional()`)으로 판별.
- **provider/model 기본값 하드코딩**: `savedModel`이 비어 있을 때 ChatPanel이 active provider 무관하게 `"gemini-2.5-flash"`를 하드코딩 fallback으로 사용했음. 수정: `getDefaultLlmModel(activeProvider)` 우선 사용, 없으면 최후 fallback으로만 `"gemini-2.5-flash"` 사용.

### E2E 방법론

- E2E는 AI 응답이 "기능 없음"이라고 할 때 실패해야 합니다.
- 최종 AI 메시지가 모순되면 단일 UI 신호만으로 PASS 판정하지 않습니다.
- assistant 메시지에 대해 명시적 FAIL 문구를 사용한 의미론적 검증.
- 스펙이 예상외로 통과하면 항상 메시지 트레이스를 검사합니다.
- 기본 트레이스: `shell/e2e-tauri/.artifacts/ui-message-trace.ndjson`
- 테스트는 진단 도구 — 실패는 "앱 코드를 조사하라"는 뜻이지, "테스트를 고쳐서 통과시키라"는 뜻이 아닙니다.
- 먼저 앱 코드의 근본 원인을 진단하지 않고 assertion을 느슨하게 하거나, 기대값을 바꾸거나, 테스트를 스킵하는 것은 절대 금지.

## Gateway 테스트

**유닛** (`gateway/src/**/__tests__/*.test.ts`): 메시지 라우팅, 스킬 매칭, 메모리 저장, 벡터 검색.

**통합** (`gateway/tests/integration/*.test.ts`): 랜덤 포트에서 Gateway 시작, WebSocket 연결, 프로토콜 메시지 전송. 예: 핸드셰이크, Gateway 통한 채팅, 스킬 호출, 메모리 회상.

**채널 테스트**: 모킹된 채널 SDK (discord.js, grammy). CI에서 실제 봇 토큰 미사용.

## OS 테스트

**스모크** (`os/tests/smoke.sh`): 헤드리스 QEMU에서 ISO 부팅, SSH 접속, systemd 서비스/Node.js/데스크톱 엔트리/`~/.naia/` 확인.

**CI**: GitHub Actions + QEMU. 5분 타임아웃. GPU 의존 테스트 스킵 (수동 검증).

## CI 파이프라인

| 트리거 | 단계 |
|--------|------|
| push | Biome lint, tsc --noEmit, agent/shell/gateway 유닛 + 통합, cargo test |
| PR | 위 + Shell E2E (agent 모킹), Gateway E2E |
| main | 위 + BlueBuild 이미지, OS 스모크 테스트 (QEMU), ISO 생성 |
| nightly | Agent E2E (실제 LLM), 전체 OS E2E (VM 부팅 + 앱 + 채팅) |

## 테스트 명령어

```bash
pnpm test                              # 전체
pnpm --filter agent test:unit          # Agent 유닛
pnpm --filter agent test:integration   # Agent 통합
pnpm --filter shell test:unit          # Shell 유닛
pnpm --filter shell test:component     # Shell 컴포넌트
pnpm --filter shell test:e2e           # Shell E2E (mock)
cd shell && pnpm run test:e2e:tauri    # Shell E2E (실제 Tauri)
pnpm --filter gateway test:unit        # Gateway 유닛
pnpm --filter gateway test:integration # Gateway 통합
bash os/tests/smoke.sh                 # OS 스모크
pnpm test:coverage                     # 커버리지
```

## 모킹 전략

- **LLM API**: msw (Mock Service Worker) + `agent/tests/fixtures/llm-responses/*.json` 픽스처 파일
- **채널**: 모킹된 discord.js Client, grammy Bot. CI에서 실제 토큰 미사용.
- **파일시스템**: 임시 디렉토리 (`os.tmpdir()`), 각 테스트 후 정리.
- **Shell용 Agent 코어**: `shell/tests/fixtures/mock-agent.js` (stdin/stdout 픽스처 응답)

## E2E 전체 플로우 시나리오

모듈 간 테스트:

| 시나리오 | 플로우 | 커버리지 |
|----------|--------|----------|
| 부팅 -> 채팅 | VM 부팅 -> 자동 로그인 -> Shell 실행 -> 아바타 렌더링 -> 채팅 | os -> shell -> agent -> LLM |
| 도구 실행 | "파일 생성" -> agent 계획 -> 권한 모달 -> 파일 생성 -> 확인 | shell -> agent -> tools -> fs -> audit |
| 권한 차단 | "/etc/hosts 삭제" -> Tier 3 차단 -> 차단 메시지 | agent -> security -> audit |
| 크래시 복구 | 채팅 -> agent 종료 -> 자동 재시작 -> 다시 채팅 | shell -> agent (lifecycle) |
| 외부 채널 | Discord DM -> Gateway 라우팅 -> agent 응답 -> Discord 답장 | gateway -> agent -> discord |
| 게임 세션 | "마인크래프트 참가" -> 연결 -> "나무 채굴" -> 봇이 채굴 | shell -> agent -> game (Phase 8) |

## 데모 영상

통과/실패 테스트가 아닌 영상 산출물 생성용.
- 위치: `shell/e2e/demo-video.spec.ts`
- 도구: Playwright + 모킹된 Tauri IPC
- 파이프라인: Playwright 녹화 -> TTS 나레이션 -> ffmpeg 합성
- 설정: `.agents/context/demo-video.yaml`

---

*AI 컨텍스트: [.agents/context/testing.yaml](../../.agents/context/testing.yaml)*
