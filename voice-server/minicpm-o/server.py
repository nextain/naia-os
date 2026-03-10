"""
MiniCPM-o Bridge Server — WebSocket wrapper for MiniCPM-o 4.5 streaming API.

Modes:
  --echo     Echo mode (no GPU, for development/testing)
  --model    Load real MiniCPM-o model for inference

Usage:
  # Echo mode (no GPU):
  python server.py --echo --port 8765

  # Real model (GPU required):
  python server.py --model openbmb/MiniCPM-o-4_5 --int4 --port 8765
"""

import argparse
import asyncio
import json
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn

import protocol

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("minicpm-bridge")

app = FastAPI(title="MiniCPM-o Bridge Server")

# Global state
active_session: WebSocket | None = None
model_backend = None  # Will be set to ModelBackend instance


class EchoBackend:
    """Mock backend that echoes audio back. For development without GPU."""

    async def initialize(self, config: dict):
        logger.info("Echo backend initialized with config: %s", config)

    async def process_audio(self, pcm_base64: str, send_fn):
        """Echo audio back with a mock transcript."""
        await send_fn(json.dumps({"type": protocol.TRANSCRIPT_OUTPUT, "text": "[echo] "}))
        await send_fn(json.dumps({"type": protocol.AUDIO_DELTA, "data": pcm_base64}))
        await send_fn(json.dumps({"type": protocol.TURN_END}))

    async def process_text(self, text: str, send_fn):
        """Echo text back."""
        await send_fn(json.dumps({
            "type": protocol.TRANSCRIPT_OUTPUT,
            "text": f"[echo] {text}",
        }))
        await send_fn(json.dumps({"type": protocol.TURN_END}))

    def cleanup(self):
        pass


@app.websocket("/ws")
async def voice_ws(websocket: WebSocket):
    global active_session

    # Single-session enforcement
    if active_session is not None:
        await websocket.accept()
        await websocket.send_text(json.dumps({
            "type": protocol.ERROR,
            "message": "Server busy — another voice session is active",
        }))
        await websocket.close()
        return

    await websocket.accept()
    active_session = websocket
    session_alive = True
    logger.info("Client connected")

    try:
        # 1. Wait for session.config
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        msg = json.loads(raw)

        if msg.get("type") != protocol.SESSION_CONFIG:
            await websocket.send_text(json.dumps({
                "type": protocol.ERROR,
                "message": f"Expected session.config, got {msg.get('type')}",
            }))
            return

        config = msg.get("config", {})
        logger.info("Session config: %s", config)

        # Initialize model backend
        await model_backend.initialize(config)

        # 2. Send session.ready
        await websocket.send_text(json.dumps({"type": protocol.SESSION_READY}))
        logger.info("Session ready")

        # 3. Message loop with keepalive
        async def send_fn(data: str):
            if not session_alive:
                return
            try:
                await websocket.send_text(data)
            except Exception:
                pass  # Client already disconnected

        # Keepalive task — prevents RunPod proxy from closing idle connections
        async def keepalive_loop():
            while session_alive:
                await asyncio.sleep(10)
                if session_alive:
                    try:
                        await websocket.send_text(json.dumps({
                            "type": "status",
                            "message": "keepalive",
                        }))
                    except Exception:
                        break

        keepalive_task = asyncio.create_task(keepalive_loop())

        try:
            while True:
                raw = await websocket.receive_text()
                msg = json.loads(raw)
                msg_type = msg.get("type")

                if msg_type == protocol.AUDIO_APPEND:
                    data = msg.get("data", "")
                    if data:
                        await model_backend.process_audio(data, send_fn)

                elif msg_type == protocol.TEXT_SEND:
                    text = msg.get("text", "")
                    if text:
                        await model_backend.process_text(text, send_fn)

                else:
                    logger.warning("Unknown message type: %s", msg_type)
        finally:
            keepalive_task.cancel()

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except asyncio.TimeoutError:
        logger.warning("Client did not send session.config within timeout")
        try:
            await websocket.send_text(json.dumps({
                "type": protocol.ERROR,
                "message": "Timeout waiting for session.config",
            }))
        except Exception:
            pass
    except Exception as e:
        logger.error("Session error: %s", e)
        try:
            await websocket.send_text(json.dumps({
                "type": protocol.ERROR,
                "message": str(e),
            }))
        except Exception:
            pass
    finally:
        session_alive = False
        active_session = None
        if model_backend:
            model_backend.cleanup()
        logger.info("Session ended")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": "echo" if isinstance(model_backend, EchoBackend) else "minicpm-o",
        "active_session": active_session is not None,
    }


def main():
    parser = argparse.ArgumentParser(description="MiniCPM-o Bridge Server")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8765, help="Bind port (default: 8765)")
    parser.add_argument("--echo", action="store_true", help="Echo mode (no GPU)")
    parser.add_argument("--model", type=str, default="openbmb/MiniCPM-o-4_5",
                        help="HuggingFace model ID")
    parser.add_argument("--int4", action="store_true", help="Load model in INT4 (BitsAndBytes)")
    args = parser.parse_args()

    global model_backend

    if args.echo:
        logger.info("Starting in ECHO mode (no GPU)")
        model_backend = EchoBackend()
    else:
        # Import model backend only when needed (heavy deps)
        from model import ModelBackend
        logger.info("Loading model: %s (int4=%s)", args.model, args.int4)
        model_backend = ModelBackend(model_id=args.model, use_int4=args.int4)

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
