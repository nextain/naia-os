"""
E2E test for MiniCPM-o bridge server with real model.
Tests text input → model response (transcript + audio).

Usage:
  python test_model_e2e.py
"""

import asyncio
import json
import sys

try:
    import websockets
except ImportError:
    print("Install websockets: pip install websockets")
    sys.exit(1)


SERVER_URL = "ws://localhost:8765/ws"


async def test_text_response():
    """Send text, expect transcript + audio + turn.end."""
    print("[TEST] text → model response...")
    async with websockets.connect(SERVER_URL) as ws:
        await ws.send(json.dumps({
            "type": "session.config",
            "config": {"system_instruction": "You are a helpful assistant. Respond briefly."},
        }))
        raw = await asyncio.wait_for(ws.recv(), timeout=10)
        msg = json.loads(raw)
        t = msg.get("type")
        print(f"  Session: {t}")
        assert t == "session.ready", f"Expected session.ready, got {t}"

        # Send text
        print("  Sending: Hello, what is 2+2?")
        await ws.send(json.dumps({"type": "text.send", "text": "Hello, what is 2+2?"}))

        # Collect responses
        responses = []
        for _ in range(30):
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=60)
                msg = json.loads(raw)
                responses.append(msg)
                mt = msg.get("type", "")
                if mt == "transcript.output":
                    print(f"  [transcript] {msg.get('text', '')[:100]}")
                elif mt == "audio.delta":
                    data_len = len(msg.get("data", ""))
                    print(f"  [audio] {data_len} chars base64")
                elif mt == "turn.end":
                    print("  [turn.end]")
                    break
                elif mt == "error":
                    print(f"  [ERROR] {msg.get('message', '')}")
                    break
                else:
                    print(f"  [{mt}]")
            except asyncio.TimeoutError:
                print("  (timeout waiting for response)")
                break

        types = [r.get("type") for r in responses]
        has_transcript = "transcript.output" in types
        has_audio = "audio.delta" in types
        has_end = "turn.end" in types

        print(f"\n  transcript={has_transcript}, audio={has_audio}, turn_end={has_end}")

        if has_end and (has_transcript or has_audio):
            print("  PASS")
            return True
        else:
            print("  FAIL")
            return False


async def main():
    print(f"Testing bridge server at {SERVER_URL}\n")
    ok = await test_text_response()
    return ok


if __name__ == "__main__":
    ok = asyncio.run(main())
    sys.exit(0 if ok else 1)
