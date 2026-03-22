# 교훈 기록

> 미러: `.agents/context/lessons-learned.yaml`

개발 사이클에서 축적된 교훈. INVESTIGATE 단계에서 읽고, SYNC 단계에서 작성.

**스키마**: `id`, `date`, `issue`, `category`, `title`, `problem`, `root_cause`, `fix`, 그리고 선택 필드 `scope` (파일 글로브 또는 모듈명 — 전역/워크플로우 수준 교훈은 생략). 예시 scope: `"shell/src/audio/*"`, `"agent/llm-registry"`.

> **컨텍스트 업데이트 규칙**: 새 교훈이 기존 항목과 유사하다면 → 중복 추가 금지. 대신 훅을 강화할 것 (`harness.md` → Context Update Matrix 참고).

---

## L001 — E2E 미완료인데 완료로 표기 (#60)

**날짜**: 2026-03-15 | **분류**: 테스팅

**문제**: LLM Provider Registry (#60)가 5 Phase 완료로 기록됐지만, E2E 프로바이더 스위칭 테스트는 인프라 문제(tauri-driver SIGINT)로 차단된 상태였음. 실제 E2E 검증 없이 "완료"로 보고.

**근본 원인**: E2E 완료 전 작업 완료 표기를 금지하는 규칙 부재. AI 성공 편향 — 불확실한 상태를 완료로 보고.

**수정**: test_attitude 규칙, on_failure에 diagnose 단계, AI 행동 특성 경고에 success_bias_reporting 추가.

---

## L002 — 테스트 통과 ≠ 올바른 동작

**날짜**: 2026-03-15 | **분류**: 테스팅

**문제**: AI가 실패하는 테스트의 assertion을 느슨하게 수정하여 통과시킴. 앱 코드 버그를 조사하지 않음.

**근본 원인**: e2e_test 단계의 output이 "Passing E2E test"로 정의되어 "통과"가 명시적 목표였음. 테스트 gaming에 대한 anti-pattern 없음.

**수정**: output을 "E2E diagnostic complete"로 재정의. test_attitude anti-pattern 추가 (assertion 느슨화, expected value 조작, 테스트 삭제).

---

## L003 — 디버그 로깅을 버그 발생 후에야 추가

**날짜**: 2026-03-15 | **분류**: 관측성(Observability)

**문제**: 버그 발생 시 항상 Logger.debug() 추가가 첫 단계 — 첫 번째 발생은 항상 진단 불가.

**근본 원인**: debug_logging 규칙에 무엇을(what), 어떻게(how) 로깅할지는 있었지만, 언제(when) 로깅을 추가하는지(빌드 시점 vs 디버깅 시점)가 명시되지 않음.

**수정**: debug_logging.when 규칙 추가: "디버그 로깅은 BUILD-TIME 활동". 리뷰 체크리스트에 항목 추가.

---

## L004 — Landscape 조사 생략 — 전체 구현 후 잘못된 upstream 타겟 발견 (#73)

**날짜**: 2026-03-18 | **분류**: Upstream 통합

**문제**: vllm 포크에서 SupportsAudioOutput 전체 구현 후 vllm-omni가 올바른 upstream 타겟임을 발견. 오디오 출력은 vllm main에서 명시적으로 scope out됨 (RFC #16052). 전체 구현 낭비.

**근본 원인**: 포크 전 사전 조사 단계 없음. RFC 히스토리 확인 안 함. 서브 프로젝트(vllm-omni) 존재 미발견. 코딩 전 upstream 이슈 미개설.

**수정**: `upstream-contribution.yaml` 워크플로우 추가 — 구현 전 Landscape 조사 필수 (scope 확인, AI 정책, RFC 히스토리, 서브 프로젝트 발견, 메인테이너 stance). Progress 파일에 `upstream_issue_ref` 필드 추가. Upstream contribution 시 commit-guard advisory 추가.

**참고**: `.agents/context/upstream-contribution.yaml`

---

## L005 — 컨텍스트 압축 시 mandatory reads 스킵 — 재개 세션에서 규칙 미준수 (#89)

**날짜**: 2026-03-19 | **카테고리**: 워크플로우

**문제**: 컨텍스트가 압축되고 summary에서 세션이 재개될 때, AI가 mandatory reads(agents-rules.json, ai-work-index.yaml, project-index.yaml) 없이 바로 구현을 시작함. 결과: build-time 로깅 누락, 반복 리뷰 미실행, success_bias_reporting 발생, 사용자가 AI가 맘대로 개발한다고 느낌.

**근본 원인**: CLAUDE.md의 mandatory reads는 "모든 세션 시작 시"라고 명시되어 있으나, 컨텍스트 압축 재개는 새 세션이 아닌 연속으로 취급됨 — 해당 지시가 발동되지 않음. Summary에 규칙 재독 리마인더 없음.

**수정**: 컨텍스트 압축 후 재개 세션은 반드시 새 세션 시작으로 취급 — 구현 전 agents-rules.json 먼저 읽기. Progress 파일(`.agents/progress/*.json`)을 유지하여 재개 세션이 현재 phase/gate 상태를 파악할 수 있게 함.

---

## L006 — panel_install_result가 panel_control reload보다 먼저 와야 함 — 순서가 결정적 (#89)

**날짜**: 2026-03-20 | **카테고리**: IPC | **범위**: `shell/src/components/PanelInstallDialog.tsx`, `agent/src/index.ts`

**문제**: PanelInstallDialog 자동 닫기 로직은 `panel_install_result`로 `successRef`가 설정된 후 동작. `panel_control reload`가 먼저 도착하면 `successRef`가 false인 상태 → 설치 성공해도 다이얼로그가 닫히지 않음.

**근본 원인**: `actionInstall` 내부에서 마지막에 `panel_control reload`를 emit함. Agent wrapper가 이를 suppress하지 않고 result 이후 own reload를 emit했으나 순서 보장이 없었음.

**수정**: Agent `panel_install` 핸들러가 `actionInstall`에 `writeLine: () => undefined`를 전달(내부 `panel_control` suppress). await 후 `panel_install_result` 먼저 emit, 성공 시에만 `panel_control reload` emit. 순서 결정적.

---

## L007 — requestId 없는 이벤트는 chat-service 필터 사용 불가 — 직접 listen() (#89)

**날짜**: 2026-03-20 | **카테고리**: IPC | **범위**: `shell/src/components/PanelInstallDialog.tsx`, `shell/src/lib/chat-service.ts`

**문제**: `panel_install_result`에 `requestId` 필드 없음. `chat-service.ts` 필터가 `chunk.requestId !== requestId`인 청크를 무시 → `panel_install_result`가 무음으로 버려짐.

**근본 원인**: `requestId` 필터는 일반 채팅 응답(모두 `requestId` 포함) 기준으로 작성됨. 일반 채팅 흐름 밖에서 발생하는 이벤트 타입은 `requestId`를 갖지 않음.

**수정**: `PanelInstallDialog`가 Tauri `listen('agent-response-chunk')` 직접 사용, `chat-service` 우회. TS 타입 체크도 가드 필요: `!('requestId' in chunk) || chunk.requestId !== requestId`.

---

## L008 — 용어 혼용(app vs panel)은 혼란 야기 — 하나로 통일하고 강제 (#89)

**날짜**: 2026-03-20 | **카테고리**: 명명 | **범위**: `agent/src/skills/built-in/panel.ts`, `shell/src-tauri/src/panel.rs`, `docs/`

**문제**: 구현 중간에 "app" 용어가 부분 도입됨(`app.json`, `~/.naia/apps/`). 기존 "panel" 용어와 혼용되어 파일 참조 오류, 문서 혼란 발생.

**근본 원인**: 명명 결정이 비공식적으로 이루어지고 체크리스트 없이 파일별로 독립 업데이트됨.

**수정**: 모든 "app" 용어를 "panel"로 복원. 강제 규칙: `panel.json`, `~/.naia/panels/`, `panel_list_installed`, `panel_remove_installed`, `PanelDescriptor`. `architecture.yaml`에 `critical_gotchas.terminology` 추가.

---

## L009 — kill -0은 좀비 프로세스에도 성공 — Chrome 종료 감지에 CDP 헬스 체크 필요 (#95)

**날짜**: 2026-03-20 | **카테고리**: 프로세스 관리 | **범위**: `shell/src-tauri/src/browser.rs`

**문제**: Chrome이 SIGKILL로 종료되면 좀비 프로세스가 됨(부모가 reap 안 함). `libc::kill(pid, 0)`은 PID가 프로세스 테이블에 남아있어 좀비에 대해 0(성공) 반환. 모니터 스레드가 `browser_closed`를 emit하지 않아 프론트엔드에 에러 UI 미표시.

**근본 원인**: `kill -0`은 OS 레벨의 PID 존재 여부 체크이지 응답 가능 프로세스 체크가 아님. 좀비는 PID 슬롯을 점유하지만 HTTP를 서비스하지 않음.

**수정**: CDP `/json/version` 헬스 체크를 보조 감지기로 추가. `kill -0` 성공이지만 CDP 연결 거부 시 → Chrome이 좀비 → `browser_closed` emit. `browser.rs`의 `spawn_chrome_monitor()` 참고.

---

## L010 — 2026년 기준 CEF Rust 바인딩 미완성 — Chrome 바이너리 + XReparentWindow 사용 (#95)

**날짜**: 2026-03-20 | **카테고리**: 프론트엔드 | **범위**: `shell/src/panels/browser/*`

**문제**: 내장 브라우저용으로 CEF(Chromium Embedded Framework) Rust 바인딩 사용을 검토함. 2026년 기준 모든 Rust CEF 크레이트가 실험적이거나 유지보수 중단 또는 아카이브 상태.

**근본 원인**: CEF Rust 에코시스템 미성숙. CEF 자체가 C++ 라이브러리이며 Rust 바인딩이 크게 뒤처짐.

**수정**: Chrome 바이너리 서브프로세스 + X11 XReparentWindow(`x11rb`)로 embed. 동일한 UX 달성: 사용자는 Chromium 화면, AI용 CDP 사용 가능. `GDK_BACKEND=x11`(XWayland 모드) 필수, GTK/WebKit 라이브러리 링킹을 위해 distrobox(host Bazzite 아님)에서 실행 필요.

---

## L011 — gemini-2.5-flash-live는 WebSocket 전용 — SSE /v1/chat/completions에 보내면 0바이트 응답 (#95)

**날짜**: 2026-03-20 | **카테고리**: 프로바이더 | **범위**: `agent/src/providers/lab-proxy.ts`

**문제**: 사용자가 텍스트 채팅용 LLM 모델로 `gemini-2.5-flash-live`를 설정함. Lab proxy가 Vertex AI `/v1/chat/completions`(SSE 엔드포인트)로 전송. Vertex AI가 200 OK이지만 완전히 빈 응답 반환 — 데이터도, 에러도 없음. 앱이 "empty SSE stream" 에러 발생.

**근본 원인**: Gemini Live 모델은 WebSocket 전용(Live API). Vertex AI의 REST 엔드포인트가 지원하지 않으며, 적절한 에러 대신 빈 200 응답을 묵묵히 반환.

**수정**: `lab-proxy.ts`의 `toGatewayModel()`에 매핑 추가: `"gemini-2.5-flash-live"` → `"vertexai:gemini-2.5-flash"`. 또한 `bytesReceived==0` 가드를 추가해 0바이트 스트림을 명확한 에러 메시지로 감지.

---

## L012 — 음성 세션은 session.connect()에 tools를 전달해야 함 — 없으면 Gemini가 "도구 꺼져 있음"이라고 말함 (#95)

**날짜**: 2026-03-20 | **카테고리**: 음성 | **범위**: `shell/src/components/ChatPanel.tsx`, `shell/src/lib/voice/*`

**문제**: `config.enableTools=true`임에도 Gemini Live 음성 세션이 "내 도구 사용 설정이 꺼져 있어서"라고 말함. 사용자는 도구 토글이 켜져 있음을 확인했으나 AI 음성 응답은 도구를 사용할 수 없다고 인식.

**근본 원인**: `session.connect()`에 `tools` 파라미터 없이 호출됨. Gemini Live의 `function_declarations` 필드가 비어있었음. 시스템 프롬프트에 도구 언급이 있어도, 세션 setup에서 선언되지 않으면 Gemini가 도구를 호출하지 않음.

**수정**: `ChatPanel`이 `panelRegistry.get(activePanelId)?.tools`에서 활성 패널 도구를 읽어 `ToolDeclaration` 형식으로 변환, `session.connect({ tools: voiceTools, systemInstruction: voiceSystemPrompt })`에 전달. 시스템 프롬프트에도 도구 목록과 "적극적으로 호출하라"는 지시 추가.

---

## L013 — position:fixed 오버레이가 Chrome X11 임베드 영역까지 덮음 (#95)

**날짜**: 2026-03-20 | **카테고리**: CSS | **범위**: `shell/src/styles/global.css`, `shell/src/components/SettingsTab.tsx`

**문제**: STT 모델 모달(`.sync-dialog-overlay`가 `position:fixed; left:0; right:0` 사용)이 naia 채팅 패널 내에 머물지 않고 Chrome X11 임베드 영역 위에 나타남.

**근본 원인**: `position:fixed`는 뷰포트 기준으로 위치가 결정되어 전체 창 너비를 포함함. Chrome X11 창은 `x > naia-panel-width`에 임베드되므로, `right:0`까지 늘어나는 fixed 오버레이가 Chrome 영역을 덮음.

**수정**: `right:0` 대신 `width: var(--naia-width, 320px)`를 사용하는 `.panel-modal-overlay` 클래스 추가. 패널 내부에 머물어야 하는 모달은 전체 뷰포트 `.sync-dialog-overlay` 대신 이 클래스를 사용.

---

## L014 — global.css CSS 문법 오류 시 Vite 앱 전체 렌더 실패 — E2E 테스트 전부 "element not found"로 실패 (#99)

**날짜**: 2026-03-21 | **카테고리**: CSS | **범위**: `shell/src/styles/global.css`

**문제**: config와 mock이 올바른데도 E2E 테스트가 `beforeEach`에서 "locator(.chat-panel) not found"로 실패. 13개 전부 실패.

**근본 원인**: CSS 편집 실수로 `global.css:5117–5118`에 어떤 규칙에도 속하지 않는 고아 `color:` 프로퍼티와 `}`가 남았음. PostCSS가 "Unexpected }" 파싱 에러를 던지고, Vite가 에러 오버레이를 표시하며 React를 마운트하지 않음.

**수정**: 고아 라인 제거. `global.css` 편집 후 CSS가 정상 컴파일되는지 항상 확인 — E2E 실행 전 브라우저 devtools나 Vite 서버 응답에서 `[plugin:vite:css]` 에러 여부 점검.

---

## L015 — Playwright strict mode: `[data-panel-id]`가 wrapper div와 button 모두 매칭 — `button[data-panel-id]` 사용 (#99)

**날짜**: 2026-03-21 | **카테고리**: E2E | **범위**: `shell/e2e/*.spec.ts`

**문제**: `'[data-panel-id="workspace"]'` 로케이터가 wrapper div와 그 안의 button 두 요소를 매칭. Playwright strict mode가 "strict mode violation"을 던지며 테스트 실패.

**근본 원인**: ModeBar가 스타일링을 위해 wrapper div에 `data-panel-id`를 붙이고, 접근성/테스트 목적으로 내부 button에도 같은 속성을 붙임. 범용 속성 셀렉터는 두 요소를 모두 매칭.

**수정**: `'button[data-panel-id="workspace"]'`로 인터랙티브 button 요소만 타겟.

---

## L016 — FileTree와 WorkspaceCenterPanel 간 순환 참조 — 공유 타입을 인라인으로 정의하여 해결 (#99)

**날짜**: 2026-03-21 | **카테고리**: React | **범위**: `shell/src/panels/workspace/FileTree.tsx`, `shell/src/panels/workspace/WorkspaceCenterPanel.tsx`

**문제**: `FileTree`가 `WorkspaceCenterPanel`에서 `ClassifiedDir` 타입을 임포트하는데, `WorkspaceCenterPanel`은 `FileTree`를 임포트함. TypeScript/번들러가 해소하지만 순환 의존성 발생.

**근본 원인**: 두 컴포넌트 모두 동일한 `ClassifiedDir` 인터페이스가 필요. 부모(`WorkspaceCenterPanel`)에 정의하고 자식(`FileTree`)에서 임포트하면 순환 의존성 발생.

**수정**: FileTree props에 타입을 인라인으로 직접 정의: `Array<{name: string; path: string; category: string}>`. `WorkspaceCenterPanel`은 Naia 도구 핸들러용으로 별도의 `ClassifiedDir` 인터페이스를 re-export.

---

## L017 — `idleToastTimerRef`를 interval `useEffect` cleanup에서 반드시 제거해야 함 — 언마운트된 컴포넌트에 setState 방지 (#99)

**날짜**: 2026-03-21 | **카테고리**: React | **범위**: `shell/src/panels/workspace/WorkspaceCenterPanel.tsx`

**문제**: 유휴 알림 `setInterval`이 유휴 세션 감지 시 토스트 타이머(`setTimeout`)를 생성. interval cleanup에서 `clearInterval`은 올바르게 호출하지만, 대기 중인 토스트 타이머의 `clearTimeout`은 호출하지 않음.

**근본 원인**: 토스트 타이머는 유휴 알림 6초 후에 실행됨. 타이머가 대기 중인 상태에서 컴포넌트가 언마운트(탭 전환)되면, 언마운트된 컴포넌트에 `setIdleToast(null)`이 호출됨.

**수정**: interval cleanup 함수에 추가: `if (idleToastTimerRef.current) clearTimeout(idleToastTimerRef.current)`.

---

## L018 — Keep-alive 패널은 `display:contents` 사용 필수 (`display:block` 아님) — flex 레이아웃 컨텍스트 보존 (#99)

**날짜**: 2026-03-21 | **카테고리**: React | **범위**: `shell/src/App.tsx`

**문제**: 워크스페이스 패널이 탭 전환 시 언마운트되어 모든 상태가 초기화됨. `display:none` 래퍼에 `display:block`으로 활성화 시 flex 자식 레이아웃이 깨짐 — 자식들이 올바르게 stretch되지 않음.

**근본 원인**: `content-panel`이 `display:flex`를 사용하므로, `display:block` 래퍼 div는 flex 자식 동작을 망가뜨림. `display:contents`는 래퍼를 레이아웃에 투명하게 만들어 자식이 부모 flex 컨텍스트에 직접 참여.

**수정**: keep-alive 래퍼에 `style={{ display: activePanel === 'workspace' ? 'contents' : 'none' }}` 사용.

---

## L019 — 마크다운 3상태 뷰에는 `viewMode` enum이 필수: preview / split / editor (#99)

**날짜**: 2026-03-21 | **카테고리**: React | **범위**: `shell/src/panels/workspace/Editor.tsx`

**문제**: `previewMode: boolean`으로는 split 뷰(에디터+미리보기 나란히 표시) 표현 불가.

**근본 원인**: 설계가 토글 이상으로 발전: 마크다운은 미리보기 기본, split(실시간 편집), 에디터 전용 3가지 상태 필요. 상호 배타적인 3상태는 union 타입 필요.

**수정**: `type ViewMode = 'editor' | 'preview' | 'split'`. `useEffect([filePath])`에서 `isMd ? 'preview' : 'editor'`로 리셋. `viewMode === 'preview'`일 때 CM 설정 건너뜀. `updateListener`에서 `setContent(text)` 호출로 split 모드 실시간 미리보기 동기화.

---

## L020 — CodeMirror `updateListener`에서 `setContent` 호출 필수 — split 뷰 실시간 미리보기; `justLoadedRef`로 초기 동기화 보호 (#99)

**날짜**: 2026-03-21 | **카테고리**: React | **범위**: `shell/src/panels/workspace/Editor.tsx`

**문제**: split 모드에서 CodeMirror 타이핑 시 ReactMarkdown 미리보기가 업데이트되지 않음 — `content` 상태가 파일 로드 시에만 설정되고 CM 편집 시에는 설정되지 않았기 때문.

**근본 원인**: CM `updateListener`는 자동저장 디바운스만 담당. `updateListener`에 `setContent(text)`를 추가하면 실시간 미리보기 가능.

**수정**: `updateListener`에서: `justLoadedRef.current`가 `true`면 `false`로 설정 후 early return. 아니면 자동저장 디바운스 전에 `setContent(text)` 호출.

---

## L021 — 드래그 리사이즈 핸들: 안정적인 추적을 위해 `window`에 `pointermove`/`pointerup` 등록 (#99)

**날짜**: 2026-03-21 | **카테고리**: UI | **범위**: `shell/src/panels/workspace/WorkspaceCenterPanel.tsx`

**문제**: 마우스 기반 리사이즈는 커서가 패널 크기 변경보다 빠르게 이동하면 추적이 끊길 수 있음.

**수정**: `onPointerDown`에서: `document.body.classList.add('resizing-col')`, `window.addEventListener('pointermove', onMove)`, `window.addEventListener('pointerup', onUp)`. `onUp`에서 두 이벤트 제거. `App.tsx` naia-resize-handle 구현 패턴과 동일.

---

## L022 — X11 XReparentWindow 네이티브 창은 CSS opacity를 무시함 — CSS keep-alive 사용 불가 (#99)

**날짜**: 2026-03-21 | **카테고리**: Tauri | **범위**: `shell/src/panels/browser/*, shell/src-tauri/src/browser.rs`

**문제**: 브라우저 패널을 React keep-alive(position:absolute, opacity:0/1)에 포함시켰지만, CSS opacity가 Chrome X11 창에 아무 효과가 없었음 — opacity:0이어도 Chrome이 그대로 보여 워크스페이스 패널 위를 덮음.

**근본 원인**: `XReparentWindow`는 Chrome을 OS 네이티브 자식 창으로 임베드함. 이 창들은 WebKit compositor와 별개로 OS 레벨에서 합성됨. CSS z-index/opacity/visibility는 X11 네이티브 창에 효과 없음.

**수정**: `PanelDescriptor`에 `keepAlive?: boolean` 추가. 브라우저 패널은 `keepAlive: false` 설정 — 비활성화 시 언마운트(→ `browser_embed_close` 호출). 근본 해결은 #102에서: `XUnmapWindow`/`XMapWindow`를 사용하는 `browser_embed_hide`/`show` Rust 커맨드 추가.

---

## L023 — `onSessionsUpdate`는 catch 블록에서도 반드시 호출 — 그렇지 않으면 부모 `initialized`가 false로 남음 (#99)

**날짜**: 2026-03-21 | **카테고리**: React | **범위**: `shell/src/panels/workspace/SessionDashboard.tsx`

**문제**: `workspace_get_sessions` invoke 실패 시 `WorkspaceCenterPanel`의 로딩 스피너가 영원히 표시됨. `initialized` 상태는 `onSessionsUpdate` 콜백으로 설정되는데, 이 콜백이 성공 경로에서만 호출됐음.

**근본 원인**: `SessionDashboard.loadSessions`에서 `onSessionsUpdateRef.current?.(result)`를 성공 시에만 호출. 에러 시 `finally`가 `loading:false`만 설정하고 `onSessionsUpdate`를 호출하지 않아 `WorkspaceCenterPanel.initialized`가 `false`로 남음.

**수정**: `catch` 블록에 `onSessionsUpdateRef.current?.([])` 추가. 빈 배열이 "세션 없음"을 부모에 알리고 `initialized:true`를 트리거함.

---

## L024 — 패널 CSS는 시맨틱 토큰만 사용 — 테마별 정의 필수, 색상 하드코딩 금지 (#99)

**날짜**: 2026-03-21 | **카테고리**: UI | **범위**: `shell/src/styles/global.css`

**문제**: 워크스페이스 패널 CSS가 `var(--bg-base, #1a1a1a)` 등 다크 폴백값을 사용함. 이 토큰들이 어떤 테마에도 정의되지 않아, 활성 테마와 무관하게 항상 다크로 렌더링됨.

**근본 원인**: `--bg-base`, `--text-primary`, `--border-color`, `--accent`, `--hover-bg` 등 시맨틱 토큰이 패널 CSS에서 사용됐지만 테마 블록에 정의되지 않음 — 테마별로는 `--espresso`, `--cream` 같은 원시 변수만 정의됐음.

**수정**: 모든 테마(espresso/midnight/ocean/forest/rose/latte/sakura/cloud)에 시맨틱 토큰 섹션 추가. 각 테마에서 `--bg-base → var(--espresso-dark)`, `--text-primary → var(--cream)` 등으로 매핑. `global.css`에 PANEL CSS STANDARD 주석으로 문서화.

---

## L025 — GitHub Notifications API `subject.url`은 `RepositoryVulnerabilityAlert`에서 null — 항상 null 체크 (#91)

**날짜**: 2026-03-21 | **분류**: API | **범위**: `issue-desk/src/github/notifications.ts`

**문제**: GitHub API가 `RepositoryVulnerabilityAlert` 알림 유형에서 `subject.url`로 `null`을 반환함. 직접 문자열 삽입 시 런타임 크래시 발생.

**근본 원인**: GitHub API 스펙상 특정 알림 유형에서 `subject.url`이 `null`일 수 있음. URL 변환 헬퍼에 null 가드 없음.

**수정**: `subjectHtmlUrl()`에 null 체크 추가. `apiUrl`이 `null`이고 type이 `RepositoryVulnerabilityAlert`면 `repoHtmlUrl + '/security/dependabot'` 반환. 그 외 null 케이스는 `repoHtmlUrl` 폴백.

---

## L026 — `markRead` 낙관적 업데이트는 try 블록 안에서 해야 함 — 실패 시 롤백 미구현 (#91)

**날짜**: 2026-03-21 | **분류**: UI | **범위**: `issue-desk/src/components/NotificationList.tsx`

**문제**: API 응답 전에 낙관적 UI 업데이트(알림 읽음 처리)를 적용했으나, API 실패 시에도 읽음 상태가 UI에 남음.

**근본 원인**: UI 상태 업데이트가 try/catch 앞에 위치. API 호출 실패 시 UI만 읽음 처리된 상태로 남음.

**수정**: `setNotifications()` 호출을 try 블록 안으로 이동, `await markRead()` 성공 후에 실행. catch 시 알림은 읽지 않음 상태 유지. `console.error`로 실패 로그.

---

## L027 — 키 변경이 있는 레코드 수정은 delete+upsert 패턴 — Zustand persist 배열 패턴 (#91)

**날짜**: 2026-03-21 | **분류**: React | **범위**: `issue-desk/src/components/Settings.tsx`, `issue-desk/src/store/community.ts`

**문제**: 커뮤니티 프로파일의 repo 이름(키)을 수정하고 `upsertProfile`로 저장하면, 기존 키 항목이 배열에 그대로 남아 두 항목이 공존.

**근본 원인**: `upsertProfile`은 `repo` 필드로 매칭. `repo`가 바뀌면 `findIndex`가 `-1`을 반환해 기존 항목 제거 없이 추가됨.

**수정**: 저장 시 `editingOriginalRepo !== editingProfile.repo`이면 먼저 `deleteProfile(editingOriginalRepo)` 호출 후 `upsertProfile(editingProfile)`. 이전 키 항목이 제거된 뒤 새 항목 삽입.

---

## L028 — E2E Tauri mock에서 `plugin:store|get`은 `[value, exists]` 튜플 반환 필수 — `null` 반환 시 `Store.get()` 크래시 (#116)

**날짜**: 2026-03-22 | **분류**: E2E | **범위**: `shell/e2e/*.spec.ts`

**문제**: E2E 딥링크 테스트(D1/D2)가 실패. `@tauri-apps/plugin-store`의 `Store.get(key)`가 `invoke('plugin:store|get')` 결과를 `[value, exists]`로 구조분해하는데, mock이 `null`을 반환해 `TypeError: Cannot destructure property '0' of null` 발생.

**근본 원인**: Store API 계약: `invoke('plugin:store|get')`은 항상 `[value, exists]` 튜플 반환. `invoke('plugin:store|load')`는 Resource ID 정수 반환(null 아님). mock이 둘 다 `null`을 반환해 구조분해 실패.

**수정**:
```js
if (cmd === "plugin:store|load") return 1;
if (cmd === "plugin:store|get") return [null, false];
```

---

## L029 — keepAlive 패널: Playwright `toBeVisible()`은 부모 `opacity:0` 무시 — `slot--active` 선택자 사용 (#116)

**날짜**: 2026-03-22 | **분류**: E2E | **범위**: `shell/e2e/*.spec.ts`

**문제**: E2E 테스트에서 `.workspace-panel`이 `not.toBeVisible()`이어야 하는데 이미 "visible"로 판정. keepAlive 패널은 항상 마운트 상태. 부모 `.content-panel__slot`이 비활성 시 `opacity:0` (display:none 아님) 사용.

**근본 원인**: Playwright의 `toBeVisible()`은 요소 자신의 CSS(`display`, `visibility`, `opacity`)는 체크하지만, 부모의 `opacity`는 무시. 부모 `opacity:0`이어도 자식 요소는 "visible"로 판정됨.

**수정**: `.content-panel__slot--active .workspace-panel` 선택자 사용. 활성 슬롯은 `opacity:1`이고, 패널이 비활성이면 선택자 자체가 매칭 안 되므로 `not.toBeVisible()` 정상 통과.

---

## L030 — `FILE_PATH_RE`에 `(?<![/\w])` lookbehind 필수 — 서브 경로 오탐 방지 (#116)

**날짜**: 2026-03-22 | **분류**: 정규식 | **범위**: `shell/src/components/ChatPanel.tsx`

**문제**: 정규식 `/(\/[\w\-\.\/]+\.ext)/`가 `shell/src/App.tsx`에서 `/src/App.tsx`를 추출. 상대경로의 서브 경로가 절대경로 딥링크 버튼으로 렌더링됨.

**근본 원인**: lookbehind 없음. 문자열 내 모든 `/`가 절대경로 시작점으로 매칭 가능(단어 문자, 다른 `/` 뒤에 있어도).

**수정**: `(?<![/\w])` lookbehind 추가 — `/` 앞이 단어 문자나 다른 `/`이면 매칭 차단. 또한 `tsx`/`jsx`를 `ts`/`js`보다 앞에 위치(longest-match 확장자 해석).


---

## L031 — 비동기 도구 호출 중복 방지를 위한 `openDirsRef` add-before-await 패턴 (#119)

**날짜**: 2026-03-23 | **분류**: React | **범위**: `shell/src/panels/workspace/WorkspaceCenterPanel.tsx`

**문제**: 동일 dir로 `skill_workspace_new_session`이 동시 호출되어 중복 PTY 프로세스가 생성됨. 상태 기반 dedup에 경쟁 조건 존재.

**근본 원인**: React 상태 업데이트(`setTerminals`)는 비동기 — `terminalsRef.current`는 렌더 바디에서만 갱신됨. `await pty_create` 중 두 번째 호출이 state 커밋 전에 도착하면 dedup 체크를 통과.

**수정**: 별도 `useRef` Set(`openDirsRef`)을 dedup의 단일 진실 원천으로 사용. `await pty_create` **이전**에 dir 추가(즉시 차단). 실패(`catch`) 또는 탭 닫기 시에만 삭제.

---

## L032 — `terminalsRef.current`는 `setTerminals` 시점이 아닌 렌더 시점에 갱신됨 (#119)

**날짜**: 2026-03-23 | **분류**: React | **범위**: `shell/src/panels/workspace/WorkspaceCenterPanel.tsx`

**문제**: 리뷰어들이 "`setTerminals`가 이미 filter를 큐에 넣었으면 `terminalsRef`에서 탭을 못 찾을 수 있다"며 경쟁 조건을 반복 플래깅.

**근본 원인**: `terminalsRef.current = terminals`는 **렌더 바디**에서 동기적으로 실행됨. `setTerminals()` 호출 시 즉시 갱신되지 않음. `setTerminals()`와 다음 렌더 사이에 `terminalsRef.current`는 여전히 이전 배열.

**수정**: 코드 변경 불필요 — 패턴이 정확함. 타이밍 불변성을 설명하는 주석 추가로 향후 리뷰어 혼란 방지.

---

## L033 — xterm.js keepAlive: `opacity:0 + pointerEvents:none` 사용, `display:none` 절대 금지 (#119)

**날짜**: 2026-03-23 | **분류**: 프론트엔드 | **범위**: `shell/src/panels/workspace/Terminal.tsx`

**문제**: 터미널 컴포넌트에 keepAlive 스태킹 필요(여러 PTY, 하나만 활성). `display:none`을 고려했으나 FitAddon이 깨짐.

**근본 원인**: `FitAddon.fit()`이 컨테이너의 `offsetWidth`/`offsetHeight`로 크기를 계산. `display:none` 시 이 값이 `0` → `fit()`이 `0×0` 반환 → PTY가 잘못된 크기로 리사이즈됨.

**수정**: 모든 터미널 컨테이너에 `position:absolute; inset:0` CSS 적용(스태킹). 비활성 터미널은 인라인 `opacity:0; pointerEvents:none`으로 숨김. `pty_resize` 호출 전 `if (!rows || !cols) return` 가드 추가.

---

## L034 — X11 네이티브 임베드 keepAlive: CSS opacity 대신 IPC XUnmapWindow/XMapWindow 사용 — L022 완결 (#102)

**날짜**: 2026-03-23 | **분류**: 프론트엔드 | **범위**: `shell/src/panels/browser/*, shell/src/stores/panel.ts`

**문제**: L022에서 CSS opacity가 X11 네이티브 윈도우에 효과 없음을 문서화하고 `keepAlive:false`를 임시방편으로 사용(언마운트/리마운트 = 탭 전환마다 Chrome 재시작 = 느림, 검은 화면).

**근본 원인**: X11 네이티브 자식 윈도우는 OS 레벨에서 합성됨. WebKit 컴포지터가 제어 불가. React 컴포넌트 언마운트 시 `browser_embed_close`(Chrome 재시작) 발생.

**수정**: browser 패널에 `keepAlive:true` 설정. Rust에 `browser_embed_hide`(XUnmapWindow)와 `browser_embed_show`(XMapWindow) 추가. `panel.ts setActivePanel`이 탭 전환 시 IPC 명령 호출. Chrome이 살아있음 — 재시작 없음, 검은 화면 없음.

---

## L035 — Store action invoke-before-set 패턴: 모달 순서 보장을 위해 invoke는 set() 이전 호출 필수 (#102)

**날짜**: 2026-03-23 | **분류**: React | **범위**: `shell/src/stores/chat.ts, shell/src/components/ChatPanel.tsx`

**문제**: PermissionModal이 나타났으나 1프레임 동안 Chrome X11 윈도우 뒤에 가려짐. `ChatPanel` `useEffect`가 React 리렌더 후 `browser_embed_hide`를 호출해, 모달이 처음 나타나는 렌더 중 Chrome이 여전히 보임.

**근본 원인**: `useEffect`는 React DOM 커밋 **이후** 실행됨(post-paint). 이 창에서 네이티브 Chrome 윈도우가 새로 렌더된 모달 위에 남아있음.

**수정**: `invoke('browser_embed_hide')`를 `setPendingApproval` store action에서 `set({pendingApproval})` **이전**에 호출. Store action은 동기 실행 — React가 상태 변경을 인식하기 전에 invoke 디스패치됨. `useEffect` 방식은 네이티브 윈도우 순서에 1프레임 늦음.

---

## L036 — pendingApproval을 null로 설정하는 모든 경로는 setPendingApproval hide와 대칭이어야 함 (#102)

**날짜**: 2026-03-23 | **분류**: React | **범위**: `shell/src/stores/chat.ts`

**문제**: `setPendingApproval`에 `browser_embed_hide`를 추가한 후, `finishStreaming`이나 `newConversation`으로 approval이 해제되면 Chrome이 영구적으로 숨겨진 채로 남음. 이 경로들이 `browser_embed_show` 없이 직접 `set()`을 호출.

**근본 원인**: `clearPendingApproval`만 `setPendingApproval`의 "mirror"로 작성됨. `finishStreaming`과 `newConversation`은 show 가드를 우회해 `set()`을 직접 사용.

**수정**: `pendingApproval:null`로 설정하는 모든 경로에 가드 필수: `if (get().pendingApproval && usePanelStore.getState().activePanel === "browser") invoke("browser_embed_show")`. 3곳: `clearPendingApproval`, `finishStreaming`(`set()` 이전), `newConversation`(`set()` 이전). `clearPendingApproval`에도 `get().pendingApproval` 가드 추가 — 이전 hide가 없었을 때 show() 발화 방지.

---

## L037 — E2E Tauri mock 명령 이름은 Rust invoke() 호출과 정확히 일치해야 함 — 불일치 시 silent no-op 상태 (#102)

**날짜**: 2026-03-23 | **분류**: E2E | **범위**: `shell/e2e/*.spec.ts`

**문제**: Browser 패널 E2E 테스트에서 패널이 `"no-chrome"` 상태에 고착. `browser_check`가 `browser_check_available`로 mock되어 `undefined`(not `true`)를 반환. 패널 상태 머신이 `"ready"` 상태에 도달하지 못함.

**근본 원인**: Tauri mock은 정확한 문자열 매치로 인터셉트. mock의 명령 이름이 실제 Rust 명령과 다르면 `return undefined`로 폴스루. `browser_check`의 경우 `undefined`는 falsy — 상태 머신이 `"no-chrome"` 경로로 분기.

**수정**: mock 작성 전 항상 실제 Rust invoke 이름(`shell/src-tauri/src/*.rs` `invoke!` 매크로 또는 TS 파일)을 grep으로 확인. `"browser_check_available"` 아닌 `"browser_check"` 사용. 동작 단언 전 패널이 예상 상태에 도달하는지 mock 검증.
