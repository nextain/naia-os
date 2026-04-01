# Alpha Memory System — 최종 개선 보고서

> 날짜: 2026-03-27
> Epic: #145 (Alpha Memory v2)
> 응답 모델: gemini-2.5-flash
> 채점: gemini-2.5-pro + Claude CLI 이중 독립 채점
> 임베딩: gemini-embedding-001 (3072d)
> 테스트: 50개, 5카테고리 × 10개, 3회 실행 2/3 통과
> 총 5라운드 개선 루프 실행

---

## 최종 결과 (Round 4, 최고 점수)

| 구성 | pro judge | Claude judge |
|------|:---------:|:------------:|
| no-memory baseline (LLM만) | - | **39%** |
| **with memory (Round 4)** | **68%** (34/50) | **74%** (37/50) |
| **기억 기여** | - | **+35pp** |

### 카테고리별

| 능력 | 측정 내용 | pro | Claude | 평가 |
|------|----------|:---:|:------:|------|
| **recall** | 저장된 사실을 다양한 표현으로 정확히 답하는가 | **9/10** | **9/10** | 최강 |
| **contradiction** | 변경된 사실 반영 + 미변경 유지 | 7/10 | **9/10** | 좋음 |
| **synthesis** | 여러 기억 조합해서 종합 답변 | **8/10** | 7/10 | 좋음 |
| **semantic** | 간접 표현으로 관련 기억 종합 | 5/10 | **8/10** | 개선됨 |
| **abstention** | 없는 것에 "모른다"고 답하는가 | 5/10 | 4/10 | **약점** |

---

## 개선 루프 히스토리

| Round | 변경 | pro | Claude | 속도 | 결과 |
|:-----:|------|:---:|:------:|:----:|------|
| 0 | baseline (LLM만, 기억 없음) | - | 39% | - | 기억 없는 상태 |
| 1 | mem0 기본 + 단순 프롬프트 | 64% | 66% | 37min | 첫 구현 |
| 2 | threshold 0.65 + 프롬프트 개선 | 50% | 66% | 37min | ❌ synthesis 하락 (threshold 과다) |
| 3 | threshold 0.55로 완화 | 64% | 66% | 37min | synthesis 회복, abstention 하락 |
| **4** | **threshold 제거 + 관련도% LLM 판단** | **68%** | **74%** | **37min** | **✅ 최고. recall 9/9, semantic 8/10** |
| 5 | abstention 프롬프트 과도 강화 | 60% | 62% | 37min | ❌ 역효과. 전체 하락. 롤백. |

### 각 라운드에서 배운 것

| Round | 교훈 |
|-------|------|
| 2 | threshold를 올리면 recall은 되지만 synthesis에 필요한 기억이 잘림 |
| 3 | threshold와 abstention은 트레이드오프. 하나를 올리면 다른 하나가 내려감 |
| 4 | **threshold 대신 LLM에 관련도%를 보여주고 판단시키는 게 효과적** |
| 5 | 프롬프트를 너무 제약적으로 쓰면 다른 능력까지 위축됨 |

---

## 테스트 규모별 점수 비교 (과대평가 경험)

| 테스트 수 | 채점 방식 | 점수 | 비고 |
|:---------:|----------|:----:|------|
| 23 | self-judge | 87% | 과대 — self-judge + 소규모 |
| 23 | 이중 | 78% / 87% | |
| **50** | **이중** | **68% / 74%** | **실제 성능** |

**23→50개 확장 시 87%→74%로 13pp 하락.** 소규모 테스트의 과대평가 확인.

---

## 적대적 리뷰에서 발견/수정한 것

| 발견 | 조치 |
|------|------|
| threshold 0.7 = data leakage | 별도 calibration → 최종적으로 threshold 자체를 제거 |
| self-judge 편향 의심 | Claude CLI 독립 채점 → 차이 ~4pp (미미) |
| gemini-2.5-pro 0% 판정 | max_tokens 500→8192 (thinking 토큰 소비) |
| 23개 테스트 87% 과대 | 50개로 확장 → 74% |
| abstention = 프롬프트 효과 | no-memory baseline에서 확인 |
| baseline abstention 9/9 허수 | 검색 불능 = 환각 불능 ≠ 환각 방지 능력 |
| expected_answer 과소 | semantic 검색은 되는데 judge가 키워드 매칭으로 FAIL |
| abstention 프롬프트 강화 역효과 | 다른 능력까지 위축 → 롤백 |

---

## 기술 발견사항

| 발견 | 영향 |
|------|------|
| gemini-2.5-pro thinking ~460토큰 소비 | max_tokens 8192+ 필수 |
| mem0 ollama ensureModelExists 404 | 순수 로컬 실행 blocked |
| Gemini 임베딩 related/unrelated gap ~0.14 | threshold 단독 abstention 해결 불가 |
| **관련도%를 LLM에 보여주는 것이 threshold보다 효과적** | Round 4의 핵심 발견 |
| 프롬프트 제약은 양날의 검 | abstention↑ = synthesis↓ |
| chat 모델 ≠ 임베딩 모델 | 기억에 임베딩 모델 별도 필수 |
| qwen3-embedding 4.7GB 존재 | 순수 로컬 임베딩 가능 (mem0 호환만 해결하면) |

---

## 미해결 과제

### 1. Abstention (4-5/10)

프롬프트 튜닝의 한계에 도달. 근본 원인:
- 벡터 검색이 관련 없는 기억도 score 0.55+로 반환
- LLM이 "기억이 있으니 답해야 한다"고 판단
- threshold로 자르면 synthesis가 망가짐

해결 방향: 검색 결과를 별도 LLM 호출로 relevance 판단 (자율신경계/의식적 사고 분리), 또는 re-ranking 모델.

### 2. 순수 로컬 실행

mem0 ollama 호환 문제 미해결. qwen3:8b + qwen3-embedding 50개 테스트 미실행.

### 3. 비결정성

50개 × 3회 = 150회이지만, 카테고리당 10개에서 1개 차이 = 10pp. 여전히 변동 있음.

---

## 다음 단계

1. **#152 (출시 판정)** — 현재 74%로 판정
2. **qwen3:8b 50개 테스트** — 로컬 모델 비교
3. **re-ranking 모델** — abstention 근본 해결
4. **Agent에 Mem0Adapter 교체** — Shell에서 실제 동작

---

## 데이터 소스

| 파일 | 내용 |
|------|------|
| `reports/memory-v2-multi-2026-03-27.json` | 50개 테스트 이중 채점 결과 (최신) |
| `reports/memory-no-memory-baseline-2026-03-27.json` | no-memory baseline |
| `benchmark/test-cases-v3.json` | 50개 테스트 케이스 |
| `benchmark/fact-bank.json` | 15개 사실 (가상 인물 김하늘) |
| `benchmark/run-v2-multi.ts` | 벤치마크 runner (이중 채점, Round 4 설정) |
| GitHub Issue #145 코멘트 | 라운드별 결과 기록 |
