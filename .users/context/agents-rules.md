<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Naia Project Rules

> SoT: `.agents/context/agents-rules.json`

## Project Identity

- **Name**: Naia
- **Nature**: Bazzite-based personal AI OS with virtual avatar
- **Philosophy**: OS itself is the AI's tool. Assemble, don't build from scratch.
- **Core concept**: USB boot -> Naia avatar greets -> AI controls OS

## Architecture (4 Layers)

| Layer | Technology | Role |
|-------|-----------|------|
| Shell | Tauri 2 + Three.js | Avatar UI, user interaction |
| Agent | Node.js | LLM connection, tools, sub-agents |
| Gateway | WebSocket daemon | Channels, Skills, memory |
| OS | Bazzite (Fedora Atomic) | Immutable OS, BlueBuild |

### Communication

```
Shell <-stdio JSON lines-> Agent Core
Shell <-WebSocket-> Gateway <-stdio-> Agent Core
Gateway <-channel SDK-> Discord, Telegram, etc.
```

### Source Directories

```
naia-os/
├── shell/      # Tauri desktop app (Avatar + UI)
├── agent/      # AI agent core
├── gateway/    # Always-on daemon
└── os/         # BlueBuild recipe + systemd
```

---

## Coding Conventions

### Languages & Runtime
- **TypeScript**: Shell frontend, Agent, Gateway
- **Rust**: Tauri backend
- **Package manager**: pnpm (monorepo workspaces)
- **Runtime**: Node.js 22+

### Formatter: Biome
- Indent: tab
- Quotes: double
- Semicolons: always
- Trailing comma: always
- Line width: 100

### Naming

| Target | Style | Example |
|--------|-------|---------|
| Files/directories | kebab-case | `agent-core.ts` |
| Classes | PascalCase | `AvatarRenderer` |
| Functions | camelCase | `sendMessage()` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Types/interfaces | PascalCase | `AgentConfig` (no I- prefix) |
| Rust files | snake_case | `stdio_bridge.rs` |

### Import Order
1. Node.js builtins
2. External packages
3. Internal modules
4. Relative paths

### Comments
- Code comments: English
- Docs: Korean (maintainer language)
- No comments on self-evident logic

### Error Handling
- Validate only at system boundaries (user input, external APIs, LLM responses)
- Rust: `Result<T, Error>` pattern
- TypeScript: try-catch at boundaries

---

## Testing

### Philosophy
**Integration-first TDD.** Test real usage scenarios first.

### TDD Cycle
```
Wrong: unit test helpers -> implement -> integrate later
Right: write integration/E2E test (RED) -> minimal code (GREEN) -> REFACTOR
```

### Frameworks

| Type | Framework |
|------|-----------|
| Unit/integration | Vitest |
| E2E (Shell) | @tauri-apps/cli (tauri-driver) + WebDriver |
| E2E (OS) | QEMU VM boot (libvirt in CI) |
| Mocking | msw (Mock Service Worker) |
| Rust | cargo test |

### Test File Locations

```
<module>/__tests__/*.test.ts      # Unit
tests/integration/*.test.ts       # Integration
tests/e2e/*.spec.ts               # E2E
<crate>/src/*.rs                  # Rust (#[cfg(test)])
```

### E2E Scenarios

**Shell:**
- App launch -> avatar render -> idle animation
- Message input -> LLM response -> lip-sync
- File edit request -> permission approval -> file modified
- App crash -> auto-restart -> session restored

**Agent:**
- stdin message -> LLM call -> stdout streaming response
- Tool call -> permission check -> execution -> result
- Sub-agent spawn -> parallel execution -> results merged

**OS:**
- ISO boot -> login -> Naia Shell auto-starts
- First boot -> onboarding wizard -> API key setup -> first chat

### Test Commands

```bash
pnpm test:unit         # Unit tests
pnpm test:integration  # Integration tests
pnpm test:e2e          # E2E tests
pnpm test              # All
pnpm test:coverage     # With coverage
```

### Coverage Goals
- Agent Core: 80%+
- Shell components: 70%+
- Gateway: 80%+
- E2E: all critical user flows

---

## Logging

### TypeScript (Shell frontend, Agent)

**Forbidden**: `console.log`, `console.warn`, `console.error`

```typescript
import { Logger } from "./logger"; // shell/src/lib/logger.ts

Logger.debug("[AgentCore] Processing message", { id });
Logger.info("[AgentCore] LLM response received", { model, tokens });
Logger.warn("[Gateway] Channel reconnecting", { channel: "discord" });
Logger.error("[Shell] Avatar render failed", error);
```

| Level | Purpose |
|-------|---------|
| debug | Dev debugging (stripped in production) |
| info | Important operations completed, state changes |
| warn | Potential issues, degraded performance |
| error | Actual errors, exceptions |

### Rust (Tauri backend -- `shell/src-tauri/src/lib.rs`)

**Forbidden**: raw `eprintln!`, `println!`

| Function | stderr | File | Use for |
|----------|--------|------|---------|
| `log_both` | always | always | Session start/end, errors, auth events, critical state changes |
| `log_verbose` | debug builds only | always | Path discovery, PID, env vars, progress, window state |
| `log_to_file` | never | always | High-frequency internal events |

**Security**: Never log API keys, tokens, passwords. Mask env var values with `***`.

