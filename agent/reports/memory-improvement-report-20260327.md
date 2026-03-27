# Alpha Memory System — 개선 보고서

> 날짜: 2026-03-27
> Epic: #145 (Alpha Memory v2 — 체감 성능 중심 재설계)
> 응답 모델: gemini-2.5-flash
> 채점: gemini-2.5-pro + Claude CLI 이중 독립 채점
> 임베딩: gemini-embedding-001 (3072d)
> 벤치마크: 50개 테스트, 5카테고리 × 10개, 3회 실행 2/3 통과
> 총 실행 시간: ~37분 (인코딩 207초 + 테스트 2186초)

---

## 요약

| 구성 | pro judge | Claude judge |
|------|:---------:|:------------:|
| **no-memory baseline** (LLM만, 기억 없음) | - | **39%** |
| **with memory** (mem0 + gemini) | **64%** (32/50) | **66%** (33/50) |
| **기억 시스템 기여** | - | **+27pp** |

---

## 카테고리별 상세

### 각 카테고리가 측정하는 것

| 카테고리 | 측정 내용 | 예시 |
|---------|----------|------|
| **recall** | 저장된 사실을 다양한 표현으로 물었을 때 정확히 답하는가 | "내 이름?" "어디 살아?" "커피 뭐 마셔?" |
| **abstention** | 말한 적 없는 것에 대해 "모른다"고 올바르게 답하는가 | "Docker 뭐라 했지?" "고양이 키운다고 했지?" |
| **semantic** | 간접적 상위 개념으로 물었을 때 관련 기억을 종합하는가 | "업무 스타일?" "음료 취향?" "개발 환경?" |
| **contradiction** | 변경된 사실을 정확히 반영하고, 변경 안 한 건 유지하는가 | "에디터 바꿨는데 뭐야?" "매운 거 잘 먹는다고 했지?" |
| **synthesis** | 여러 기억을 조합해서 종합적으로 답하는가 | "거주지+사업+취미 알려줘" "기술 스택 전체?" |

### 결과

| 카테고리 | pro judge | Claude judge | 평가 |
|---------|:---------:|:------------:|------|
| **recall** | 7/10 | 7/10 | 안정적. 두 judge 일치. |
| **abstention** | 3/10 | 6/10 | 약점. judge 간 차이 큼 (판정 기준 불일치). |
| **semantic** | 4/10 | 6/10 | 중간. 간접 표현 매칭 불안정. |
| **contradiction** | **9/10** | **9/10** | **최강.** mem0 UPDATE 메커니즘 효과. 두 judge 일치. |
| **synthesis** | 9/10 | 5/10 | judge 간 차이 매우 큼. 주관적 판정 영역. |

### Judge 간 차이 분석

| 패턴 | 건수 | 의미 |
|------|:----:|------|
| 둘 다 PASS | 대부분 | 합의 — 신뢰 가능 |
| pro=PASS, Claude=FAIL | synthesis에서 다수 | Claude가 synthesis를 더 엄격하게 판정 |
| pro=FAIL, Claude=PASS | abstention/semantic에서 다수 | pro가 abstention/semantic을 더 엄격하게 판정 |
| 둘 다 FAIL | 확실한 실패 | 신뢰 가능 |

**둘 다 일치하는 카테고리** (recall, contradiction)가 가장 신뢰할 수 있는 점수.

---

## 테스트 규모별 점수 비교

| 테스트 수 | 채점 방식 | 점수 | 비고 |
|:---------:|----------|:----:|------|
| 23 | self-judge | 87% | 과대 — self-judge + 소규모 |
| 23 | 이중 (pro/Claude) | 78% / 87% | pro가 약간 엄격 |
| **50** | **이중 (pro/Claude)** | **64% / 66%** | **실제 성능** |

**23개 87% → 50개 66%: 21pp 하락.** 소규모 테스트의 과대평가 확인.

---

## 기억 시스템 기여도 분석

### no-memory baseline (39%)

기억 없이 LLM만으로 같은 질문:
- recall 0/9 — 개인 정보를 모르니 당연
- abstention 9/9 — "지어내지 마세요" 프롬프트만으로 만점
- semantic 0/3, contradiction 0/2 — 기억 없으면 불가

**abstention은 기억 시스템과 무관.** 프롬프트 지시만으로 달성.

### 기억 시스템이 기여하는 것

| 능력 | no-memory | with memory | 기여 |
|------|:---------:|:-----------:|:----:|
| recall | 0% | **70%** | **+70%** |
| contradiction | 0% | **90%** | **+90%** |
| semantic | 0% | **40-60%** | **+40-60%** |
| synthesis | 0% | **50-90%** | **+50-90%** |
| abstention | 100% | **30-60%** | **-40~-70%** ⚠️ |

**기억이 있으면 abstention이 오히려 떨어짐** — 벡터 검색이 관련 없는 기억도 함께 반환해서 LLM이 혼동.

