"""
Audio format conversion utilities for MiniCPM-o bridge server.

Conversion chain:
  Input:  base64 → bytes → int16 array → float32 numpy (16kHz)
  Output: torch tensor (24kHz) → int16 → bytes → base64
"""

import base64

import numpy as np


def pcm_base64_to_numpy(pcm_base64: str) -> np.ndarray:
    """Convert base64-encoded PCM16 audio to float32 numpy array.

    Args:
        pcm_base64: Base64 string of PCM16 little-endian audio

    Returns:
        Float32 numpy array normalized to [-1, 1]
    """
    raw = base64.b64decode(pcm_base64)
    int16_data = np.frombuffer(raw, dtype=np.int16)
    return int16_data.astype(np.float32) / 32768.0


def numpy_to_pcm_base64(audio: np.ndarray) -> str:
    """Convert float32 numpy array to base64-encoded PCM16.

    Args:
        audio: Float32 numpy array in [-1, 1] range

    Returns:
        Base64 string of PCM16 little-endian audio
    """
    int16_data = (audio * 32768.0).clip(-32768, 32767).astype(np.int16)
    return base64.b64encode(int16_data.tobytes()).decode("ascii")


def tensor_to_pcm_base64(tensor) -> str:
    """Convert PyTorch tensor to base64-encoded PCM16.

    Args:
        tensor: PyTorch tensor (float32, typically 24kHz)

    Returns:
        Base64 string of PCM16 little-endian audio
    """
    audio_np = tensor.cpu().numpy() if hasattr(tensor, "cpu") else np.array(tensor)
    if audio_np.ndim > 1:
        audio_np = audio_np.squeeze()
    return numpy_to_pcm_base64(audio_np)
