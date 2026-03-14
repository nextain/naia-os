"""
Echo mode E2E test for MiniCPM-o bridge server.

Requires the server running in echo mode:
  python server.py --echo --port 8765

Usage:
  python test_echo.py
"""

import asyncio
import base64
import json
import sys

import numpy as np

try:
    import websockets
except ImportError:
    print("Install websockets: pip install websockets")
    sys.exit(1)


SERVER_URL = "ws://localhost:8765/ws"


async def test_session_lifecycle():
    """Test: connect → session.config → session.ready → disconnect."""
    print("[TEST] session lifecycle...", end=" ")
    async with websockets.connect(SERVER_URL) as ws:
        # Send session config
        await ws.send(json.dumps({
            "type": "session.config",
            "config": {"system_instruction": "Test session"},
        }))

        # Expect session.ready
        raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
        msg = json.loads(raw)
        assert msg["type"] == "session.ready", f"Expected session.ready, got {msg['type']}"

    print("PASS")


async def test_text_echo():
    """Test: send text → receive echo transcript + turn.end."""
    print("[TEST] text echo...", end=" ")
    async with websockets.connect(SERVER_URL) as ws:
        await ws.send(json.dumps({
            "type": "session.config",
            "config": {},
        }))
        raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
        assert json.loads(raw)["type"] == "session.ready"

        # Send text
        await ws.send(json.dumps({"type": "text.send", "text": "Hello"}))

        # Collect responses
        responses = []
        for _ in range(2):
            raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
            responses.append(json.loads(raw))

        types = [r["type"] for r in responses]
        assert "transcript.output" in types, f"Missing transcript.output: {types}"
        assert "turn.end" in types, f"Missing turn.end: {types}"

    print("PASS")


async def test_audio_echo():
    """Test: send audio → receive echo audio + turn.end."""
    print("[TEST] audio echo...", end=" ")
    async with websockets.connect(SERVER_URL) as ws:
        await ws.send(json.dumps({
            "type": "session.config",
            "config": {},
        }))
        raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
        assert json.loads(raw)["type"] == "session.ready"

        # Generate test audio (500ms of 440Hz sine, 16kHz PCM16)
        duration = 0.5
        t = np.linspace(0, duration, int(16000 * duration), dtype=np.float32)
        sine = (np.sin(2 * np.pi * 440 * t) * 32767).astype(np.int16)
        audio_b64 = base64.b64encode(sine.tobytes()).decode("ascii")

        # Send audio
        await ws.send(json.dumps({"type": "audio.append", "data": audio_b64}))

        # Collect responses
        responses = []
        for _ in range(3):
            raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
            responses.append(json.loads(raw))

        types = [r["type"] for r in responses]
        assert "audio.delta" in types, f"Missing audio.delta: {types}"
        assert "turn.end" in types, f"Missing turn.end: {types}"

        # Verify echoed audio matches input
        audio_resp = next(r for r in responses if r["type"] == "audio.delta")
        assert audio_resp["data"] == audio_b64, "Echoed audio doesn't match input"

    print("PASS")


async def test_server_busy():
    """Test: second connection gets rejected with error."""
    print("[TEST] server busy...", end=" ")
    # First connection
    ws1 = await websockets.connect(SERVER_URL)
    await ws1.send(json.dumps({
        "type": "session.config",
        "config": {},
    }))
    raw = await asyncio.wait_for(ws1.recv(), timeout=5.0)
    assert json.loads(raw)["type"] == "session.ready"

    # Second connection should get error
    ws2 = await websockets.connect(SERVER_URL)
    raw = await asyncio.wait_for(ws2.recv(), timeout=5.0)
    msg = json.loads(raw)
    assert msg["type"] == "error", f"Expected error, got {msg['type']}"
    assert "busy" in msg.get("message", "").lower(), f"Expected busy message: {msg}"

    await ws1.close()
    await ws2.close()
    print("PASS")


async def main():
    print(f"Testing bridge server at {SERVER_URL}\n")
    tests = [
        test_session_lifecycle,
        test_text_echo,
        test_audio_echo,
        test_server_busy,
    ]
    passed = 0
    failed = 0
    for test in tests:
        try:
            await test()
            passed += 1
        except Exception as e:
            print(f"FAIL: {e}")
            failed += 1

    print(f"\nResults: {passed} passed, {failed} failed")
    return failed == 0


if __name__ == "__main__":
    ok = asyncio.run(main())
    sys.exit(0 if ok else 1)
