# MiniCPM-o 4.5 Voice Server

> **Status: Legacy** — 이 transformers 기반 서버는 [vllm-omni](https://github.com/vllm-project/vllm-omni) ([Nextain fork](https://github.com/nextain/vllm-omni))로 대체되었습니다.

## MiniCPM-o 4.5 모델 구조

[openbmb/MiniCPM-o-4_5](https://huggingface.co/openbmb/MiniCPM-o-4_5) — omni 멀티모달 모델 (텍스트 + 이미지 + 오디오 입출력)

```
입력 (텍스트/이미지/오디오)
  ↓
┌─────────────────────────────────────────────┐
│ Thinker (Stage 0)                           │
│  SigLIP2 Vision Encoder (400M)              │
│  Whisper-medium Audio Encoder (769M)        │
│  Qwen3-7B LLM Backbone                     │
│  → 텍스트 생성 + hidden states              │
└──────────────────┬──────────────────────────┘
                   ↓ thinker_hidden_states
┌─────────────────────────────────────────────┐
│ Talker (Stage 1)                            │
│  MiniCPMTTS — Llama AR (hidden=768, 20L)    │
│  Conditioning: emb_text + semantic_proj     │
│  → audio codec tokens (num_vq=1, 6562 vocab)│
└──────────────────┬──────────────────────────┘
                   ↓ codec tokens
┌─────────────────────────────────────────────┐
│ Code2Wav (Stage 2)                          │
│  CosyVoice2 Flow-matching DiT              │
│  HiFi-GAN Vocoder                           │
│  → waveform (24kHz WAV)                     │
└─────────────────────────────────────────────┘
```

- **총 파라미터**: ~9B (Thinker Qwen3-8B + Talker ~0.5B + Code2Wav ~0.5B)
- **VRAM 요구량**: BF16 기준 ~35GB (A40 46GB에서 검증)
- **음성 언어**: 영어, 중국어 (공식 지원)
- **텍스트/비전**: 30+ 언어 다국어 지원 (한국어 포함)

## 현재 아키텍처

```
Naia Shell → Naia Agent → vllm-omni (REST API, port 8091) → MiniCPM-o 4.5
                                        ↓
                              text + audio (WAV base64) 응답
```

| 컴포넌트 | 위치 | 역할 |
|----------|------|------|
| vllm-omni | [nextain/vllm-omni](https://github.com/nextain/vllm-omni) | 3-stage pipeline 추론 서버 |
| Naia Agent | `agent/src/providers/openai.ts` | MiniCPM-o 감지 → non-streaming + audio 처리 |
| Naia Shell | `shell/src/lib/voice/audio-queue.ts` | WAV base64 재생 |

### vllm-omni 환경

| 항목 | 값 |
|------|---|
| vllm 버전 | 0.17.0 (0.17.1 비호환) |
| vllm-omni | [nextain/vllm-omni](https://github.com/nextain/vllm-omni) (upstream fork: [vllm-project/vllm-omni](https://github.com/vllm-project/vllm-omni)) |
| upstream 이슈 | [vllm-project/vllm-omni#1182](https://github.com/vllm-project/vllm-omni/issues/1182) |
| GPU 요구량 | A40 46GB 이상 (48GB 권장) |
| 모델 | `openbmb/MiniCPM-o-4_5` (~20GB 다운로드) |

## vllm-omni 서버 실행

[RunPod 가이드](https://github.com/nextain/vllm-omni/blob/main/runpod_quickstart.md) 참조.

```bash
# RunPod에서 (A40/A6000 48GB)
cd /workspace/vllm-omni
bash scripts/workspace_setup.sh    # 최초 1회 (vllm 0.17.0 + deps)
bash scripts/workspace_start.sh    # 서버 시작
```

또는 수동:
```bash
vllm serve openbmb/MiniCPM-o-4_5 \
  --omni --port 8091 --host 0.0.0.0 \
  --max-model-len 2048 --skip-mm-profiling
```

## API

OpenAI Chat Completions (`/v1/chat/completions`):

```bash
curl -X POST http://localhost:8091/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openbmb/MiniCPM-o-4_5",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 50
  }'
```

응답: `choices[0]` = 텍스트, `choices[1]` = 오디오 (WAV base64)

## Legacy transformers 서버 (이 디렉터리)

이 디렉터리의 `server.py`는 HuggingFace transformers 기반 직접 추론 서버입니다. vllm-omni 이전에 사용했으며, 다음 용도로 유지:

- Echo 모드 개발 테스트
- transformers 기반 디버깅/비교

```bash
# Echo mode (no GPU)
pip install -r requirements.txt
python server.py --echo

# Real model (GPU required, 24GB+ VRAM)
bash setup.sh
python server.py
```

## 관련 이슈

- naia-os#72 — vLLM omni model support (Phase 1: vllm-omni 기여)
- naia-os#157 — Voice cloning + voice selection
- vllm-project/vllm-omni#1182 — MiniCPM-o 4.5 upstream contribution
