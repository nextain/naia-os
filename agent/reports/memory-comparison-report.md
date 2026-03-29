# Memory System Comparison Benchmark Report

**Issue**: #172 — 유사 프로젝트 벤치마크 비교
**Date**: 2026-03-29 ~ 2026-03-30
**Benchmark**: 55 tests (12 categories), keyword judge, 1 run per test
**Embedding**: Gemini embedding-001 (3072d) for all vector-enabled systems
**LLM**: Gemini 2.5 Flash for response generation

---

## 1. Results

| # | System | Stars | Core (51) | Rate | Grade |
|:-:|--------|------:|:---------:|:----:|:-----:|
| 1 | **Letta (MemGPT)** | 21.8K | 49/51 | **96%** | **A** |
| 2 | **Naia** (MemorySystem+Mem0) | — | 47/51 | **92%** | **A** |
| 3 | **OpenClaw (Cline)** | 59.6K | 43/51 | **84%** | **B** |
| 4 | **Super Agent Party** | 2.0K | 43/51 | **84%** | **B** |
| 5 | **mem0 OSS** | 51.4K | 42/51 | **82%** | **B** |
| 6 | **jikime-adk** | 5 | 17/51 | 33% | F |
| 7 | **jikime-mem** | 0 | 13/51 | 25% | F |
| 8 | **project-airi** (no memory) | 36.2K | 12/51 | 24% | F |
| 9 | **Open-LLM-VTuber** (no memory) | 6.4K | 11/51 | 22% | F |

**Not tested**: Zep CE (OpenAI API key required — Graphiti hardcodes OpenAI embeddings)

---

## 2. Category Breakdown

| Category | w | Naia | Letta | OpenClaw | SAP | mem0 | j-adk | j-mem | airi | OLV |
|----------|:-:|:----:|:-----:|:--------:|:---:|:----:|:-----:|:-----:|:----:|:---:|
| direct_recall | 1 | 9/9 | **9/9** | 9/9 | 8/9 | 8/9 | 1/9 | 0/9 | 0/9 | 0/9 |
| semantic_search | 2 | **9/9** | **9/9** | 9/9 | 7/9 | 8/9 | 1/9 | 0/9 | 0/9 | 0/9 |
| proactive_recall | 2 | 2/5 | **4/5** | 3/5 | 4/5 | 3/5 | 1/5 | 2/5 | 0/5 | 0/5 |
| abstention | 2 | 9/9 | **9/9** | **9/9** | **9/9** | **9/9** | 9/9 | 8/9 | 9/9 | 8/9 |
| irrelevant_isolation | 1 | **3/3** | **3/3** | 2/3 | **3/3** | **3/3** | **3/3** | **3/3** | **3/3** | **3/3** |
| multi_fact_synthesis | 2 | **2/3** | **2/3** | 2/3 | 1/3 | 1/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| entity_disambiguation | 2 | **4/4** | **4/4** | 3/4 | 3/4 | 2/4 | 1/4 | 0/4 | 0/4 | 0/4 |
| contradiction_direct | 2 | **3/3** | **3/3** | 3/3 | 2/3 | **3/3** | 0/3 | 0/3 | 0/3 | 0/3 |
| unchanged_persistence | 1 | **3/3** | **3/3** | 3/3 | 3/3 | 2/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| noise_resilience | 2 | **3/3** | **3/3** | 0/3 | **3/3** | **3/3** | 1/3 | 0/3 | 0/3 | 0/3 |
| *contradiction_indirect* | *0* | 2/2 | 1/2 | 2/2 | 1/2 | 1/2 | 0/2 | 0/2 | 0/2 | 0/2 |
| *temporal_history* | *0* | 1/2 | 2/2 | 2/2 | 1/2 | 1/2 | 0/2 | 0/2 | 0/2 | 0/2 |

---

## 3. Systems Description

### Tier A (90%+)

**Letta (MemGPT)** — 96%, 21.8K stars
- 3-tier 메모리: Core (RAM) + Archival (Disk) + Recall (Cache)
- UC Berkeley 연구팀 출신, OS 가상 메모리 개념을 AI에 적용
- 강점: proactive_recall, entity_disambiguation, temporal_history

**Naia** — 92%
- 4-Store 아키텍처: Episodic + Semantic + Procedural + Working
- Ebbinghaus decay, Hebbian KG, reconsolidation (현재 recall 비활성)
- 강점: multi_fact_synthesis, contradiction_indirect, noise_resilience

### Tier B (75-89%)

**OpenClaw (Cline)** — 84%, 59.6K stars
- SQLite + Gemini vector + FTS5 hybrid (0.7 vector + 0.3 text)
- 코딩 에이전트 IDE 확장, 메모리는 Markdown 파일 기반
- 약점: noise_resilience 0/3 (메모리 파일에 잡음이 혼재)

**Super Agent Party** — 84%, 2.0K stars
- mem0 + FAISS 벡터 스토어
- 올인원 AI 동반자 (neuro-sama + openclaw 통합)
- mem0 백엔드와 동일하지만 FAISS 벡터 스토어가 약간 다른 결과

