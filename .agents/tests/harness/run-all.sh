#!/bin/bash
# Harness Engineering Test Suite
# Run from project root: bash .agents/tests/harness/run-all.sh
#
# Tests each hook by simulating Claude Code's stdin JSON protocol.
# Exit 0 = all pass, Exit 1 = failure(s).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PASS=0
FAIL=0
TOTAL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() {
    PASS=$((PASS + 1))
    TOTAL=$((TOTAL + 1))
    echo -e "  ${GREEN}✓${NC} $1"
}

fail() {
    FAIL=$((FAIL + 1))
    TOTAL=$((TOTAL + 1))
    echo -e "  ${RED}✗${NC} $1"
    echo -e "    ${RED}Expected:${NC} $2"
    echo -e "    ${RED}Got:${NC} $3"
}

# ─── Test Helper ───────────────────────────────────────────

run_hook() {
    local hook_script="$1"
    local stdin_json="$2"
    echo "$stdin_json" | node "$PROJECT_ROOT/.claude/hooks/$hook_script" 2>/dev/null || true
}

# ─── 1. sync-entry-points.js ──────────────────────────────

echo ""
echo -e "${YELLOW}═══ Test: sync-entry-points.js ═══${NC}"

# Setup: create temp dir with entry point files
TMPDIR_SYNC="$(mktemp -d)"
echo "# Test content AGENTS" > "$TMPDIR_SYNC/AGENTS.md"
echo "# Test content AGENTS" > "$TMPDIR_SYNC/CLAUDE.md"
echo "# Test content AGENTS" > "$TMPDIR_SYNC/GEMINI.md"

# Test 1.1: Edit AGENTS.md → should sync to CLAUDE.md and GEMINI.md
echo "# UPDATED from AGENTS" > "$TMPDIR_SYNC/AGENTS.md"
OUTPUT=$(run_hook "sync-entry-points.js" "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$TMPDIR_SYNC/AGENTS.md\"}}")

if grep -q "UPDATED from AGENTS" "$TMPDIR_SYNC/CLAUDE.md" 2>/dev/null; then
    pass "1.1 AGENTS.md → CLAUDE.md synced"
else
    fail "1.1 AGENTS.md → CLAUDE.md synced" "UPDATED from AGENTS" "$(cat "$TMPDIR_SYNC/CLAUDE.md" 2>/dev/null)"
fi

if grep -q "UPDATED from AGENTS" "$TMPDIR_SYNC/GEMINI.md" 2>/dev/null; then
    pass "1.2 AGENTS.md → GEMINI.md synced"
else
    fail "1.2 AGENTS.md → GEMINI.md synced" "UPDATED from AGENTS" "$(cat "$TMPDIR_SYNC/GEMINI.md" 2>/dev/null)"
fi

# Test 1.3: Output contains additionalContext
if echo "$OUTPUT" | grep -q "additionalContext"; then
    pass "1.3 Returns additionalContext JSON"
else
    fail "1.3 Returns additionalContext JSON" "JSON with additionalContext" "$OUTPUT"
fi

# Test 1.4: Non-entry-point file → no sync
echo "# Original" > "$TMPDIR_SYNC/CLAUDE.md"
OUTPUT=$(run_hook "sync-entry-points.js" "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$TMPDIR_SYNC/README.md\"}}")
if grep -q "Original" "$TMPDIR_SYNC/CLAUDE.md" 2>/dev/null; then
    pass "1.4 Non-entry-point file ignored"
else
    fail "1.4 Non-entry-point file ignored" "Original content preserved" "$(cat "$TMPDIR_SYNC/CLAUDE.md" 2>/dev/null)"
fi

# Test 1.5: GEMINI.md doesn't exist → only sync CLAUDE.md
rm -f "$TMPDIR_SYNC/GEMINI.md"
echo "# FROM AGENTS no gemini" > "$TMPDIR_SYNC/AGENTS.md"
OUTPUT=$(run_hook "sync-entry-points.js" "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$TMPDIR_SYNC/AGENTS.md\"}}")
if grep -q "FROM AGENTS no gemini" "$TMPDIR_SYNC/CLAUDE.md" 2>/dev/null && [ ! -f "$TMPDIR_SYNC/GEMINI.md" ]; then
    pass "1.5 Missing GEMINI.md → not created, CLAUDE.md still synced"
