# Alpha Memory System — 개선 보고서

> 날짜: 2026-03-27
> Epic: #145 (Alpha Memory v2 — 체감 성능 중심 재설계)
> 벤치마크: query-templates.json 55개 테스트, 12개 능력
> LLM: Gemini 2.5 Flash (임베딩: gemini-embedding-001, 3072d)
> 1회 실행 시간: ~3분 (Gemini API 호출 포함)

---

## 능력 정의

| 능력 | 측정하는 것 | 예시 | 현재 측정 방식의 한계 |
|------|-----------|------|---------------------|
| **direct_recall** | 저장한 사실을 정확한 키워드로 물었을 때 꺼내는가 | "내 에디터 뭐야?" → Neovim | 가장 기본적. 한계 적음. |
| **semantic_search** | 다른 표현으로 물었을 때 의미적으로 연결하는가 | "내 기술 스택?" → TypeScript, Neovim | 임베딩 모델 품질에 의존 |
| **proactive_recall** | 묻지 않았는데 관련 기억을 자연스럽게 적용하는가 | "에디터 설정 도와줘" → Neovim 기반 제안 | 검색 레이어만 측정, LLM 응답 미측정 |
| **abstention** | 말한 적 없는 것에 대해 "모른다"고 하는가 | "Docker 뭐라고 했지?" → 없음 | **⚠️ 검색 결과 0건=통과로 판정 → 못 찾는 시스템이 만점** |
| **irrelevant_isolation** | 무관한 질문에 기억을 불필요하게 꺼내지 않는가 | "날씨 어때?" → 개인정보 미노출 | abstention과 같은 문제 |
| **multi_fact_synthesis** | 여러 기억을 조합해서 답하는가 | "프로젝트 세팅해줘" → TS+Next+탭+다크 | 검색 레이어만 측정, LLM 조합 능력 미측정 |
| **entity_disambiguation** | 타인 정보와 내 정보를 혼동하지 않는가 | "동료는 Vim, 내 에디터는?" → Neovim | 벡터 검색에서 유사 엔티티 혼동 가능 |
| **contradiction_direct** | "X로 바꿨어" 같은 명시적 변경을 반영하는가 | "Cursor로 바꿨어" → Neovim에서 업데이트 | mem0 내장 UPDATE로 잘 동작 |
| **contradiction_indirect** | 부정어 없이 간접적 변화를 감지하는가 | "Python이 재밌더라" → 관심 변화 인지 | 가장 어려운 능력, LLM 추론 필요 |
| **unchanged_persistence** | 변경하지 않은 사실이 그대로 유지되는가 | 에디터 바꿨지만 인덴트는 그대로 | 업데이트가 다른 팩트를 건드리지 않는지 |
| **temporal_history** | 변경 이력을 아는가 | "에디터 뭐 쓰다가 바꿨지?" → Neovim→Cursor | mem0 history DB에 의존 |
| **noise_resilience** | 잡담 속에 묻힌 사실을 추출하는가 | "...아 맞다 모니터 바꿨어..." → 울트라와이드 | mem0 LLM 팩트 추출 능력 |

---

## 벤치마크 지표 문제점

### 문제 1: abstention을 검색 레이어에서 측정

**현재**: 검색 결과 0건 = abstention 통과
**문제**: 못 찾는 시스템이 만점 (baseline 9/9은 검색 불능에 의한 우연 통과)
**올바른 방식**: "있는 것"과 "없는 것"을 섞어서 질문하고, 각각에 대해 정확히 답하는지 측정. "없다"도 정답 중 하나.
**영향**: baseline 47% → 실질적으로 더 낮음. abstention/irrelevant 12점은 허수.

### 문제 2: LLM 응답이 아닌 검색 결과만 측정

**현재**: 검색된 내용에 기대 키워드가 포함되어 있는지만 확인
**문제**: proactive_recall, multi_fact_synthesis 등은 LLM이 검색 결과를 **어떻게 사용하는가**가 핵심인데, 검색 결과 유무만 봄
**영향**: 검색은 되지만 LLM이 자연스럽게 활용하는지는 미측정

### 문제 3: 비결정성 미처리

**현재**: 1회 실행 결과만 기록
**올바른 방식**: 3회 실행, 2/3 통과를 기준 (scenarios.md에 정의했지만 runner에서 미구현)

### 결론

**현재 벤치마크는 "검색 엔진 성능"을 측정하지, "기억하는 AI 체감 품질"을 측정하지 않습니다.**
진짜 체감 품질을 측정하려면 LLM 응답 레이어 테스트가 필요하고, 이는 #151 Round 2에서 다룰 과제.

