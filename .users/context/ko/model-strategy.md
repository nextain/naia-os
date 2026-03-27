# 모델 선정 전략

Naia OS 로컬 우선 AI를 위한 모델 결정. 사용자 데이터를 다루는 모든 모델은 로컬 실행 필수.

## 레퍼런스 omni 모델: MiniCPM 4.5-omni

대상 티어: 48GB+

| 컴포넌트 | 모델 | 역할 |
|----------|------|------|
| **Thinker (LLM)** | Qwen3 (~8B) | 텍스트 생성, 추론 백본 |
| **Vision** | SigLIP2 | 이미지 이해 (27층, 980px) |
| **Audio 입력** | Whisper-medium | 음성→텍스트 |
| **Talker (TTS)** | Llama 기반 AR (MiniCPMTTS) | 오디오 코덱 생성, Thinker 컨디셔닝 |
| **Code2Wav** | CosyVoice2 + HiFi-GAN | 코덱 → mel → 16kHz 파형 |

Thinker hidden_states가 4096→768로 프로젝션되어 Talker에 전달됨. 파인튜닝 시 LoRA 사용으로 분포 변화 최소화.

## 텍스트 전용 LLM: Qwen3-8B Abliterated

대상 티어: 8GB~24GB (omni 없이)

MiniCPM Thinker와 동일한 백본. 저사양 디바이스용. Q4_K_M 양자화 (~5GB).

### CPU 추론 벤치마크 (i9-13900K, DDR5 128GB, dGPU 없음)

| 지표 | 값 |
|------|-----|
| Prefill | 45~50 tok/s |
| Generate | **8.3~8.7 tok/s** |
| 500 토큰 | ~60초 |

### Abliteration 후보

| 모델 | 방법 | 파인튜닝 용이성 | 상태 |
|------|------|:-:|:-:|
| **mlabonne/Qwen3-8B-abliterated** | 깨끗한 abliteration만 | 최적 (클린 베이스) | 비교 테스트 대기 |
| **Josiefied-Qwen3-8B-abliterated-v1** | Abliteration + instruction tuning | 양호 (사전 튜닝됨) | 비교 테스트 대기 |

선정 기준: 검열 해제 효과, 생성 품질, 파인튜닝 용이성 (클린 베이스 선호 — 우리 튜닝 + 고객 튜닝 모두 고려).

## 임베딩 모델

### 현재: gte-Qwen2

Qwen3 임베딩 모델이 아직 없음. gte-Qwen2를 기준선으로 사용.

### 향후 계획

1. gte-Qwen3 출시 대기 (gte-Qwen1 → gte-Qwen2 패턴 따르면 수개월 내 예상)
2. 안 나오면: Qwen3-8B 기반 직접 contrastive fine-tuning (GritLM 방식)
   - 하나의 모델로 생성 + 임베딩
   - 선례: GritLM, E5-Mistral, NV-Embed
   - 예상 소요: 1~2주
3. ollama의 Qwen3 임베딩 모델도 기억 벤치마크에서 평가 중

## 파인튜닝 로드맵

### 목표

- 중국 검열 해제
- 한국어 강화
- 기억 시스템 최적화 (추출, 인출, 모순 감지)
- 임베딩 능력 추가 (GritLM 방식)

### 접근법: LoRA/QLoRA

기존 모델 분포 보존. MiniCPM의 Thinker→Talker 프로젝션 정합성 유지에 필수.

### 대상

| 대상 | 모델 | 파인튜닝 항목 |
|------|------|-------------|
| 단독 | Qwen3-8B abliterated | 검열 해제 + 한국어 + 기억 + 임베딩 |
| MiniCPM Thinker | MiniCPM 내 Qwen3 | 위와 동일 + omni 파이프라인 정합성 |
| MiniCPM Audio | Whisper + Talker | 한국어 음성, 오디오 품질 |

고객이 직접 파인튜닝할 수 있다고 가정 — safetensors 가중치 제공 필수.

## 투트랙 배포

| 티어 | 모델 | 기능 | 서빙 |
|------|------|------|------|
| **48GB** | MiniCPM 4.5-omni (파인튜닝) | omni + 생성 + 기억 | vllm-omni |
| **8GB** | Qwen3-8B abliterated (파인튜닝) | 텍스트 + 기억 (omni 없음) | ollama / llama.cpp |

동일 Qwen3 백본 → 파인튜닝 결과를 티어 간 전이 가능.

## Vocab 차이 참고

- Qwen3-8B (공개): vocab_size = 151936
- MiniCPM Thinker: vocab_size = 151748 (188개 토큰 제거)
- 아키텍처는 동일. 가중치 전이 시 vocab 정렬 필요.