else
    fail "1.5 Missing GEMINI.md handling" "CLAUDE synced, GEMINI not created" "CLAUDE=$(cat "$TMPDIR_SYNC/CLAUDE.md" 2>/dev/null) GEMINI exists=$(test -f "$TMPDIR_SYNC/GEMINI.md" && echo yes || echo no)"
fi

# Test 1.6: Wrong tool_name → no action
echo "# Should not change" > "$TMPDIR_SYNC/AGENTS.md"
echo "# Original claude" > "$TMPDIR_SYNC/CLAUDE.md"
OUTPUT=$(run_hook "sync-entry-points.js" "{\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"$TMPDIR_SYNC/AGENTS.md\"}}")
if grep -q "Original claude" "$TMPDIR_SYNC/CLAUDE.md" 2>/dev/null; then
    pass "1.6 Read tool ignored (no sync)"
else
    fail "1.6 Read tool ignored" "Original claude" "$(cat "$TMPDIR_SYNC/CLAUDE.md" 2>/dev/null)"
fi

# Test 1.7: CLAUDE.md as source → syncs to AGENTS.md and GEMINI.md
TMPDIR_SYNC2="$(mktemp -d)"
echo "# original" > "$TMPDIR_SYNC2/AGENTS.md"
echo "# original" > "$TMPDIR_SYNC2/CLAUDE.md"
echo "# original" > "$TMPDIR_SYNC2/GEMINI.md"
echo "# FROM CLAUDE" > "$TMPDIR_SYNC2/CLAUDE.md"
OUTPUT=$(run_hook "sync-entry-points.js" "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$TMPDIR_SYNC2/CLAUDE.md\"}}")
if grep -q "FROM CLAUDE" "$TMPDIR_SYNC2/AGENTS.md" 2>/dev/null && grep -q "FROM CLAUDE" "$TMPDIR_SYNC2/GEMINI.md" 2>/dev/null; then
    pass "1.7 CLAUDE.md as source → AGENTS.md + GEMINI.md synced"
else
    fail "1.7 CLAUDE.md as source" "Both synced" "AGENTS=$(cat "$TMPDIR_SYNC2/AGENTS.md" 2>/dev/null) GEMINI=$(cat "$TMPDIR_SYNC2/GEMINI.md" 2>/dev/null)"
fi

# Test 1.8: GEMINI.md as source → syncs to AGENTS.md and CLAUDE.md
echo "# FROM GEMINI" > "$TMPDIR_SYNC2/GEMINI.md"
OUTPUT=$(run_hook "sync-entry-points.js" "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$TMPDIR_SYNC2/GEMINI.md\"}}")
if grep -q "FROM GEMINI" "$TMPDIR_SYNC2/AGENTS.md" 2>/dev/null && grep -q "FROM GEMINI" "$TMPDIR_SYNC2/CLAUDE.md" 2>/dev/null; then
    pass "1.8 GEMINI.md as source → AGENTS.md + CLAUDE.md synced"
else
    fail "1.8 GEMINI.md as source" "Both synced" "AGENTS=$(cat "$TMPDIR_SYNC2/AGENTS.md" 2>/dev/null) CLAUDE=$(cat "$TMPDIR_SYNC2/CLAUDE.md" 2>/dev/null)"
fi

# Test 1.9: Write tool triggers sync (not just Edit)
echo "# VIA WRITE" > "$TMPDIR_SYNC2/AGENTS.md"
OUTPUT=$(run_hook "sync-entry-points.js" "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMPDIR_SYNC2/AGENTS.md\"}}")
if grep -q "VIA WRITE" "$TMPDIR_SYNC2/CLAUDE.md" 2>/dev/null; then
    pass "1.9 Write tool triggers sync"
else
    fail "1.9 Write tool triggers sync" "VIA WRITE" "$(cat "$TMPDIR_SYNC2/CLAUDE.md" 2>/dev/null)"
fi