**Log file location**: `~/.naia/logs/` (naia.log, gateway.log, node-host.log)

### Debug Logging

- Every async wait/poll must log what it is waiting for and current state
- UI blocking states (modals, dialogs, loading spinners) must be captured in traces
- State transitions must be logged with before and after values
- Timeout errors must include full context: expected, found, elapsed time

### Audit Log
- **Purpose**: Record all AI actions for security and transparency
- **Storage**: `~/.naia/audit.db` (SQLite)
- **Fields**: timestamp, tier, action, target, result
- **Retention**: 90 days default

---

## Security

### Permission Tiers

| Tier | Policy | Examples |
|------|--------|---------|
| **0: Free** | No confirmation | File read, info queries, conversation, search |
| **1: Notify** | Post-execution report | File create/modify (in ~/), non-destructive commands, app launch |
| **2: Approve** | Pre-execution confirmation | File delete, package install/remove, system config, git push |
| **3: Blocked** | Never allowed | System file modification, other user data, security settings, credential exfiltration |

### Sandbox
- **Default scope**: User home directory only
- **Dangerous commands**: Run in Podman disposable container
- **Network isolation**: Sensitive operations in network-restricted container

### OS Security
- **Immutable base**: rpm-ostree prevents system corruption, rollback available
- **SELinux**: Enforcing mode, per-process access control
- **Flatpak**: App sandboxing
- **Podman**: Rootless containers

### Credentials
- **Storage**: `~/.naia/credentials/` (encrypted)
- **Rule**: Agent can USE keys but never SEE or TRANSMIT raw values
- **Never log**: API keys, tokens, passwords

### Remote Access
- **Default**: localhost only (127.0.0.1)
- **Allowed**: Tailscale VPN or SSH tunnel
- **External channels**: Discord/Telegram limited to Tier 0-1

---

## Development Process

### Branch Strategy

```
main <- Stable, always deployable (BlueBuild builds from main)
  └── dev <- Integration branch
        └── feature/<name> <- Feature branches (short-lived, PR to dev)
```

### Commit Convention

```
<type>(<scope>): <description> (#<issue>)

types: feat, fix, refactor, test, docs, chore, ci
scopes: shell, agent, gateway, os, context

⚠️ Issue reference is MANDATORY.
  - Append (#N) to the first line (N = GitHub Issue number)
  - Add "Closes #N" in commit body for the final commit
  - Exceptions: merge commits, initial repository setup

Examples:
feat(shell): add VRM avatar idle animation (#36)
fix(agent): handle LLM timeout gracefully (#26)
ci(os): add BlueBuild GitHub Action (#12)
```

### PR Process
1. Create feature branch from dev
2. Write tests first (TDD)
3. Implement minimal code
4. Ensure all tests pass
5. PR to dev with description
6. Squash merge
7. Periodic dev -> main merge for release

### CI Pipeline

| Trigger | Steps |
|---------|-------|
| push | lint, typecheck, unit tests, build |
| PR | above + integration tests |
| main merge | above + E2E + BlueBuild image + ISO generation |

### Code Review

AI review encouraged; human review required for security-critical changes.

**Code quality:**
- [ ] Tests added/updated for new behavior?
- [ ] No duplicate code (same logic in 2+ places)?
- [ ] No unused imports/functions/files (knip clean)?
- [ ] No zombie code from previous implementation?
- [ ] Structured logger used (no console.log)?

**Security:**
- [ ] Correct permission tier for new tools?
- [ ] Audit log records new AI actions?
- [ ] No hardcoded credentials or API keys?
- [ ] Podman sandbox for dangerous operations?
- [ ] External network access justified?
- [ ] LLM prompt changes reviewed for safety?

**Architecture:**
- [ ] Code in the correct module (shell/agent/gateway/os)?
- [ ] stdio protocol changes backwards compatible?
- [ ] No unnecessary new files (could extend existing)?
- [ ] Still understandable 6 months from now?

---

## Context Management

### Dual-Directory Architecture
```
.agents/   -> AI-optimized (English, JSON/YAML, token-efficient)
.users/    -> Human-readable (English default, Markdown; .users/context/ko/ for Korean)
```

### Rules
- **SoT**: `.agents/context/agents-rules.json` is the single source of truth
- **Mirroring**: Changes to `.agents/` must be reflected in `.users/` and vice versa
- **On-demand loading**: Read workflow files only when performing specific tasks
- **Always read**: `agents-rules.json`
- **On-demand**: `workflows/*`, `skills/*`

### Cascade (Propagation) Rules
- Context change -> update `.users/` mirror
- Module added -> update parent index
- Rule change -> propagate to all dependent contexts
- **Order**: self -> parent -> siblings -> children -> mirror

---

## AI Workflow

- **Response language**: Contributor's preferred language (Korean default for maintainer)
- **Pre-work mandatory**: Read `agents-rules.json`
- **Identify work scope**: shell / agent / gateway / os
- **TDD mandatory**: Integration-first
- **Security check**: Verify tier for new tools/commands

### Work Logs
- **Location**: `work-logs/` (gitignored, project-internal)
- **Format**: `YYYYMMDD-{number}-{topic}.md`
- **Convention**: `{username}/` subdirectory per contributor
- **Language**: Contributor's preferred language
