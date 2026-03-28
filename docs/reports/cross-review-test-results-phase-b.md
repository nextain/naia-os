# Cross-Review Framework — Phase B Test Results (Scale)

**Date**: 2026-03-29
**Framework version**: `77a00f44`

---

## TC-1.1: Large File Stress Test

| Field | Value |
|-------|-------|
| **Target** | `shell/src-tauri/src/lib.rs` (2814 lines) |
| **Reviewers** | correctness + security (sequential) |
| **Result** | **PASS** |

**Findings**: 14 (HIGH 5, MEDIUM 6, LOW 3)

| # | Severity | Reviewer | Finding | Line |
|---|----------|----------|---------|------|
| 1 | HIGH | correctness | UTF-8 multibyte slice panic | 1694 |
| 2 | HIGH | correctness | Path::display() lossy temp file | 1999 |
| 3 | HIGH | security | API key in URL query parameter | 1385 |
| 4 | HIGH | security | Unrestricted PTY command execution | pty.rs:52 |
| 5 | HIGH | security | Raw frontend JSON to agent stdin | 1272 |
| 6 | MEDIUM | correctness | OAuth CSRF TOCTOU race | 2425 |
| 7 | MEDIUM | correctness | Tilde path not expanded | 501 |
| 8 | MEDIUM | security | OAuth CSRF bypass state=None | 2430 |
| 9 | MEDIUM | security | Discord API endpoint injection | 1670 |
| 10 | MEDIUM | security | gateway-env.json LD_PRELOAD | 737 |
| 11 | MEDIUM | security | read_local_binary no boundary | 1701 |
| 12 | LOW | correctness | Triple redundant file open | 622 |
| 13 | LOW | security | pkill without absolute path | 663 |
| 14 | LOW | security | frontend_log injection | 1244 |

**Overlap**: 0 (correctness and security found completely different issues)
**Filed as**: Issue #166

---

## TC-1.2: Multi-File PR Simulation

| Field | Value |
|-------|-------|
| **Target** | `tool-bridge.ts` (793) + `client.ts` (289) + `device-identity.ts` (30) = 1112 lines |
| **Reviewers** | correctness + security (sequential) |
| **Result** | **PASS** |

**Findings**: 18 (HIGH 5, MEDIUM 8, LOW 5)

| # | Severity | Reviewer | Finding | File:Line |
|---|----------|----------|---------|-----------|
| 1 | HIGH | correctness | Stale nodeId cache on reconnect | tool-bridge.ts:382 |
| 2 | HIGH | correctness | apply_diff replacement pattern injection | tool-bridge.ts:717 |
| 3 | HIGH | security | Blocked-command filter trivially bypassed | tool-bridge.ts:256 |
| 4 | HIGH | security | execute_command raw shell strings | tool-bridge.ts:574 |
| 5 | HIGH | security | Flatpak escape double-wrapping | tool-bridge.ts:466 |
| 6 | MEDIUM | correctness | Map mutation during close loop | client.ts:107 |
| 7 | MEDIUM | correctness | validatePath traversal bypass | tool-bridge.ts:113 |
| 8 | MEDIUM | correctness | First-node selection ignores identity | tool-bridge.ts:404 |
| 9 | MEDIUM | correctness | handleResponse crash on malformed error | client.ts:279 |
| 10 | MEDIUM | security | validatePath permits absolute paths | tool-bridge.ts:112 |
| 11 | MEDIUM | security | search_files ReDoS via grep pattern | tool-bridge.ts:620 |
| 12 | MEDIUM | security | Auth token cleartext ws:// | client.ts:139 |
| 13 | MEDIUM | security | Signature field-boundary confusion | client.ts:158 |
| 14 | LOW | correctness | publicKey naming hides PEM encoding | device-identity.ts:15 |
| 15 | LOW | correctness | Flatpak escape not using shared function | tool-bridge.ts:469 |
| 16 | LOW | correctness | GATEWAY_TOOLS exposed when hasGateway=false | tool-bridge.ts:97 |
| 17 | LOW | security | Silent signing failure degrades auth | client.ts:175 |
| 18 | LOW | security | Private key PEM on heap lifetime | device-identity.ts:26 |

**Overlap**: 1 (validatePath — correctness found traversal bypass, security found absolute path issue)
**Cross-file findings**: 3 (nodeId cache stale across reconnect, signature payload field confusion, private key lifecycle)
**Filed as**: Issue #167

---

## Phase B Summary

| Metric | TC-1.1 | TC-1.2 |
|--------|--------|--------|
| Target size | 2814 lines | 1112 lines (3 files) |
| Findings | 14 | 18 |
| HIGH | 5 | 5 |
| Reviewer overlap | 0% | 5.6% (1/18) |
| Cross-file findings | N/A | 3 |
| Verdict | PASS | PASS |

**Key insight**: Different review strategies (correctness vs security) produce almost entirely non-overlapping findings. This validates the DMAD (Diverse Multi-Agent Debate) principle — strategy diversity > persona diversity.