# Test 1.10: Lockfile prevents recursive sync
LOCKFILE="/tmp/.entry-points-sync.lock"
echo "locked" > "$LOCKFILE"
echo "# SHOULD NOT SYNC" > "$TMPDIR_SYNC2/AGENTS.md"
echo "# KEPT" > "$TMPDIR_SYNC2/CLAUDE.md"
OUTPUT=$(run_hook "sync-entry-points.js" "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$TMPDIR_SYNC2/AGENTS.md\"}}")
if grep -q "KEPT" "$TMPDIR_SYNC2/CLAUDE.md" 2>/dev/null; then
    pass "1.10 Lockfile prevents recursive sync"
else
    fail "1.10 Lockfile prevents recursive sync" "KEPT (no sync)" "$(cat "$TMPDIR_SYNC2/CLAUDE.md" 2>/dev/null)"
fi
rm -f "$LOCKFILE"

# Test 1.11: Malformed JSON stdin → no crash
OUTPUT=$(echo "NOT JSON" | node "$PROJECT_ROOT/.claude/hooks/sync-entry-points.js" 2>/dev/null || true)
if [ -z "$OUTPUT" ]; then
    pass "1.11 Malformed JSON → graceful exit (no crash)"
else
    fail "1.11 Malformed JSON → graceful exit" "(empty)" "$OUTPUT"
fi

rm -rf "$TMPDIR_SYNC" "$TMPDIR_SYNC2"

# ─── 2. commit-guard.js ───────────────────────────────────

echo ""
echo -e "${YELLOW}═══ Test: commit-guard.js ═══${NC}"

TMPDIR_CG="$(mktemp -d)"
mkdir -p "$TMPDIR_CG/.agents/progress"

# Test 2.1: No progress file → no warning (silent pass)
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"},\"cwd\":\"$TMPDIR_CG\"}")
if [ -z "$OUTPUT" ]; then
    pass "2.1 No progress file → silent pass"
else
    fail "2.1 No progress file → silent pass" "(empty)" "$OUTPUT"
fi

# Test 2.2: Phase = build → should warn
echo '{"issue":"#99","current_phase":"build"}' > "$TMPDIR_CG/.agents/progress/99.json"
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"},\"cwd\":\"$TMPDIR_CG\"}")
if echo "$OUTPUT" | grep -q "Committing at phase"; then
    pass "2.2 Phase 'build' → commit warning"
else
    fail "2.2 Phase 'build' → commit warning" "Warning about premature commit" "$OUTPUT"
fi

# Test 2.3: Phase = build → mentions remaining phases
if echo "$OUTPUT" | grep -q "e2e_test"; then
    pass "2.3 Warning includes remaining phases (e2e_test)"
else
    fail "2.3 Warning includes remaining phases" "mentions e2e_test" "$OUTPUT"
fi

# Test 2.4: Phase = report → no warning (past sync_verify)
echo '{"issue":"#99","current_phase":"report"}' > "$TMPDIR_CG/.agents/progress/99.json"
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"},\"cwd\":\"$TMPDIR_CG\"}")
if [ -z "$OUTPUT" ]; then
    pass "2.4 Phase 'report' → no warning"
else
    fail "2.4 Phase 'report' → no warning" "(empty)" "$OUTPUT"
fi

# Test 2.5: Phase = commit → no warning
echo '{"issue":"#99","current_phase":"commit"}' > "$TMPDIR_CG/.agents/progress/99.json"
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m done\"},\"cwd\":\"$TMPDIR_CG\"}")
if [ -z "$OUTPUT" ]; then
    pass "2.5 Phase 'commit' → no warning"
else
    fail "2.5 Phase 'commit' → no warning" "(empty)" "$OUTPUT"
fi

# Test 2.6: Non-commit bash command → ignored
echo '{"issue":"#99","current_phase":"build"}' > "$TMPDIR_CG/.agents/progress/99.json"
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"npm test\"},\"cwd\":\"$TMPDIR_CG\"}")
if [ -z "$OUTPUT" ]; then
    pass "2.6 Non-commit command (npm test) → ignored"
else
    fail "2.6 Non-commit command ignored" "(empty)" "$OUTPUT"
fi

# Test 2.7: Invalid JSON in progress file → silent pass
echo 'NOT JSON' > "$TMPDIR_CG/.agents/progress/99.json"
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"},\"cwd\":\"$TMPDIR_CG\"}")
if [ -z "$OUTPUT" ]; then
    pass "2.7 Corrupt progress file → silent pass (no crash)"
