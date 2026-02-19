# OpenClaw Skill Gap 클로저 + E2E 확장

## 날짜
- 시작: 2026-02-19
- 완료: 2026-02-19

## 프로젝트
`cafelua-os` — Agent skill layer + Gateway E2E

## 작업 내용

### 배경
Phase 3.5에서 73/73 Gateway proxy 함수를 모두 구현했으나, Shell UI에서 호출 가능한 skill 래퍼가 누락되어 실제로는 동작하지 않는 기능들이 있었음.

### 문제
- DiagnosticsTab → `skill_diagnostics` 없음 → 깨짐
- SettingsTab DevicePairing → `skill_agents`에 잘못된 액션 호출 → 깨짐
- AgentsTab 파일 관리 → `skill_agents`에 file 액션 없음 → 깨짐
- Session preview/patch/reset → `skill_sessions`에 미노출
- Config/Approvals 관리 → skill 자체 없음

### 해결

#### 신규 skill 4개 생성
| Skill | 액션 수 | Tier |
|-------|--------|------|
| `skill_diagnostics` | 6 (health, status, usage_status, usage_cost, logs_start, logs_stop) | 0 |
| `skill_device` | 13 (node CRUD, pair lifecycle, device pair, token mgmt) | 1 |
| `skill_config` | 5 (get, set, schema, models, patch) | 1 |
| `skill_approvals` | 3 (get_rules, set_rules, resolve) | 2 |

#### 기존 skill 2개 확장
| Skill | 추가 액션 |
|-------|----------|
| `skill_agents` | files_list, files_get, files_set |
| `skill_sessions` | preview, patch, reset |

#### Shell UI 수정
- SettingsTab: `skill_agents` → `skill_device`로 device 호출 수정
- SettingsTab: `DevicePairingSection`을 `enableTools` 게이트 안으로 이동

#### 코드 리뷰 수정
| # | 파일 | 수정 |
|---|------|------|
| 1 | config.ts | `set` 액션에 빈 patch 검증 추가 |
| 2 | approvals.ts | `decision` enum 런타임 검증 (approve/reject만 허용) |
| 3 | SettingsTab.tsx | enableTools 게이트 누락 수정 |
| 4 | gateway-e2e.test.ts | `it.skipIf(!nodeId)` 등록 시점 평가 버그 수정 |
| 5 | device.test.ts | 필수 파라미터 검증 테스트 11건 추가 |
| 6 | agents.test.ts | files_set path 검증 테스트 추가 |

#### E2E 테스트 확장
- 35개 → 67개 (19개 describe 블록)
- 커버: sessions, config, diagnostics, device, agents, approvals, tts, voicewake, cron, channels, skills, skill layer, tool runtime, node execution, security, events

### 테스트 결과
- Agent unit: 537 passed
- Shell unit: 241 passed
- TypeScript: 0 errors
- Gateway E2E: 59/67 passed (8 skipped — 노드 미연결)

### 커밋
- `57080ee` feat(agent): wire all remaining Gateway skills
- `2d1c084` fix(agent): code review — validation, E2E skipIf bug, comprehensive E2E coverage
