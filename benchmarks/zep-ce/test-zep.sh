#!/usr/bin/env bash
# Zep CE API smoke test
# Usage: bash test-zep.sh [ZEP_URL]
set -euo pipefail

ZEP_URL="${1:-http://localhost:8000}"
USER_ID="bench-user-$(date +%s)"
SESSION_ID="bench-session-$(date +%s)"

echo "=== Zep CE Smoke Test ==="
echo "URL: $ZEP_URL"
echo ""

# 1. Health check
echo "--- 1. Health Check ---"
curl -sf "$ZEP_URL/healthz" && echo " ✓ healthy" || { echo " ✗ FAILED"; exit 1; }
echo ""

# 2. Create user
echo "--- 2. Create User ($USER_ID) ---"
curl -sf -X POST "$ZEP_URL/api/v1/user" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\": \"$USER_ID\", \"metadata\": {\"role\": \"benchmark\"}}" | python3 -m json.tool
echo ""

# 3. Create session
echo "--- 3. Create Session ($SESSION_ID) ---"
curl -sf -X POST "$ZEP_URL/api/v1/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"$SESSION_ID\", \"user_id\": \"$USER_ID\", \"metadata\": {\"test\": true}}" | python3 -m json.tool
echo ""

# 4. Add memory (conversation messages)
echo "--- 4. Add Memory ---"
curl -sf -X POST "$ZEP_URL/api/v1/sessions/$SESSION_ID/memory" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role_type": "user", "role": "user", "content": "My name is Luke and I am building an AI OS called Naia."},
      {"role_type": "assistant", "role": "assistant", "content": "Nice to meet you, Luke! Naia sounds like an interesting project. What kind of AI capabilities are you building into it?"},
      {"role_type": "user", "role": "user", "content": "It has a memory system, voice interface, and runs on Bazzite Linux. I prefer privacy-first local execution."},
      {"role_type": "assistant", "role": "assistant", "content": "That is a great approach! Local execution for privacy is increasingly important. The Bazzite base is interesting for an AI OS."}
    ]
  }' | python3 -m json.tool
echo ""

# 5. Wait for processing
echo "--- 5. Waiting 5s for Graphiti processing ---"
sleep 5

# 6. Get memory
echo "--- 6. Get Memory ---"
curl -sf "$ZEP_URL/api/v1/sessions/$SESSION_ID/memory" | python3 -m json.tool
echo ""

# 7. Search memory
echo "--- 7. Search Memory ---"
curl -sf -X POST "$ZEP_URL/api/v1/sessions/$SESSION_ID/search" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "What OS does Luke use?",
    "search_type": "mmr",
    "limit": 3
  }' | python3 -m json.tool
echo ""

# 8. Get user (should have extracted facts)
echo "--- 8. Get User (with facts) ---"
curl -sf "$ZEP_URL/api/v1/user/$USER_ID" | python3 -m json.tool
echo ""

echo "=== Smoke Test Complete ==="
echo "User: $USER_ID"
echo "Session: $SESSION_ID"