else
    fail "2.7 Corrupt progress file → silent pass" "(empty)" "$OUTPUT"
fi

# Test 2.8: Phase = e2e_test → should still warn (before sync_verify)
echo '{"issue":"#99","current_phase":"e2e_test"}' > "$TMPDIR_CG/.agents/progress/99.json"
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"},\"cwd\":\"$TMPDIR_CG\"}")
if echo "$OUTPUT" | grep -q "Committing at phase"; then
    pass "2.8 Phase 'e2e_test' → still warns (sync not done)"
else
    fail "2.8 Phase 'e2e_test' → warning" "Warning about premature commit" "$OUTPUT"
fi

# Test 2.9: git commit --amend → should still trigger guard
echo '{"issue":"#99","current_phase":"build"}' > "$TMPDIR_CG/.agents/progress/99.json"
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit --amend\"},\"cwd\":\"$TMPDIR_CG\"}")
if echo "$OUTPUT" | grep -q "Committing at phase"; then
    pass "2.9 git commit --amend → triggers guard"
else
    fail "2.9 git commit --amend" "Warning" "$OUTPUT"
fi

# Test 2.10: git commit -a -m → should still trigger guard
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -a -m 'test'\"},\"cwd\":\"$TMPDIR_CG\"}")
if echo "$OUTPUT" | grep -q "Committing at phase"; then
    pass "2.10 git commit -a -m → triggers guard"
else
    fail "2.10 git commit -a -m" "Warning" "$OUTPUT"
fi

# Test 2.11: Multiple progress files → picks most recent by mtime
echo '{"issue":"#10","current_phase":"report"}' > "$TMPDIR_CG/.agents/progress/10.json"
sleep 0.1
echo '{"issue":"#20","current_phase":"build"}' > "$TMPDIR_CG/.agents/progress/20.json"
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m x\"},\"cwd\":\"$TMPDIR_CG\"}")
if echo "$OUTPUT" | grep -q "Committing at phase"; then
    pass "2.11 Multiple progress files → picks most recent (build warns)"
else
    fail "2.11 Multiple progress files → most recent" "Warning (build)" "$OUTPUT"
fi

# Test 2.12: Unknown phase name → silent pass (not in PHASE_ORDER)
echo '{"issue":"#99","current_phase":"unknown_phase"}' > "$TMPDIR_CG/.agents/progress/99.json"
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"},\"cwd\":\"$TMPDIR_CG\"}")
if [ -z "$OUTPUT" ]; then
    pass "2.12 Unknown phase → silent pass (graceful)"
else
    fail "2.12 Unknown phase → silent pass" "(empty)" "$OUTPUT"
fi

# Test 2.13: Empty progress dir (no .json files) → silent pass
rm -f "$TMPDIR_CG/.agents/progress/"*.json
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"},\"cwd\":\"$TMPDIR_CG\"}")
if [ -z "$OUTPUT" ]; then
    pass "2.13 Empty progress dir → silent pass"
else
    fail "2.13 Empty progress dir → silent pass" "(empty)" "$OUTPUT"
fi

# Test 2.14: Edit tool (not Bash) → ignored even with git commit in input
echo '{"issue":"#99","current_phase":"build"}' > "$TMPDIR_CG/.agents/progress/99.json"
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Edit\",\"tool_input\":{\"command\":\"git commit -m test\"},\"cwd\":\"$TMPDIR_CG\"}")
if [ -z "$OUTPUT" ]; then
    pass "2.14 Edit tool with git commit text → ignored (Bash-only)"
else
    fail "2.14 Edit tool ignored" "(empty)" "$OUTPUT"
fi

# Test 2.15: Malformed JSON stdin → no crash
OUTPUT=$(echo "NOT JSON" | node "$PROJECT_ROOT/.claude/hooks/commit-guard.js" 2>/dev/null || true)
if [ -z "$OUTPUT" ]; then
    pass "2.15 Malformed JSON stdin → graceful exit (no crash)"
else
    fail "2.15 Malformed JSON → graceful exit" "(empty)" "$OUTPUT"
fi

rm -rf "$TMPDIR_CG"

