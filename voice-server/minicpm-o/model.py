"""
MiniCPM-o 4.5 model backend for the bridge server.

Handles model loading, inference, and audio streaming (half-duplex).

VRAM requirements:
  - BF16: ~19 GB (recommended — full TTS support)
  - INT4: ~11 GB (text-only — TTS broken with bitsandbytes quantization)

Audio I/O:
  - Input:  16 kHz PCM16 mono (float32 numpy)
  - Output: 24 kHz PCM16 mono (wav file → base64)

TTS initialization:
  1. from_pretrained(init_tts=True) — creates TTS module skeleton
  2. model.init_tts() — downloads and initializes Token2wav vocoder
  3. model.chat(generate_audio=True, output_audio_path=...) — saves audio to file
"""

import json
import logging
import os
import tempfile

import numpy as np

import protocol
from audio_utils import pcm_base64_to_numpy, numpy_to_pcm_base64

logger = logging.getLogger("minicpm-bridge.model")

OUTPUT_SAMPLE_RATE = 24000

# 0.5s near-silence at 16kHz — used as default reference audio for Token2wav.
# Token2wav requires a prompt_wav for voice synthesis. Without one (text-only input),
# the vocoder fails. This minimal reference provides a neutral starting point.
_DEFAULT_REF_AUDIO = np.random.RandomState(42).randn(8000).astype(np.float32) * 0.001


