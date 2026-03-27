# Model Selection Strategy

Naia OS model decisions for local-first AI. All models touching user data run locally.

## Reference Omni Model: MiniCPM 4.5-omni

Target tier: 48GB+

| Component | Model | Role |
|-----------|-------|------|
| **Thinker (LLM)** | Qwen3 (~8B) | Text generation, reasoning backbone |
| **Vision** | SigLIP2 | Image understanding (27 layers, 980px) |
| **Audio Input** | Whisper-medium | Speech-to-text |
| **Talker (TTS)** | Llama-based AR (MiniCPMTTS) | Audio codec generation, conditioned by Thinker |
| **Code2Wav** | CosyVoice2 + HiFi-GAN | Codec → mel → 16kHz waveform |

Thinker hidden_states are projected (4096→768) to condition Talker. Fine-tuning Thinker with LoRA to minimize distribution shift.

## Text-only LLM: Qwen3-8B Abliterated

Target tier: 8GB~24GB (no omni)

Same backbone as MiniCPM Thinker, for low-VRAM devices. Q4_K_M quantization (~5GB).

### CPU Inference Benchmark (i9-13900K, DDR5 128GB, no dGPU)

| Metric | Value |
|--------|-------|
| Prefill | 45~50 tok/s |
| Generate | **8.3~8.7 tok/s** |
| 500 tokens | ~60 seconds |

### Abliteration Candidates

| Model | Method | Fine-tunability | Status |
|-------|--------|:-:|:-:|
| **mlabonne/Qwen3-8B-abliterated** | Clean abliteration only | Best (clean base) | Comparison pending |
| **Josiefied-Qwen3-8B-abliterated-v1** | Abliteration + instruction tuning | Good (pre-tuned) | Comparison pending |

Selection criteria: censorship removal, generation quality, fine-tunability (clean base preferred for our own tuning + customer tuning).

## Embedding Model

### Current: gte-Qwen2

No Qwen3 embedding model exists yet. Using gte-Qwen2 as baseline.

### Future Plan

1. Wait for gte-Qwen3 (following gte-Qwen1 → gte-Qwen2 pattern, likely within months)
2. If not released: build our own via GritLM-style contrastive fine-tuning on Qwen3-8B
   - Single model for generation + embedding
   - Precedent: GritLM, E5-Mistral, NV-Embed
   - Estimated effort: 1~2 weeks
3. Qwen3 embedding model in ollama also being evaluated

## Fine-tuning Roadmap

### Goals

- Chinese censorship removal
- Korean language enhancement
- Memory system optimization (extraction, recall, contradiction)
- Embedding capability (GritLM-style)

### Approach: LoRA/QLoRA

Preserves base model distribution. Critical for MiniCPM where Thinker→Talker projection must stay aligned.

### Targets

| Target | Model | Fine-tune |
|--------|-------|-----------|
| Standalone | Qwen3-8B abliterated | censorship + Korean + memory + embedding |
| MiniCPM Thinker | Qwen3 inside MiniCPM | Same + omni pipeline alignment |
| MiniCPM Audio | Whisper + Talker | Korean voice, audio quality |

Customer fine-tuning is assumed — model must ship with safetensors weights.

## Two-track Deployment

| Tier | Model | Features | Serving |
|------|-------|----------|---------|
| **48GB** | MiniCPM 4.5-omni (fine-tuned) | omni + generation + memory | vllm-omni |
| **8GB** | Qwen3-8B abliterated (fine-tuned) | text + memory (no omni) | ollama / llama.cpp |

Same Qwen3 backbone → fine-tuning results transferable between tiers.

## Vocab Note

- Qwen3-8B (public): vocab_size = 151936
- MiniCPM Thinker: vocab_size = 151748 (188 tokens pruned)
- Architecture otherwise identical. Weight transfer requires vocab alignment.