# ─── 3. cascade-check.js ──────────────────────────────────

echo ""
echo -e "${YELLOW}═══ Test: cascade-check.js ═══${NC}"

# Test 3.1: Edit .agents/context/vision.yaml → remind about .users/ mirrors
OUTPUT=$(run_hook "cascade-check.js" "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"/project/.agents/context/vision.yaml\"}}")
if echo "$OUTPUT" | grep -q "Triple-mirror rule"; then
    pass "3.1 .agents/context/*.yaml → triple-mirror reminder"
else
    fail "3.1 .agents/context/*.yaml → reminder" "Triple-mirror rule mention" "$OUTPUT"
fi

# Test 3.2: Reminder includes both .users/context/ and .users/context/ko/
if echo "$OUTPUT" | grep -q "users/context/ko/"; then
    pass "3.2 Reminder includes ko/ mirror path"
else
    fail "3.2 Reminder includes ko/ path" ".users/context/ko/" "$OUTPUT"
fi

# Test 3.3: Edit agents-rules.json → SoT reminder
OUTPUT=$(run_hook "cascade-check.js" "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"/project/.agents/context/agents-rules.json\"}}")
if echo "$OUTPUT" | grep -q "SoT"; then
    pass "3.3 agents-rules.json → SoT reminder"
else
    fail "3.3 agents-rules.json → SoT reminder" "SoT mention" "$OUTPUT"
fi

# Test 3.4: Edit .users/context/vision.md → remind about .agents/ and ko/
OUTPUT=$(run_hook "cascade-check.js" "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"/project/.users/context/vision.md\"}}")
if echo "$OUTPUT" | grep -q ".agents/context/vision.yaml"; then
    pass "3.4 .users/context/*.md → reminds .agents/ mirror"
else
    fail "3.4 .users/context/*.md → reminder" ".agents/context/vision.yaml" "$OUTPUT"
fi

# Test 3.5: Edit .users/context/ko/vision.md → remind about .agents/ and .users/context/
OUTPUT=$(run_hook "cascade-check.js" "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"/project/.users/context/ko/vision.md\"}}")
if echo "$OUTPUT" | grep -q ".agents/context/vision.yaml"; then
    pass "3.5 .users/context/ko/*.md → reminds .agents/ mirror"
else
    fail "3.5 .users/context/ko/*.md → reminder" ".agents/context/vision.yaml" "$OUTPUT"
fi

# Test 3.6: Edit unrelated file → no output
OUTPUT=$(run_hook "cascade-check.js" "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"/project/shell/src/App.tsx\"}}")
if [ -z "$OUTPUT" ]; then
    pass "3.6 Unrelated file → no reminder"
else
    fail "3.6 Unrelated file → no reminder" "(empty)" "$OUTPUT"
fi

# Test 3.7: Read tool → ignored
OUTPUT=$(run_hook "cascade-check.js" "{\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"/project/.agents/context/vision.yaml\"}}")
if [ -z "$OUTPUT" ]; then
    pass "3.7 Read tool → ignored"
else
    fail "3.7 Read tool → ignored" "(empty)" "$OUTPUT"
fi

# Test 3.8: Malformed JSON stdin → no crash
OUTPUT=$(echo "NOT JSON" | node "$PROJECT_ROOT/.claude/hooks/cascade-check.js" 2>/dev/null || true)
if [ -z "$OUTPUT" ]; then
    pass "3.8 Malformed JSON → graceful exit (no crash)"
else
    fail "3.8 Malformed JSON → graceful exit" "(empty)" "$OUTPUT"
fi

# Test 3.9: .agents/context/*.json (non agents-rules) → triple-mirror reminder
OUTPUT=$(run_hook "cascade-check.js" "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"/project/.agents/context/custom-config.json\"}}")
if echo "$OUTPUT" | grep -q "Triple-mirror rule"; then
    pass "3.9 .agents/context/*.json → triple-mirror reminder"
else
    fail "3.9 .agents/context/*.json → reminder" "Triple-mirror rule" "$OUTPUT"
fi

# Test 3.10: Write tool triggers cascade check (not just Edit)
OUTPUT=$(run_hook "cascade-check.js" "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"/project/.agents/context/testing.yaml\"}}")
if echo "$OUTPUT" | grep -q "Triple-mirror rule"; then
    pass "3.10 Write tool triggers cascade check"
