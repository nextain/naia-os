<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Code/Pattern Reuse from project-careti

> SoT: `.agents/context/careti-reuse.yaml`

## Direct Code Reuse

### 1. Desktop stdio Protocol (~100% reuse)
- **Source**: `project-careti/desktop/src-tauri/src/lib.rs` + `src/standalone/stdio-adapter.ts`
- **Target**: `shell/src-tauri/` + `agent/`
- Tauri <-> Node.js stdio bridge, JSON lines, auto-restart

### 2. LLM Providers (high reuse)
- **Source**: `project-careti/src/api/providers/`
- **Target**: `agent/src/providers/`
- 31 provider adapters, streaming, retry logic, model list

### 3. Tools (high reuse)
- **Source**: `project-careti/src/core/` + `careti-src/`
- **Target**: `agent/src/tools/`
- file_read, file_write, apply_diff (SmartEditEngine), execute_command, browser, search

### 4. Sub-Agents (medium reuse, simplified)
- **Source**: `project-careti/src/core/task/`
- **Target**: `agent/src/sub-agents/`
- Sub-task spawn, parallel execution, context passing

### 5. MCP Integration (medium reuse)
- **Source**: `project-careti/src/services/mcp/`
- **Target**: `agent/src/mcp/`
- MCP server connection, tool discovery

## Pattern Reuse

### Persona System
- **Source**: `project-careti/src/core/prompts/`
- System prompt structure, persona profiles, custom instructions

### Platform Abstraction
- **Source**: `webview-ui/src/config/platform.config.ts`
- PlatformType enum, build-time injection, per-platform config

### esbuild Bundling
- **Source**: `project-careti/esbuild.mjs`
- Bundle agent-core to single JS file for Tauri to spawn

## Context Management Reuse

### Dual-Directory (.agents/ + .users/)
- AI-optimized + human-readable parallel contexts
- Alpha manages its own context automatically

### Cascade Rules
- Context changes trigger mirror updates
- Skills added/removed -> related docs auto-updated

### Work Logs
- `YYYYMMDD-{n}-{topic}.md` pattern in todo/doing/done folders

## Do NOT Reuse

| Careti Element | Reason |
|----------------|--------|
| VS Code extension structure | Not an IDE extension |
| webview-ui React app wholesale | New Avatar-centric UI |
| Cline fork code | No upstream dependency |
| gRPC server | stdio is sufficient |
| i18n system | Korean/English only at start |
| Account/auth system | Local OS, no accounts (Phase 5+ reviewed) |

## Reuse Strategy per Phase

| Phase | Strategy |
|-------|----------|
| Phase 1 | AIRI stage-ui-three (Avatar). No Careti code. |
| Phase 2 | Careti stdio bridge + LLM providers (copy + clean) |
| Phase 3 | Careti tools (copy + clean). Add permission layer. |
| Phase 4 | MoltBot Gateway pattern (reference, new implementation) |
| Phase 5+ | AIRI Minecraft agent (reference, new implementation) |

---

*Korean mirror: [.users/context/ko/careti-reuse.md](ko/careti-reuse.md)*
*AI context: [.agents/context/careti-reuse.yaml](../../.agents/context/careti-reuse.yaml)*