**mem0 OSS** — 82%, 51.4K stars
- 범용 AI 메모리 레이어, 벡터 DB + LLM fact extraction
- Naia의 실제 벡터 검색 백엔드
- entity_disambiguation에서 Naia(4/4)보다 약함(2/4)

### Tier F (벡터 검색 없음 또는 없는 메모리)

**jikime-adk** — 33%, SQLite FTS5만 (벡터는 MCP only, CLI 미지원)
**jikime-mem** — 25%, SQLite LIKE만 (ChromaDB 미연결)
**project-airi** — 24%, 메모리 WIP (스텁)
**Open-LLM-VTuber** — 22%, 대화 히스토리만 (영구 메모리 없음)

---

## 4. Key Findings

### 4.1 벡터 검색이 결정적
- 벡터 검색 있음: 82~96%
- 벡터 검색 없음: 22~33%
- **차이: ~50-70%p** — 메모리 시스템의 가치는 벡터 검색 품질에 크게 의존

### 4.2 Letta가 1위
- 3-tier 메모리 아키텍처가 가장 효과적
- proactive_recall (4/5), entity_disambiguation (4/4), temporal_history (2/2)에서 강세
- Naia 대비 4%p 차이는 주로 proactive_recall에서 발생

### 4.3 Naia의 위치
- mem0 백엔드 위에 4-Store 레이어를 올린 구조
- raw mem0(82%)보다 10%p 높은 92% — importance gating + fact merging의 효과
- decay/KG를 recall에 연결하면 Letta 수준 도달 가능 (#173)

### 4.4 SAP 재검증
- 1차 실행: 71% — FAISS 인메모리 상태가 Python 프로세스 간 소실
- 수정 후: 84% — persistent subprocess로 상태 유지
- 적대적 리뷰에서 발견된 버그 수정으로 +13%p

### 4.5 OpenClaw의 특이점
- noise_resilience 0/3 — Markdown 파일 기반이라 잡음 메시지가 메모리에 그대로 포함
- 나머지 카테고리는 strong — hybrid search (벡터+FTS5)가 효과적

---

## 5. Limitations

| 한계 | 영향 |
|------|------|
| keyword judge (claude-cli보다 관대) | 전체적으로 5-6%p 상승 추정 |
| runs=1 (이전 기준은 runs=3) | 통계적 안정성 낮음 |
| fact 15개 + topK=10 | 검색 정밀도 미측정 |
| Zep 미테스트 | OpenAI 키 필요 |
| 단일 세션 테스트 | 크로스세션 미커버 |

---

## 6. Review Log

적대적 리뷰 8패스 수행, 7건 자동 수정:

| 패스 | 렌즈 | 결과 | 수정 |
|------|------|------|------|
| 1 | 정확성 | FIXED | SAP FAISS 상태 소실, setup/update silent failure |
| 2 | 완전성 | FIXED | 인덱싱 대기 없음, bonus 필터 버그, Zep limit 위치 |
| 3-6 | 일관성+패턴+운영+테스트 | FIXED | 이스케이프 불완전, SAP timeout 리스너 미해제 |
| 7 | 종합 재확인 | CLEAN | - |
| 8 | 종합 재확인 | CLEAN | - |

---

## 7. Infrastructure

```
src/memory/benchmark/comparison/
├── types.ts              — BenchmarkAdapter interface
├── run-comparison.ts     — Multi-adapter benchmark runner
├── adapter-naia.ts       — Naia MemorySystem+Mem0 (92%)
├── adapter-mem0.ts       — raw mem0 OSS (82%)
├── adapter-letta.ts      — Letta REST API + Gemini embedding (96%)
├── adapter-openclaw.ts   — OpenClaw CLI + Gemini vector+FTS5 (84%)
├── adapter-sap.ts        — Super Agent Party mem0+FAISS subprocess (84%)
├── adapter-zep.ts        — Zep CE REST API (untested)
├── adapter-jikime-mem.ts — jikime-mem REST API (25%)
├── adapter-jikime-adk.ts — jikime-adk Go CLI (33%)
└── adapter-no-memory.ts  — No memory baseline (22-24%)
```

Usage:
```bash
GEMINI_API_KEY=... pnpm exec tsx src/memory/benchmark/comparison/run-comparison.ts \
  --adapters=naia,mem0,letta,openclaw,sap \
  --judge=keyword --runs=1
```

---

## 8. Next Steps

| Priority | Task | Expected Impact |
|:--------:|------|-----------------|
| 1 | **#173**: decay/KG를 recall 경로에 연결 | Naia 92% → Letta(96%) 수준 도달 |
| 2 | **#174**: Naia Shell 실제 적용 | 체감 성능 측정 |
| 3 | Zep 테스트 (OpenAI 키 확보 후) | 비교 완성 |
| 4 | claude-cli judge + runs=3 재실행 | 통계적 신뢰성 향상 |