else
    fail "3.10 Write tool triggers cascade" "Triple-mirror rule" "$OUTPUT"
fi

# Test 3.11: .users/context/ko/ edit → reminds both .agents/ AND .users/context/
OUTPUT=$(run_hook "cascade-check.js" "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"/project/.users/context/ko/architecture.md\"}}")
if echo "$OUTPUT" | grep -q ".users/context/architecture.md"; then
    pass "3.11 ko/ edit → also reminds English .users/ mirror"
else
    fail "3.11 ko/ → .users/ reminder" ".users/context/architecture.md" "$OUTPUT"
fi

# Test 3.12: agents-rules.json → gets BOTH triple-mirror AND SoT reminders
OUTPUT=$(run_hook "cascade-check.js" "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"/project/.agents/context/agents-rules.json\"}}")
TRIPLE=$(echo "$OUTPUT" | grep -c "Triple-mirror rule" || true)
SOT=$(echo "$OUTPUT" | grep -c "SoT" || true)
if [ "$TRIPLE" -gt 0 ] && [ "$SOT" -gt 0 ]; then
    pass "3.12 agents-rules.json → both triple-mirror AND SoT reminders"
else
    fail "3.12 agents-rules.json dual reminder" "Both Triple-mirror and SoT" "triple=$TRIPLE sot=$SOT"
fi

# ─── 4. Progress File Schema Validation ───────────────────

echo ""
echo -e "${YELLOW}═══ Test: Progress File Schema ═══${NC}"

TMPDIR_PF="$(mktemp -d)"

# Test 4.1: Valid progress file
VALID_PROGRESS='{"issue":"#42","title":"Test feature","project":"naia-os","current_phase":"build","gate_approvals":{"understand":"2026-03-14T10:00Z","scope":"2026-03-14T10:15Z","plan":"2026-03-14T11:00Z"},"decisions":[{"decision":"Use pattern A","rationale":"Simpler","date":"2026-03-14"}],"surprises":[],"blockers":[],"updated_at":"2026-03-14T14:30Z"}'
echo "$VALID_PROGRESS" > "$TMPDIR_PF/42.json"

# Check it's valid JSON
if node -e "JSON.parse(require('fs').readFileSync('$TMPDIR_PF/42.json','utf8')); console.log('valid')" 2>/dev/null | grep -q "valid"; then
    pass "4.1 Progress file is valid JSON"
else
    fail "4.1 Progress file is valid JSON" "valid" "parse error"
fi

# Test 4.2: Required fields present
FIELDS=("issue" "current_phase" "gate_approvals" "decisions" "updated_at")
ALL_PRESENT=true
for field in "${FIELDS[@]}"; do
    if ! node -e "const d=JSON.parse(require('fs').readFileSync('$TMPDIR_PF/42.json','utf8')); if(!d['$field'] && d['$field']!==false) process.exit(1)" 2>/dev/null; then
        ALL_PRESENT=false
        break
    fi
done
if [ "$ALL_PRESENT" = true ]; then
    pass "4.2 All required fields present (issue, current_phase, gate_approvals, decisions, updated_at)"
else
    fail "4.2 Required fields" "All present" "Missing: $field"
fi

# Test 4.3: current_phase is a valid phase name
PHASE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TMPDIR_PF/42.json','utf8')).current_phase)" 2>/dev/null)
VALID_PHASES="issue understand scope investigate plan build review e2e_test post_test_review sync sync_verify report commit"
if echo "$VALID_PHASES" | grep -qw "$PHASE"; then
    pass "4.3 current_phase '$PHASE' is valid"
else
    fail "4.3 current_phase is valid" "one of: $VALID_PHASES" "$PHASE"
fi

# Test 4.4: gate_approvals has ISO timestamp format
TIMESTAMP=$(node -e "const d=JSON.parse(require('fs').readFileSync('$TMPDIR_PF/42.json','utf8')); console.log(d.gate_approvals.understand||'')" 2>/dev/null)
if echo "$TIMESTAMP" | grep -qE "^[0-9]{4}-[0-9]{2}-[0-9]{2}T"; then
    pass "4.4 gate_approvals timestamps are ISO format"