---

## 능력별 상세 결과

| 능력 | baseline | 서브스트링 | mem0 (0.6) | 변화 | 비고 |
|------|:--------:|:---------:|:----------:|:----:|------|
| direct_recall | 3/9 | 5/9 | **9/9** | +6 | mem0 벡터 검색의 최대 강점 |
| semantic_search | 1/9 | 2/9 | **5/9** | +4 | 한국어 간접 표현 일부 실패 |
| proactive_recall | 0/5 | 2/5 | **4/5** | +4 | 검색은 되지만 LLM 활용 미측정 |
| abstention | 9/9 ※ | 8/9 | **0/9** | -9 | ※ baseline은 검색 불능에 의한 우연 통과 |
| irrelevant_isolation | 3/3 ※ | 3/3 | **3/3** | 0 | ※ 같은 문제 |
| multi_fact_synthesis | 0/3 | 0/3 | **1/3** | +1 | LLM 조합은 프롬프트 설계 영역 |
| entity_disambiguation | 3/4 | 3/4 | **2/4** | -1 | 벡터 검색이 유사 엔티티 혼동 |
| contradiction_direct | 1/3 | 2/3 | **3/3** | +2 | mem0 UPDATE 메커니즘 효과 |
| contradiction_indirect | 1/2 | 1/2 | **1/2** | 0 | LLM 추론 필요, 검색으로 불가 |
| unchanged_persistence | 2/3 | 2/3 | **2/3** | 0 | |
| temporal_history | 1/2 | 1/2 | **1/2** | 0 | |
| noise_resilience | 2/3 | 3/3 | **3/3** | +1 | mem0 LLM 팩트 추출 효과 |

---

## 개선 작업 상세

### 작업 1: 서브스트링 매칭 (+11pp)

**파일**: `agent/src/memory/local-adapter.ts` — `keywordScore()` 함수

**변경 내용**: 정확한 토큰 매칭만 하던 것에 서브스트링 매칭(0.8 가중치) 추가.
한국어 조사가 영어 단어에 붙는 문제(`TypeScript로`, `Cursor로` → 단일 토큰)를 해결.

**검증**: 101 유닛/통합 테스트 전부 통과. 기존 테스트 깨짐 없음.

### 작업 2: mem0 벡터 검색 (+4pp, calibrated)

**파일**: `agent/src/memory/benchmark/run-mem0.ts`, `agent/src/memory/mem0-adapter.ts`

**변경 내용**: mem0ai/oss SDK를 Gemini embedding + LLM으로 설정.

**Threshold calibration**:
- 벤치마크 데이터와 **별도로** 5개 사실 + 10개 쿼리로 calibration
- Related avg score: 0.67, Unrelated avg score: 0.56, Gap: 0.11
- Threshold 0.6 선택
- **적대적 리뷰**: threshold 0.7은 data leakage로 거절됨

---

## 기술 발견사항

| 발견 | 영향 |
|------|------|
| `text-embedding-004` deprecated | `gemini-embedding-001` (3072d) 사용 |
| `gemini-2.0-flash` deprecated | `gemini-2.5-flash` 사용 |
| mem0 OSS search score gap ~0.14 | threshold 단독으로 abstention 해결 불가 |
| 한국어 조사 + 영어 → 토크나이저 실패 | 서브스트링 매칭으로 해결 |
| mem0 `add()` 내부에서 LLM 호출 | 팩트 자동 추출, 원문과 다른 형태로 저장됨 |
| baseline abstention 9/9은 허수 | 검색 불능 = 환각 불능 ≠ 환각 방지 능력 |
| 벤치마크가 검색 레이어만 측정 | LLM 응답 품질(진짜 체감)은 미측정 |

---

## 다음 단계

1. **벤치마크 개선**: LLM 응답 레이어 측정 추가 (검색 결과 유무가 아닌, AI 최종 답변의 정확도)
2. **abstention 재설계**: "있는 것/없는 것" 혼합 질문, 정답표 대비 정확도
3. **Round 2**: 개선된 벤치마크로 재측정
4. **#152 (출시 판정)**: Round 2 후 판정

---

## 데이터 소스

- `agent/reports/memory-baseline-2026-03-26.json` — baseline 결과
- `agent/reports/memory-mem0-2026-03-26.json` — mem0 결과
- `agent/src/memory/benchmark/query-templates.json` — 55개 테스트 정의
- `agent/src/memory/benchmark/fact-bank.json` — 15개 사실 (가상 인물 김하늘)
- GitHub Issue #145 코멘트 — 단계별 비교표
