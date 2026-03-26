# Naia OS Hardware Requirements

## Principle

Naia OS is local-first AI. User data never leaves the device.
All AI processing touching user text (conversation, memory, embeddings, fact extraction, contradiction detection) MUST run locally.
GPU is not optional — it is a product requirement.

## Hardware Tiers

### Full Spec (128GB)

- **Reference HW**: Radeon AI MAX+ 395 (128GB unified memory)
- Omni model (MiniCPM-o, voice+vision+text)
- Large conversation model (70B Q4, ~40GB)
- Memory conscious thought (32B, ~20GB)
- Memory autonomic system (embedding + 4B, ~3.5GB)
- **All models resident simultaneously, zero cloud calls**
- Estimated total: ~103GB, ~25GB headroom

### Standard (48GB)

- **Reference HW**: RTX 4090×2 (24GB×2) or A40 (48GB) or equivalent
- Omni model + memory autonomic system + memory conscious thought
- Most features run locally
- Large models (70B) cannot co-reside simultaneously

### Minimum with Omni (32GB)

- **Reference HW**: RTX 5090 (32GB) or equivalent
- Omni model (optimization/quantization required) + memory autonomic system
- Conscious memory tasks only during omni idle or via model swapping
- Depends on omni optimization success

### Text-only without Omni (16GB~24GB)

- **Reference HW**: RTX 4060 Ti 16GB / RTX 4070 Ti Super 16GB / RTX 3090 24GB
- Text-only conversation model (8B Q4, ~6GB)
- Memory autonomic system (embedding 0.5GB + 4B 3GB)
- STT/TTS via separate lightweight models (Whisper, Piper)
- No omni, conscious memory tasks via model swapping
- 16GB: ~12.5GB with KV cache, ~3.5GB headroom (tight)
- 24GB: ~11GB headroom (comfortable)
- **16GB is minimum viable, 24GB recommended**

### Not Supported

- <16GB VRAM or no GPU
- Recommended: use cloud AI services instead

## Memory System GPU Allocation

### Autonomic (always-on, per turn)
- Embedding generation (~0.5GB)
- Noise filtering + fact extraction (4B model, ~3GB)
- Total: **~3.5GB**

### Conscious Thought (on-demand, async)
- Contradiction detection, memory compression, retrieval decisions
- 8B~32B model, loaded when needed

### CPU-only (no LLM needed, always-on)
- Ebbinghaus decay calculation (decay.ts)
- Importance scoring (importance.ts)
- Knowledge graph edge management (knowledge-graph.ts)
- Consolidation timer/scheduling

## STT/TTS Pipeline (without omni)

- STT: Whisper (local, ~1.5GB) or faster-whisper
- TTS: Piper (CPU, lightweight) or edge-tts

## vllm Integration

Multiple models served via vllm, Gateway (any-llm) routes by task:
- `/chat` → conversation model
- `/memory/extract` → 4B fact extraction
- `/memory/contradiction` → large model
- `/memory/embed` → embedding model

## Differentiation vs Competitors

- AIRI: single LLM, no per-task model routing
- mem0: single LLM configuration
- **Naia: Gateway multi-provider routing + autonomic/conscious thought separation**
