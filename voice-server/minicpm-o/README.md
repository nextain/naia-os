# MiniCPM-o Bridge Server

WebSocket bridge for [MiniCPM-o 4.5](https://huggingface.co/openbmb/MiniCPM-o-4_5) — enables live voice conversation in Naia Shell.

## Quick Start

```bash
# Echo mode (no GPU, for development)
pip install -r requirements.txt
python server.py --echo

# Real model (GPU required, 24GB+ VRAM recommended)
bash setup.sh
python server.py           # BF16: ~19GB VRAM (recommended, full TTS)
python server.py --int4    # INT4: ~11GB VRAM (text-only, no audio output)
```

## RunPod Setup

1. Create a pod with RTX 3090+ (24GB VRAM), PyTorch template
2. SSH into the pod
3. Clone the repo and run setup:
   ```bash
   git clone https://github.com/nextain/naia-os.git
   cd naia-os/voice-server/minicpm-o
   bash setup.sh
   python server.py --host 0.0.0.0    # BF16 (recommended, full TTS)
   ```
4. In Naia Shell Settings, set Server URL to: `wss://<pod-id>-8765.proxy.runpod.net`

## API

WebSocket endpoint: `ws://host:port/ws`

Health check: `GET /health`

### Protocol

| Direction | Type | Fields | Description |
|-----------|------|--------|-------------|
| Client→Server | `session.config` | `config: { system_instruction, voice }` | Initialize session |
| Client→Server | `audio.append` | `data: string` | Base64 PCM16 16kHz mono |
| Client→Server | `text.send` | `text: string` | Text input |
| Server→Client | `session.ready` | — | Session initialized |
| Server→Client | `audio.delta` | `data: string` | Base64 PCM16 24kHz mono |
| Server→Client | `transcript.output` | `text: string` | Model response text |
| Server→Client | `turn.end` | — | Model finished responding |
| Server→Client | `interrupted` | — | User speech detected |
| Server→Client | `error` | `message: string` | Error |

## Limitations

- Single concurrent session (one GPU = one user)
- Speech languages: English and Chinese only
- No user speech transcription (input transcript unavailable)
- INT4 quantization: text-only (TTS audio broken with bitsandbytes)
- Half-duplex only (duplex requires ~28GB VRAM)

## Testing

```bash
# Start echo server
python server.py --echo &

# Run tests
python test_echo.py
```
