# 테스트 전략 + 교훈

> 미러: `.agents/workflows/testing-strategy.yaml`

## 1. 테스트 피라미드

### 유닛 테스트
- **도구**: Vitest
- **범위**: 순수 함수, 스토어 로직, 유틸 모듈
- **예시**: `parseEmotion()`, `useChatStore` 액션, `encodeWav`
- **실행**: `pnpm --filter shell test`

### 컴포넌트 테스트
- **도구**: Vitest + @testing-library/react + jsdom
- **범위**: React 컴포넌트 격리 테스트 (mock된 의존성)
- **예시**: ToolActivity 상태 표시, SettingsModal 저장, ChatPanel 청크 렌더링

**주의사항:**
- `vi.resetModules()` — 같은 모듈을 다른 mock으로 테스트할 때 필수
- `afterEach`에 `vi.clearAllMocks() + vi.resetModules()` 사용 (`vi.restoreAllMocks()` 아님)
- 모듈 레벨 사이드이펙트가 있으면 `await import('../module')` 동적 임포트

### 통합 테스트
- **도구**: Vitest (Agent), cargo test (Rust)
- **범위**: 다중 모듈 상호작용, 프로토콜 준수

### E2E 테스트 (Tauri Webview 자동화)
- **도구**: WebdriverIO v9 + tauri-driver (실제 앱 자동화)
- **위치**: `shell/e2e-tauri/specs/*.spec.ts`
- **실행**: `cd shell && pnpm run test:e2e:tauri`
- **전제조건**:
  - `webkit2gtk-driver` 설치
  - `cargo install tauri-driver --locked`
  - `shell/.env`에 `GEMINI_API_KEY` 설정
  - Gateway 실행 중 (`:18789`)
  - 디버그 바이너리 빌드됨
- **시나리오 (7개)**:
  1. 앱 실행 → 설정 모달 표시
  2. 설정 입력 → API 키, Gateway URL/토큰, 도구 권한
  3. 기본 채팅 → 실제 LLM 왕복 통신
  4. skill_time → 시간 도구 실행
  5. skill_system_status → 시스템 상태 조회
  6. skill_memo → 메모 저장 + 읽기
  7. 정리 → 메모 삭제

**주의사항:**
- **Stale Element**: WebKitGTK에서 React 리렌더 시 element 참조가 무효화됨 → `browser.execute()`로 매번 DOM 직접 조회
- **React 입력**: textarea value는 native setter + `dispatchEvent('input')` → 100ms 대기 → send 버튼 클릭
- **LLM 비결정성**: Gemini가 항상 요청한 도구를 사용하지 않음 → tool-success 요소 OR 텍스트 패턴 매칭으로 유연한 검증

---

## 2. 검증 체크리스트

**커밋 전 반드시 순서대로 실행:**

```bash
# 1. 테스트
pnpm --filter shell test    # Shell 테스트 전체 통과
pnpm --filter agent test    # Agent 테스트 전체 통과

# 2. 린트
cd shell && pnpm run check  # Biome: 에러 없음

# 3. 빌드
cd shell && pnpm run build  # tsc + vite 빌드 깨끗

# 4. Tauri E2E (Gateway + API key 필요)
cd shell && pnpm run test:e2e:tauri  # 7개 spec 전부 통과

# 5. VERIFY = 실제 빌드 + 실행 (건너뛰지 말 것!)
cd shell && cargo tauri build  # Tauri 앱 빌드
# 빌드된 앱 실행 → 창 뜨고 agent 연결 확인
```

---

## 3. 코드 리뷰 프로세스

단일 리뷰로는 부족하다. **3회전 리뷰**:

| 회전 | 초점 | 예시 |
|------|------|------|
| 1차 | **CRITICAL** — 보안, 리소스 누수, 데이터 손실 | listener 누수, localStorage 크래시, timeout 미설정 |
| 2차 | CRITICAL 수정 확인 + **MEDIUM** | CSS 변수 누락, 불리언 false 누락, 버튼 CSS 리셋 |
| 3차 | **SHOULD FIX** — 정확성 엣지 케이스 | 중복 ID 처리, 미등록 ID 경고, 저장 시 값 누락 |

---

## 4. 교훈 (잊지 말 것)

### 프로세스를 건너뛰면 안 된다

**Phase 1 교훈**: PLAN/CHECK/TDD 건너뛰고 "완료" 선언 → 유저가 버그 발견, 신뢰 하락

**Phase 3 세션 3 교훈**: BUILD로 직행, 프로세스 건너뜀 → 유저가 2번 지적

**해결**: 세션 시작 시 `development-cycle.yaml` 읽기. 예외 없음.

### Vitest 모듈 캐싱

**문제**: 테스트가 혼자 실행하면 통과하지만 전체 스위트에서 실패

**원인**: 모듈 레벨 mock 상태가 테스트 간 공유

**해결**: `afterEach`에 `vi.clearAllMocks() + vi.resetModules()`. 동적 임포트 사용.

### Boolean false 처리

**문제**: `enableTools: false`가 설정에서 누락

**원인**: `enableTools && {...}` → false가 falsy라서 무시됨. `enableTools || undefined` → false가 undefined로 변환됨.

**해결**: 불리언 null 체크는 `value != null` 사용.

### 이벤트 리스너 누수

**문제**: Tauri invoke() 실패 시 listen() 리스너가 영구 잔류

**해결**: invoke()를 try/catch로 감싸서 실패 시 unlisten() 호출. 안전장치로 120초 타임아웃 추가.

### CSS 테마 변수

**문제**: 새 CSS 변수(--error)를 일부 테마에만 추가

**해결**: CSS 변수 추가 시 **8개 테마 전부** 확인.

---

## 5. 안티 패턴

| 이름 | 설명 | 해결 |
|------|------|------|
| VERIFY 건너뛰기 | 테스트 통과 후 빌드/실행 없이 "완료" 선언 | **VERIFY = 실제 빌드 + 앱 실행** |
| 코드 먼저 | 테스트 전에 구현 작성 | **TDD: 테스트 먼저 → 최소 코드 → 리팩터** |
| 1회 리뷰 | 한 번 리뷰로 다 잡을 거라 생각 | **3회전: CRITICAL → MEDIUM → SHOULD FIX** |
| console.log | console.log/warn/error 사용 | **구조화된 Logger만 사용** |
| falsy 불리언 체크 | &&/\|\| 로 false 값 처리 | **명시적 null 체크: value != null** |
