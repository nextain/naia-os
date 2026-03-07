<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Naia Vision

> SoT: `.agents/context/vision.yaml`

## One-Liner

> **OS itself is the AI's tool.**

Existing AI tools follow a "human uses AI as a tool" model.
Naia flips this -- **give the AI an entire OS.**

## Core Concept

```
Existing: Human -> [AI tool] -> Result
Naia:     Human <-> Alpha(AI) -> [Entire OS] -> Result
```

Alpha lives on the OS:
- Reads and writes files
- Runs terminal commands
- Installs and manages apps
- Searches the web
- Co-plays games
- Summons other AI agents

## Why an OS?

| Existing Approach | Problem | Naia |
|-------------------|---------|------|
| VS Code extension | Must open IDE to use AI | Always on |
| CLI agent | Terminal only | Full OS control |
| Chatbot app | Can only talk | Can execute |
| MoltBot (Mac daemon) | Requires brew install | Just plug in USB |

## User Scenarios

**Daily life**: Schedule check, meeting prep, reminders
**Development**: Build errors -> auto-analyze -> fix -> rebuild
**Gaming**: Join Minecraft, autonomous actions, co-play
**System**: Disk cleanup, service management, monitoring

## Parent Projects

| Role | Project | What we get |
|------|---------|-------------|
| OS base | Bazzite | Immutable Linux, GPU drivers, gaming optimization |
| Avatar + games | AIRI | VRM rendering, plugin SDK, game agents (Minecraft/Factorio) |
| AI daemon | MoltBot | Gateway pattern, channel integration (18+), Skills (50+) |
| AI engine | OpenCode | Client/Server separation, provider abstraction, LSP |
| AI engine | Careti | LLM providers (31), tools (20+), sub-agents, persona system |

## Target Audience

Anyone who wants a personal AI OS. Not developer-only.

## Long-Term

Naia = AI's home. Alpha lives here.
