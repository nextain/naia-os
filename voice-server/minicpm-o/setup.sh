#!/bin/bash
# MiniCPM-o Bridge Server — Quick Setup for RunPod / Local GPU
#
# Usage:
#   bash setup.sh          # Install deps + download model
#   bash setup.sh --echo   # Install minimal deps (echo mode only)
#
# Prerequisites:
#   - Python 3.10+
#   - NVIDIA GPU with 12+ GB VRAM (for real model)
#   - CUDA toolkit installed

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== MiniCPM-o Bridge Server Setup ==="
echo ""

# Check Python
if ! command -v python3 &>/dev/null; then
    echo "ERROR: Python 3 not found. Install Python 3.10+."
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "Python: $PYTHON_VERSION"

if [ "$1" = "--echo" ]; then
    echo ""
    echo "Installing minimal dependencies (echo mode)..."
    pip install -r requirements.txt
    echo ""
    echo "Done! Start echo server:"
    echo "  python3 server.py --echo"
    exit 0
fi

# Check GPU
if command -v nvidia-smi &>/dev/null; then
    echo "GPU:"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
else
    echo "WARNING: nvidia-smi not found. GPU may not be available."
fi

echo ""
echo "Installing GPU dependencies..."
pip install -r requirements-gpu.txt

echo ""
echo "Downloading MiniCPM-o 4.5 model (this may take a while)..."
python3 -c "
from transformers import AutoModel, AutoTokenizer
print('Downloading model...')
AutoModel.from_pretrained('openbmb/MiniCPM-o-4_5', trust_remote_code=True)
AutoTokenizer.from_pretrained('openbmb/MiniCPM-o-4_5', trust_remote_code=True)
print('Model downloaded successfully.')
"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Start server:"
echo "  # BF16 (19GB VRAM, recommended — full TTS audio):"
echo "  python3 server.py"
echo ""
echo "  # INT4 (11GB VRAM, text-only — no audio output):"
echo "  python3 server.py --int4"
echo ""
echo "  # Echo mode (no GPU):"
echo "  python3 server.py --echo"
