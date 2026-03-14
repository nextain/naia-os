"""
WebSocket protocol message types for MiniCPM-o bridge server.

Client → Server:
  session.config  — Initialize session with system instruction, voice config
  audio.append    — Send PCM16 16kHz mono audio chunk (base64)
  text.send       — Send text message (fallback for typed input)

Server → Client:
  session.ready       — Session initialized, ready for audio
  audio.delta         — PCM16 24kHz mono audio chunk (base64)
  transcript.input    — User speech transcription (if available)
  transcript.output   — Model response text
  turn.end            — Model finished responding
  interrupted         — User speech detected during output
  error               — Error message
"""

# Client → Server
SESSION_CONFIG = "session.config"
AUDIO_APPEND = "audio.append"
TEXT_SEND = "text.send"

# Server → Client
SESSION_READY = "session.ready"
AUDIO_DELTA = "audio.delta"
TRANSCRIPT_INPUT = "transcript.input"
TRANSCRIPT_OUTPUT = "transcript.output"
TURN_END = "turn.end"
INTERRUPTED = "interrupted"
ERROR = "error"
