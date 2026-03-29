# Memory System 1차 완료 보고서

**프로젝트**: Naia OS — Alpha Memory System
**이슈**: #151 체감 검증 + 약점 개선 (Epic #145)
**일자**: 2026-03-28 ~ 2026-03-29
**결과**: 86% (44/51), Grade B

---

## 1. Baseline — 시작 시점의 상태

### 1.1 기존 구현

naia-os의 메모리 시스템은 신경과학 기반 4-Store 아키텍처로 설계되었습니다:

- **Episodic Memory** — 타임스탬프 이벤트 (해마 모델)
- **Semantic Memory** — 추출된 사실/지식 (신피질 모델)
- **Procedural Memory** — 스킬과 반성 (기저핵 모델)
- **Working Memory** — ContextManager (#65, 별도 관리)

핵심 모듈:
- `decay.ts` — Ebbinghaus 망각 곡선
- `importance.ts` — 3축 중요도 점수 (importance, surprise, emotion)
- `knowledge-graph.ts` — Hebbian 연상 + spreading activation
- `reconsolidation.ts` — 모순 감지 + 자동 팩트 업데이트
- `adapters/local.ts` — JSON 파일 기반 저장 (zero dependency)
- `adapters/mem0.ts` — mem0 벡터 검색 백엔드

### 1.2 Baseline 벤치마크 (내부)

| 항목 | 점수 | 문제 |
|------|:----:|------|
| decayCurveAccuracy | 1.000 | |
| recallStrengthening | 0.600 | |
| spreadingActivation | 1.000 | |
| hebbianCorrelation | 1.000 | |
| contradictionDetection | 1.000 | |
| reconsolidation | 1.000 | |
| contextDependentRetrieval | 1.000 | |
| **importanceRetention** | **0.333 (warn)** | 고중요도 기억이 60일 만에 프루닝 |
| **consolidationCompression** | **1:1 (warn)** | 에피소드→팩트 압축 없음 |
| importanceGating | 1.000 | |
| **총합** | **80% (8 pass / 2 warn)** | |

### 1.3 Baseline 체감 성능

측정 도구 없음. "체감 성능"이라고 부를 수 있는 수치가 존재하지 않았음.

---

## 2. 개선 사항

### 2.1 메모리 코어 개선

| 모듈 | 변경 | 이유 |
|------|------|------|
| `decay.ts` | BASE_DECAY 0.16→0.08, IMPORTANCE_DAMPING 0.8→0.85 | 사용자 이름(importance 0.7+)이 2달이면 잊혀짐 → 60일+ 생존으로 |
| `index.ts` | 팩트 병합 로직 추가 (union-find + Jaccard similarity + temporal proximity) | 6에피소드→6팩트(1:1) → 6에피소드→2팩트(3:1)로 압축 |
| `reconsolidation.ts` | 한국어 조사 substring 매칭 + false positive 방지 | "에디터는"↔"에디터" 매칭 가능, "use"↔"because" 오탐 차단 |
| `index.ts` | 모순 감지 시 첫 번째 매칭만 업데이트 | 동일 content로 여러 팩트 덮어쓰기 방지 |
| `index.ts` | consolidateNow에서 매 반복 existingFacts 재조회 | stale cache 방지 |
| `adapters/` | local.ts + mem0.ts 서브디렉토리 분리 | 독립 패키지 추출 준비 |

### 2.2 내부 벤치마크 결과 (개선 후)

| 항목 | Before | After |
|------|:------:|:-----:|
| importanceRetention | 0.333 (warn) | **1.000 (pass)** |
| consolidationCompression | 1:1 (warn) | **3:1 (pass)** |
| **총합** | **80%** | **100% (10/10 pass)** |

### 2.3 프로세스 개선

| 변경 | 내용 |
|------|------|
| review-pass Pass 6 추가 | "테스트 유효성" 렌즈 — 테스트가 실제 코드 경로를 거치는지 검증 |
| E2E 워크플로우 수정 | 테스트 실행 전 코드 경로 추적 필수 |
| API 호출 규칙 | 배치로 모아서 보내거나 지연 처리. 병렬 금지. |

---

## 3. 벤치마크 설명

### 3.1 구성

| 항목 | 값 |
|------|:---:|
| 테스트 케이스 | 55개 (12 카테고리) |
| 실행 횟수 | 3회 per test, 2/3 majority voting |
| 파이프라인 | MemorySystem(Mem0Adapter) — importance gating + reconsolidation + mem0 vector search |
| LLM | Gemini 2.5 Flash (응답 생성) |
| Judge | Claude CLI (LLM 채점) + keyword (majority voting) |
| Baseline 비교 | 메모리 없이 LLM만 (동일 judge) |

### 3.2 12개 카테고리

| # | 카테고리 | 가중치 | 테스트 수 | 측정 대상 |
|---|----------|:------:|:--------:|----------|
| 1 | direct_recall | 1 | 9 | 저장된 사실을 직접 질문으로 인출 |
| 2 | semantic_search | 2 | 9 | 직접 언급 안 한 표현으로 의미 검색 |
| 3 | proactive_recall | 2 | 5 | 묻지 않았는데 자연스럽게 기억 적용 |
| 4 | abstention | 2 | 9 | 말한 적 없는 것을 지어내지 않음 (환각 방지) |
| 5 | irrelevant_isolation | 1 | 3 | 무관한 질문에 기억을 꺼내지 않음 |
| 6 | multi_fact_synthesis | 2 | 3 | 여러 기억을 조합하여 종합 답변 |
| 7 | entity_disambiguation | 2 | 4 | 타인 정보와 사용자 정보 구분 |
| 8 | contradiction_direct | 2 | 3 | 명시적 변경 감지 및 업데이트 |
| 9 | unchanged_persistence | 1 | 3 | 변경 안 한 사실은 그대로 유지 |
| 10 | noise_resilience | 2 | 3 | 잡담 속에 묻힌 사실 추출 |
| 11 | *contradiction_indirect* | *0* | *2* | *간접적 변화 감지 (bonus)* |
| 12 | *temporal_history* | *0* | *2* | *변경 이력 인식 (bonus)* |

### 3.3 등급 기준

| 등급 | 조건 |
|:----:|------|
| **A** | core ≥ 90% + bonus 50%+ |
| **B** | core ≥ 75% |
| **C** | core ≥ 60% |
| **F** | core < 60% OR abstention 실패 |

### 3.4 알려진 한계

| 한계 | 영향 | 대응 (P2) |
|------|------|----------|
| fact 15개 + topK=10 ≈ 거의 전수 검색 | 검색 정밀도 미측정 | #173: fact 100개 확대 |
| decay/KG가 recall 경로에서 비활성 | 4-Store 아키텍처의 핵심이 미검증 | #173: KG를 recall에 연결 |
| 단일 세션 내 테스트 | 크로스세션 시나리오 미커버 | #173: 크로스세션 테스트 |
| 카테고리당 3개 | 통계적 표본 부족 | #173: 6개+ 보강 |
| mem0 LLM이 fact 재작성 | 원본 보존 vs 재작성 미분리 | #173: 분리 테스트 |

---

## 4. 결과

### 4.1 최종 점수

```
═══════════════════════════════════════════════════════════
  COMPREHENSIVE MEMORY BENCHMARK
  Judge: claude-cli | runs: 3 | voting: 2/3
  Pipeline: MemorySystem(Mem0Adapter)
  ⚠ decay/KG inactive in recall path
═══════════════════════════════════════════════════════════

  Core:  44/51 (86%) with memory
               8/51 (16%) without memory
  Delta: +36 tests (memory contribution)
  Bonus: 2/4
  Grade: B
```

### 4.2 카테고리별

| 카테고리 | w | withMem | noMem | Delta | 판정 |
|----------|:-:|:------:|:-----:|:-----:|:----:|
| direct_recall | 1 | **9/9** | 0/9 | +9 | ✅ Perfect |
| semantic_search | 2 | **8/9** | 0/9 | +8 | ✅ |
| abstention | 2 | **9/9** | 5/9 | +4 | ✅ Perfect |
| irrelevant_isolation | 1 | **3/3** | 3/3 | 0 | ✅ Perfect |
| contradiction_direct | 2 | **3/3** | 0/3 | +3 | ✅ Perfect |
| noise_resilience | 2 | **3/3** | 0/3 | +3 | ✅ Perfect |
| proactive_recall | 2 | 3/5 | 0/5 | +3 | 🟡 60% |
| multi_fact_synthesis | 2 | 2/3 | 0/3 | +2 | 🟡 67% |
| entity_disambiguation | 2 | 2/4 | 0/4 | +2 | 🟡 50% |
| unchanged_persistence | 1 | 2/3 | 0/3 | +2 | 🟡 67% |
| *contradiction_indirect* | *0* | *1/2* | *0/2* | *+1* | *🟡 bonus* |
| *temporal_history* | *0* | *1/2* | *0/2* | *+1* | *🟡 bonus* |

### 4.3 핵심 수치

| 지표 | 값 |
|------|:---:|
| **메모리 기여도** | **+36 tests (16% → 86%)** |
| 검색 성공 카테고리 | 6/10 Perfect |
| 검색 필요 개선 카테고리 | 4/10 |
| noMemory에서도 통과하는 테스트 | 8개 (주로 abstention + irrelevant_isolation) |

---

## 5. AIRI 비교 (정성 분석)

| 항목 | Naia OS | AIRI |
|------|---------|------|
| 아키텍처 | 4-Store (E/S/P/W) | 메시지 히스토리 |
| 망각 | Ebbinghaus decay | 없음 (영구 저장) |
| 모순 감지 | 키워드+substring 휴리스틱 | 없음 |
| 감정 모델링 | 3축 점수 | 없음 |
| Knowledge Graph | Hebbian + spreading activation | 없음 |
| 벡터 검색 | mem0 (3072d) | pgvector (1536d) |
| 테스트 | 11파일 + 55개 벤치마크 | 없음 |
| 구현량 | ~1000줄 + 벤치마크 ~700줄 | ~100줄 |
| 벤치마크 점수 | **86% Grade B** | 미측정 (#172에서 비교 예정) |

---

## 6. 다음 단계

| 순서 | 이슈 | 내용 |
|:----:|------|------|
| 1 | **#172** | 유사 프로젝트 벤치마크 비교 (mem0, Zep, MemGPT, AIRI) |
| 2 | **#174** | Naia Shell 실제 적용 — 3-session 체감 테스트 |
| 3 | **#173** | P2 개선 — fact 100개, KG 활성화, 크로스세션 → Grade A |
| 4 | **#152** | 출시 판정 — P2 완료 후 |

---

## 7. 독립 패키지 준비 상태

`src/memory/` 외부 의존성 **0**. 디렉토리 통째로 추출 가능.

```
src/memory/
├── index.ts              — MemorySystem 오케스트레이터
├── types.ts              — 인터페이스 정의
├── decay.ts              — Ebbinghaus 망각 곡선
├── importance.ts         — 3축 중요도 점수
├── knowledge-graph.ts    — Hebbian 연상 기억
├── reconsolidation.ts    — 모순 감지/업데이트
├── embeddings.ts         — 임베딩 유틸
├── adapters/
│   ├── local.ts          — JSON 기반 (zero dep)
│   └── mem0.ts           — mem0 벡터 백엔드
├── benchmark/            — 종합 벤치마크 (7개 러너)
└── __tests__/            — 11개 테스트 파일
```

검토 방향:
- 별도 레포 분리 → 비공개 가능
- npm 패키지 배포 → 다른 프로젝트에 이식
- project-airi 업스트림 기여 → 성능 비교 확정 후
