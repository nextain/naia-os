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
