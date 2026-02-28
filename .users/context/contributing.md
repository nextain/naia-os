<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Naia OS 기여 가이드

`.agents/context/contributing.yaml`에 대한 사람이 읽을 수 있는 가이드입니다.

## 목적

AI 에이전트(그리고 AI 도구를 사용하는 사람)가 Naia OS 프로젝트에 올바르게 기여하는 방법을 설명합니다.

---

## 시작하기: 컨텍스트 읽기 순서

새로운 기여자(AI 에이전트 포함)는 반드시 아래 파일을 순서대로 읽어야 합니다:

1. `.agents/context/agents-rules.json` — 프로젝트 핵심 규칙 (SoT)
2. `.agents/context/project-index.yaml` — 컨텍스트 인덱스 + 미러링 규칙
3. `.agents/context/philosophy.yaml` — 핵심 철학

---

## 코드 기여 규칙

### 개발 프로세스

```
PLAN → CHECK → BUILD (TDD) → VERIFY → CLEAN → COMMIT
```

상세: `.agents/workflows/development-cycle.yaml`

### 핵심 규칙

| 규칙 | 설명 |
|-----|------|
| TDD | 테스트 먼저 (RED) → 최소 구현 (GREEN) → 리팩터 |
| VERIFY | 실제 앱을 실행해서 확인 — 타입체크만으로는 불충분 |
| Logger | `console.log/warn/error` 금지 — 구조화된 Logger만 사용 |
| Biome | 린팅과 포매팅은 Biome 따르기 |
| 최소 변경 | 필요한 것만 수정 — 과도한 리팩터링 금지 |

---

## 컨텍스트 기여 규칙

### 라이선스

AI 컨텍스트 파일은 **CC-BY-SA 4.0**으로 라이선스됩니다.

### SPDX 헤더 필수

| 파일 유형 | 헤더 형식 |
|----------|----------|
| YAML (.yaml) | `# SPDX-License-Identifier: CC-BY-SA-4.0` |
| JSON (.json) | `"_license": "CC-BY-SA-4.0 \| Copyright 2026 Nextain"` |
| Markdown (.md) | `<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->` |

### 미러링 원칙

- **SoT** (단일 진실 소스)는 `.agents/`에 있음
- `.users/`는 사람이 읽을 수 있는 미러
- 한국어 미러: `.users/context/{파일}.md`
- 영문 미러: `.users/context/en/{파일}.md`
- 변경 시 **반드시** 미러도 함께 업데이트

### 전파 규칙

컨텍스트 변경 시 전파 순서: self → parent → siblings → children → mirror

---

## 철학 준수

기여 시 반드시 보존해야 할 원칙:

- **AI 주권** — 벤더 종속 없음
- **프라이버시 우선** — 로컬 실행 기본
- **투명성** — 오픈소스, 숨겨진 동작 없음

확장은 가능합니다:
- 기존 원칙과 충돌하지 않는 새 원칙 추가
- 새로운 스킬, 워크플로우, 통합 추가

---

## 스킬 기여

- **형식**: OpenClaw `skill.json` 스펙
- **위치**: `agent/assets/default-skills/`
- **네이밍**: `naia-{이름}/` 패턴
- **테스트**: 실제 LLM 호출로 테스트 (mock 아님)

---

## PR 가이드라인

### 제목 형식

```
type(scope): description
```

**타입**: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`

### 체크리스트

- [ ] 테스트 통과 (`npm test` / `pytest`)
- [ ] VERIFY 단계 완료 (앱이 실제로 실행됨)
- [ ] 아키텍처 변경 시 컨텍스트 파일 업데이트
- [ ] `console.log/warn/error` 잔류 없음
- [ ] 중요한 변경이면 작업 로그 기록

---

## 언어 규칙

| 대상 | 언어 |
|-----|------|
| 코드 및 컨텍스트 | 영어 |
| AI 응답 및 로그 | 한국어 |
| 커밋 메시지 | 영어 |

---

## 관련 파일

- **SoT**: `.agents/context/contributing.yaml`
- **영문 미러**: `.users/context/en/contributing.md`