---

## 개선 작업 히스토리

| 작업 | 변경 내용 | 효과 | 검증 |
|------|----------|------|------|
| 서브스트링 매칭 | `keywordScore()`에 substring fallback 추가 | v1: 47→58% (+11pp) | 101 tests passed |
| mem0 벡터 검색 | mem0ai/oss + Gemini 임베딩 | v1: 58→62% (+4pp) | calibrated threshold |
| Agent 와이어링 | `handleChatRequest`에 encode/recall 연결 | 앱에서 기억 동작 | 버그 3개 수정 |
| 벤치마크 v2 | LLM 응답 레이어 측정 | 실체감 점수 | 이중 채점 |
| 테스트 확장 | 23→50개 (LLM 생성) | 과대평가 보정 | 5×10 균형 |

### 적대적 리뷰에서 발견/수정한 것

| 발견 | 조치 |
|------|------|
| threshold 0.7 = data leakage | 별도 calibration 데이터로 0.6 결정 |
| self-judge 편향 의심 | Claude CLI 독립 채점 추가 → 차이 ~4pp 확인 |
| gemini-2.5-pro 0% 판정 | max_tokens 500→8192 수정 (thinking 토큰 소비) |
| 23개 테스트 87% 과대 | 50개로 확장 → 66% (실제 성능) |
| abstention = 프롬프트 효과 | no-memory baseline에서 9/9 확인 |
| baseline abstention 9/9 허수 | 검색 불능 = 환각 불능 ≠ 환각 방지 능력 |

---

## 기술 발견사항

| 발견 | 영향 |
|------|------|
| gemini-2.5-pro thinking 토큰 ~460개 소비 | max_tokens를 충분히 (8192+) 줘야 응답 나옴 |
| mem0 ollama 클라이언트 ensureModelExists 404 | 순수 로컬 mem0 실행 blocked, 공유 DB로 우회 |
| Gemini 임베딩 related/unrelated score gap ~0.14 | threshold 단독 abstention 해결 불가 |
| qwen3-embedding 4.7GB ollama 모델 존재 | 순수 로컬 임베딩 가능 (mem0 호환 문제만 해결하면) |
| chat 모델 ≠ 임베딩 모델 | 기억 시스템에 임베딩 모델 별도 필수 (0.3~4.7GB) |

---

## 미해결 과제

### 1. Abstention 약점 (3-6/10)

벡터 검색이 관련 없는 기억도 반환 → LLM이 이를 바탕으로 답변 → 없는 정보를 지어낸 것처럼 보임.
해결: 검색 결과의 relevance를 LLM이 한 번 더 판단하는 레이어, 또는 re-ranking.

### 2. Semantic 불안정 (4-6/10)

검색은 되지만 (score 0.7+), LLM이 검색 결과를 종합해서 자연스럽게 답하는 능력이 불안정.
표현에 따라 되기도 하고 안 되기도 함.

### 3. Synthesis judge 불일치 (pro 9/10 vs Claude 5/10)

"여러 사실을 조합해서 답하라"의 판정 기준이 주관적.
pro는 관대, Claude는 엄격. 판정 프롬프트 표준화 필요.

### 4. 순수 로컬 실행

mem0 ollama 호환 문제 미해결. qwen3:8b + qwen3-embedding 조합으로 순수 로컬 실행이 목표이나, mem0 내부 API 호환성 문제.

### 5. qwen3:8b 50개 테스트 비교

현재 gemini만 50개 테스트 완료. qwen3:8b (MiniCPM 급 모델)로 같은 테스트를 돌려야 로컬 모델의 실제 성능을 알 수 있음.

---

## 다음 단계

1. **#152 (출시 판정)** — 현재 64-66%로 출시 가능한지 판단
2. **abstention 개선** — re-ranking 또는 relevance 판단 레이어
3. **qwen3:8b 50개 테스트** — 로컬 모델 비교 (시간 소요 ~2시간)
4. **mem0 ollama 호환** — 순수 로컬 실행

---

## 데이터 소스

| 파일 | 내용 |
|------|------|
| `agent/reports/memory-v2-multi-2026-03-27.json` | 50개 테스트 이중 채점 결과 |
| `agent/reports/memory-no-memory-baseline-2026-03-27.json` | no-memory baseline |
| `agent/reports/memory-baseline-2026-03-26.json` | v1 키워드 매칭 baseline |
| `agent/src/memory/benchmark/test-cases-v3.json` | 50개 테스트 케이스 |
| `agent/src/memory/benchmark/fact-bank.json` | 15개 사실 (가상 인물 김하늘) |
| `agent/src/memory/benchmark/run-v2-multi.ts` | 벤치마크 runner (이중 채점) |
| `agent/src/memory/benchmark/run-v2-no-memory.ts` | no-memory baseline runner |
| GitHub Issue #145 코멘트 | 단계별 결과 기록 |