class ModelBackend:
    """MiniCPM-o model wrapper for WebSocket bridge."""

    def __init__(self, model_id: str = "openbmb/MiniCPM-o-4_5", use_int4: bool = False):
        self.model_id = model_id
        self.use_int4 = use_int4
        self.model = None
        self.tokenizer = None
        self.tts_available = False
        self.audio_buffer = np.array([], dtype=np.float32)
        self._system_instruction = ""
        self._load_model()

    def _load_model(self):
        import torch
        from transformers import AutoModel, AutoTokenizer

        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        logger.info("GPU VRAM: %.1f GB", vram_gb)
        logger.info("Loading model %s (int4=%s)...", self.model_id, self.use_int4)

        load_kwargs = {
            "trust_remote_code": True,
            "attn_implementation": "sdpa",
            "init_vision": True,
            "init_audio": True,
            "init_tts": True,
        }

        if self.use_int4:
            load_kwargs["torch_dtype"] = torch.float16
            load_kwargs["load_in_4bit"] = True
        else:
            load_kwargs["torch_dtype"] = torch.bfloat16

        self.model = AutoModel.from_pretrained(self.model_id, **load_kwargs)
        self.model.eval()
        if not self.use_int4:
            self.model = self.model.cuda()

        self.tokenizer = AutoTokenizer.from_pretrained(
            self.model_id, trust_remote_code=True
        )

        # Initialize TTS vocoder (Token2wav) — separate from model loading
        self._init_tts()

        used_gb = torch.cuda.memory_allocated() / (1024**3)
        logger.info(
            "Model loaded (VRAM used: %.1f/%.1f GB, tts=%s)",
            used_gb, vram_gb, self.tts_available,
        )

    def _init_tts(self):
        """Initialize TTS Token2wav vocoder.

        model.init_tts() downloads the StepAudio Token2wav model and sets up
        self.tts.audio_tokenizer. Without this call, generate_audio has no effect.
        """
        try:
            self.model.init_tts()
            # Verify it actually initialized
            audio_tok = getattr(self.model.tts, "audio_tokenizer", None)
            if audio_tok is not None:
                self.tts_available = True
                logger.info("TTS initialized: %s", type(audio_tok).__name__)
            else:
                logger.warning("init_tts() completed but audio_tokenizer is still None")
        except Exception as e:
            logger.warning("TTS initialization failed: %s", e)
            if self.use_int4:
                logger.warning(
                    "INT4 mode may not support TTS. Use BF16 for audio output."
                )

    async def initialize(self, config: dict):
        """Initialize session with system instruction and voice config."""
        self._system_instruction = config.get("system_instruction", "")
        self.audio_buffer = np.array([], dtype=np.float32)
        logger.info("Session initialized (tts=%s)", self.tts_available)

    async def process_audio(self, pcm_base64: str, send_fn):
        """Process incoming audio chunk (half-duplex: accumulate then process)."""
        audio = pcm_base64_to_numpy(pcm_base64)
        self.audio_buffer = np.concatenate([self.audio_buffer, audio])

        # Process every 2 seconds of accumulated audio
        if len(self.audio_buffer) >= 16000 * 2:
            await self._process_audio_input(send_fn)

    async def process_text(self, text: str, send_fn):
        """Process text input (typed message)."""
        await self._process_text_input(text, send_fn)

    async def _process_audio_input(self, send_fn):
        """Process accumulated audio in half-duplex mode."""
        audio_data = self.audio_buffer.copy()
        self.audio_buffer = np.array([], dtype=np.float32)

        try:
            msgs = [{"role": "user", "content": [audio_data]}]
            if self._system_instruction:
                msgs.insert(0, {"role": "system", "content": self._system_instruction})

            text, audio_np = self._chat_with_audio(msgs)
            await self._send_result(text, audio_np, send_fn)

        except Exception as e:
            logger.error("Audio processing error: %s", e)
            await send_fn(json.dumps({
                "type": protocol.ERROR,
                "message": str(e),
            }))

    async def _process_text_input(self, text: str, send_fn):
        """Process text input in half-duplex mode."""
        try:
            if self.tts_available:
                # Include default ref audio so Token2wav has a prompt for synthesis
                msgs = [{"role": "user", "content": [_DEFAULT_REF_AUDIO.copy(), text]}]
            else:
                msgs = [{"role": "user", "content": text}]
            if self._system_instruction:
                msgs.insert(0, {"role": "system", "content": self._system_instruction})

            resp_text, audio_np = self._chat_with_audio(msgs)
            await self._send_result(resp_text, audio_np, send_fn)

        except Exception as e:
            logger.error("Text processing error: %s", e)
            await send_fn(json.dumps({
                "type": protocol.ERROR,
                "message": str(e),
            }))

    def _chat_with_audio(self, msgs: list) -> tuple:
        """Run model.chat() and return (text, audio_numpy_or_none).

        MiniCPM-o's chat() saves audio to a file via output_audio_path.
        It does NOT return audio as a tensor. We use a temp file and read it back.
        """
        import soundfile as sf

        audio_np = None

        if self.tts_available:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = tmp.name

            text = self.model.chat(
                msgs=msgs,
                tokenizer=self.tokenizer,
                generate_audio=True,
                use_tts_template=True,
                output_audio_path=tmp_path,
                max_new_tokens=512,
            )

            # Read generated audio file
            try:
                waveform, sr = sf.read(tmp_path)
                if sr != OUTPUT_SAMPLE_RATE:
                    logger.warning("Unexpected sample rate %d (expected %d)", sr, OUTPUT_SAMPLE_RATE)
                audio_np = waveform.astype(np.float32)
                logger.info("Generated audio: %.1fs at %dHz", len(audio_np) / sr, sr)
            except Exception as e:
                logger.warning("Failed to read generated audio: %s", e)
            finally:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
        else:
            text = self.model.chat(
                msgs=msgs,
                tokenizer=self.tokenizer,
                generate_audio=False,
                max_new_tokens=512,
            )

        return text, audio_np

    async def _send_result(self, text: str, audio_np, send_fn):
        """Send model result (text + optional audio) to client."""
        if text:
            await send_fn(json.dumps({
                "type": protocol.TRANSCRIPT_OUTPUT,
                "text": text,
            }))

        if audio_np is not None:
            audio_b64 = numpy_to_pcm_base64(audio_np)
            await send_fn(json.dumps({
                "type": protocol.AUDIO_DELTA,
                "data": audio_b64,
            }))

        await send_fn(json.dumps({"type": protocol.TURN_END}))

    def cleanup(self):
        """Clean up session state."""
        self.audio_buffer = np.array([], dtype=np.float32)