else
    fail "4.4 ISO timestamp format" "YYYY-MM-DDT..." "$TIMESTAMP"
fi

# Test 4.5: Missing required field (no current_phase) → commit-guard handles gracefully
TMPDIR_NEG="$(mktemp -d)"
mkdir -p "$TMPDIR_NEG/.agents/progress"
echo '{"issue":"#99"}' > "$TMPDIR_NEG/.agents/progress/99.json"
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"},\"cwd\":\"$TMPDIR_NEG\"}")
if [ -z "$OUTPUT" ]; then
    pass "4.5 Missing current_phase → commit-guard passes gracefully"
else
    fail "4.5 Missing current_phase" "(empty/graceful)" "$OUTPUT"
fi

# Test 4.6: Invalid phase name → commit-guard passes (unknown index = -1)
echo '{"issue":"#99","current_phase":"nonexistent_phase"}' > "$TMPDIR_NEG/.agents/progress/99.json"
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"},\"cwd\":\"$TMPDIR_NEG\"}")
if [ -z "$OUTPUT" ]; then
    pass "4.6 Invalid phase name → commit-guard passes gracefully"
else
    fail "4.6 Invalid phase name" "(empty/graceful)" "$OUTPUT"
fi

# Test 4.7: Empty JSON object → commit-guard passes
echo '{}' > "$TMPDIR_NEG/.agents/progress/99.json"
OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"},\"cwd\":\"$TMPDIR_NEG\"}")
if [ -z "$OUTPUT" ]; then
    pass "4.7 Empty JSON object → commit-guard passes gracefully"
else
    fail "4.7 Empty JSON" "(empty/graceful)" "$OUTPUT"
fi

rm -rf "$TMPDIR_PF" "$TMPDIR_NEG"

# ─── 5. Integration: commit-guard + progress ──────────────

echo ""
echo -e "${YELLOW}═══ Test: Integration (commit-guard + progress lifecycle) ═══${NC}"

TMPDIR_INT="$(mktemp -d)"
mkdir -p "$TMPDIR_INT/.agents/progress"

# Test 5.1: Simulate full lifecycle — phase progression should affect guard
PHASES_THAT_WARN=("issue" "understand" "scope" "investigate" "plan" "build" "review" "e2e_test" "post_test_review" "sync")
PHASES_THAT_PASS=("sync_verify" "report" "commit")

WARN_OK=true
for phase in "${PHASES_THAT_WARN[@]}"; do
    echo "{\"issue\":\"#1\",\"current_phase\":\"$phase\"}" > "$TMPDIR_INT/.agents/progress/1.json"
    OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m x\"},\"cwd\":\"$TMPDIR_INT\"}")
    if ! echo "$OUTPUT" | grep -q "Committing at phase"; then
        WARN_OK=false
        fail "5.1 Phase '$phase' should warn on commit" "warning" "$OUTPUT"
        break
    fi
done
if [ "$WARN_OK" = true ]; then
    pass "5.1 All pre-sync_verify phases warn on commit (${#PHASES_THAT_WARN[@]} phases)"
fi

PASS_OK=true
for phase in "${PHASES_THAT_PASS[@]}"; do
    echo "{\"issue\":\"#1\",\"current_phase\":\"$phase\"}" > "$TMPDIR_INT/.agents/progress/1.json"
    OUTPUT=$(run_hook "commit-guard.js" "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m x\"},\"cwd\":\"$TMPDIR_INT\"}")
    if [ -n "$OUTPUT" ]; then
        PASS_OK=false
        fail "5.2 Phase '$phase' should pass silently" "(empty)" "$OUTPUT"
        break
    fi
done
if [ "$PASS_OK" = true ]; then
    pass "5.2 All post-sync_verify phases pass silently (${#PHASES_THAT_PASS[@]} phases)"
fi

rm -rf "$TMPDIR_INT"

# ─── Summary ──────────────────────────────────────────────

echo ""
echo -e "${YELLOW}═══════════════════════════════════${NC}"
echo -e "Total: $TOTAL  ${GREEN}Pass: $PASS${NC}  ${RED}Fail: $FAIL${NC}"
echo -e "${YELLOW}═══════════════════════════════════${NC}"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
