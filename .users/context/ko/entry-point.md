# Naia

Bazzite 기반 배포형 AI OS. Naia(AI 아바타)가 상주하는 개인 운영체제.

> 이 문서는 `CLAUDE.md` (영문)의 한국어 미러입니다.

## 필수 읽기 (세션 시작 시)

1. `.agents/context/agents-rules.json` — 프로젝트 핵심 규칙 (SoT)
2. `.agents/context/project-index.yaml` — 컨텍스트 인덱스 + 미러링 규칙

## 핵심 원칙

1. **최소주의** — 필요한 것만 만든다
2. **배포 먼저** — Phase 0부터 ISO 자동 빌드
3. **Avatar 중심** — Naia가 살아있는 경험
4. **데몬 아키텍처** — AI가 항상 켜져있다
5. **프라이버시** — 로컬 실행 기본

## 라이선스

- **소스코드**: Apache 2.0
- **AI 컨텍스트** (`.agents/`, `.users/`, `AGENTS.md`): CC-BY-SA 4.0

## 개발 프로세스

**핵심 흐름** (13 phases):
Issue → Understand (gate) → Scope (gate) → Investigate → Plan (gate) → Build → Review → E2E Test → Post-test Review → Sync (gate) → Sync Verify → Report → Commit

**반복 리뷰**: 연속 2회 수정 없을 때까지 반복.

상세는 영문 `CLAUDE.md` 및 `.agents/workflows/issue-driven-development.yaml` 참조.

## Harness Engineering

| 훅 | 목적 |
|----|------|
| `sync-entry-points.js` | 엔트리포인트 3파일 자동 동기화 |
| `cascade-check.js` | 삼중 미러링 누락 경고 |
| `commit-guard.js` | E2E/sync 완료 전 커밋 경고 |

상세: `.agents/context/harness.yaml`
