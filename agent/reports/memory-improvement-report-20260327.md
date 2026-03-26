# Alpha Memory System — 개선 보고서

> 날짜: 2026-03-27
> Epic: #145 (Alpha Memory v2 — 체감 성능 중심 재설계)
> 벤치마크: query-templates.json 55개 테스트, 12개 능력

## 요약

| 단계 | 점수 | 등급 | 핵심 변경 |
|------|:----:|:----:|----------|
| baseline (키워드 매칭) | **47%** (26/55) | F | 변경 없음 — 현재 시스템 실측 |
| + 서브스트링 매칭 | **58%** (32/55) | F | 한국어 조사 처리 (`TypeScript로` → `TypeScript` 매칭) |
| + mem0 벡터 검색 | **62%** (34/55) | F | Gemini embedding + LLM 팩트 추출 |

**등급 F인 이유**: abstention(환각 방지) 0/9 — FAIL이면 자동 F등급 규칙 적용.

---

## 능력별 상세

| 능력 | baseline | 서브스트링 | mem0 (0.6) | 변화 |
|------|:--------:|:---------:|:----------:|:----:|
| direct_recall (직접 인출) | 3/9 | 5/9 | **9/9** | +6 |
| semantic_search (시맨틱 검색) | 1/9 | 2/9 | **5/9** | +4 |
| proactive_recall (프로액티브) | 0/5 | 2/5 | **4/5** | +4 |
| abstention (환각 방지) | **9/9** | 8/9 | **0/9** | -9 ⚠️ |
| irrelevant_isolation (무관 격리) | **3/3** | 3/3 | **3/3** | 0 |
| multi_fact_synthesis (멀티팩트) | 0/3 | 0/3 | **1/3** | +1 |
| entity_disambiguation (엔티티 구분) | 3/4 | 3/4 | **2/4** | -1 |
| contradiction_direct (직접 모순) | 1/3 | 2/3 | **3/3** | +2 |
| contradiction_indirect (간접 모순) | 1/2 | 1/2 | **1/2** | 0 |
| unchanged_persistence (미변경 유지) | 2/3 | 2/3 | **2/3** | 0 |
| temporal_history (시간 이력) | 1/2 | 1/2 | **1/2** | 0 |
| noise_resilience (노이즈 내성) | 2/3 | 3/3 | **3/3** | +1 |

---

## 개선 작업 상세

### 작업 1: 서브스트링 매칭 (+11pp)

**파일**: `agent/src/memory/local-adapter.ts` — `keywordScore()` 함수

**변경 내용**: 정확한 토큰 매칭만 하던 것에 서브스트링 매칭(0.8 가중치) 추가.
한국어 조사가 영어 단어에 붙는 문제(`TypeScript로`, `Cursor로` → 단일 토큰)를 해결.

**검증**: 101 유닛/통합 테스트 전부 통과. 기존 테스트 깨짐 없음.

**부작용**: abstention 9/9 → 8/9 (서브스트링이 너무 넓어 1건 false positive). 허용 범위.

### 작업 2: mem0 벡터 검색 (+4pp, calibrated)

**파일**: `agent/src/memory/benchmark/run-mem0.ts`, `agent/src/memory/mem0-adapter.ts`

**변경 내용**: mem0ai/oss SDK를 Gemini embedding (`gemini-embedding-001`, 3072d) + Gemini LLM (`gemini-2.5-flash`)로 설정. 벡터 검색으로 시맨틱 매칭 확보.

**Threshold calibration**:
- 벤치마크 데이터와 **별도로** 5개 사실 + 10개 쿼리(related 5, unrelated 5)로 calibration
- Related avg score: 0.67, Unrelated avg score: 0.56
- Threshold 0.6 선택 (gap 중간)
- **적대적 리뷰**: 최초 threshold 0.7은 벤치마크 데이터를 보고 맞춘 것이라 data leakage로 거절됨

**부작용**: abstention 9/9 → 0/9 (벡터 검색이 항상 결과 반환, score gap 0.14로 분리 불가).

---

## 미해결 문제

### 1. Abstention 0/9 (Critical — F등급 원인)

**원인**: Gemini 임베딩 모델이 관련 없는 쿼리에도 0.6+ score를 반환. related/unrelated score gap이 ~0.14밖에 안 돼서 threshold로 분리 불가.

**해결 방향**:
- LLM 기반 relevance 판단: 검색 결과를 LLM에 보내 "이 기억이 쿼리와 실제로 관련 있는가?" 판별
- 또는 re-ranking 모델 도입
- 또는 다른 임베딩 모델 시도 (score 분리도가 더 좋은 모델)

**예상 효과**: abstention 6/9+ 달성 시 총점 70%+ (C등급) 가능.

### 2. Multi-fact Synthesis 1/3

mem0가 개별 팩트를 잘 추출하지만, "여러 기억을 조합한 제안"은 검색 시스템이 아닌 LLM 프롬프트 설계의 영역.

### 3. Semantic Search 5/9

일부 간접 표현 ("주말에 뭐 하지?" → 러닝)이 매칭 안 됨. 임베딩 모델의 한국어 시맨틱 이해도 한계.

---

## 기술 발견사항

| 발견 | 영향 |
|------|------|
| `text-embedding-004` deprecated | `gemini-embedding-001` (3072d) 사용 |
| `gemini-2.0-flash` deprecated | `gemini-2.5-flash` 사용 |
| mem0 OSS search score gap ~0.14 | threshold 단독 abstention 해결 불가 |
| 한국어 조사 + 영어 → 토크나이저 실패 | 서브스트링 매칭으로 해결 |
| mem0 `add()` 내부에서 LLM 호출 | 팩트 자동 추출, 원문과 다른 형태로 저장됨 |

---

## 다음 단계

1. **Round 2**: LLM relevance 판단으로 abstention 해결 → C등급(60%+, abstention pass) 목표
2. **#152 (출시 판정)**: Round 2 후 판정
3. **백로그**: LongMemEval 정식 벤치마크, 감정 가중치, 자율 기억 관리

---

## 데이터 소스

- `agent/reports/memory-baseline-2026-03-26.json` — baseline 결과
- `agent/reports/memory-mem0-2026-03-26.json` — mem0 결과
- `agent/src/memory/benchmark/query-templates.json` — 55개 테스트 정의
- `agent/src/memory/benchmark/fact-bank.json` — 15개 사실 (가상 인물 김하늘)
- GitHub Issue #145 코멘트 — 단계별 비교표
