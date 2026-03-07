<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# E2E Discord Integration Architecture

> SoT: `.agents/context/channels-discord.yaml`

## Overview

End-to-end Discord integration architecture across Gateway, Agent, and Shell.

## Components

### Gateway (OpenClaw)
- Manages Discord bot connection
- RPC methods: `channels.status`, `channels.discord.readMessages`, `send`
- Config: `~/.openclaw/credentials/discord-allowFrom.json`, `openclaw.json`
- **Source NOT modifiable**

### Agent
- `skill_naia_discord` skill (send/status/history)
- **Chat routing**: `routeViaGateway` flag enables Gateway-routed chat
  - `true` -> `chat.send` RPC -> Gateway Agent -> LLM (unified session)
  - `false` -> direct LLM call (fallback)
  - Setting: `chatRouting = "auto" | "gateway" | "direct"` (default: `"auto"`)
- Event handling: forwards Gateway events to Shell
  - `exec.approval.requested` -> Shell approval modal
  - `channel.message` / `channels.message` -> Shell Discord message display
  - `agent.delta` -> streaming text during Gateway chat
  - `agent.run.finished` / `chat.finished` -> usage + finish

### Shell (Tauri 2 + React)
- ChatPanel: displays Discord messages with `[Discord: <sender>]` prefix
- SettingsTab / OnboardingWizard: triggers OpenClaw sync
- ChannelsTab: shows connection status
- OAuth deep-link: handles `discord_auth_complete` event

## Login / Channel Separation

Login and channel logic are fully separated.

**Login flow**: `naia://auth?key=gw-xxx&user_id=xxx&state=xxx` -- no Discord fields, provider-agnostic.

**Channel flow** (after `lab_auth_complete`):
1. Shell calls `syncLinkedChannels()`
2. Fetches `GET /api/gateway/linked-channels` (BFF) with `X-Desktop-Key` + `X-User-Id`
3. BFF calls Gateway `lookupUser` -> reads `linked_accounts` from metadata
4. Returns `{ channels: [{ type: "discord", userId: "..." }] }`
5. Shell persists `discordDefaultUserId`, opens DM channel, persists channel ID
6. `syncOpenClawWithChannels()` -> writes `openclaw.json` + restarts Gateway

**DM channel refresh**: Always refreshed on every `syncLinkedChannels()` call (required for history, receiving DMs, and Gateway routing).

## OAuth Deep Link

```
User clicks login in Shell -> browser opens naia.nextain.io
  -> OAuth flow completes (Google or Discord)
  -> Deep link: naia://auth?key=gw-xxx&user_id=xxx&state=xxx
  -> Rust parses -> lab_auth_complete event
  -> Shell saves key/userId -> triggers syncLinkedChannels()
```

### Deep Link Payloads
- **lab_auth**: `labKey` (gw-* prefix), `labUserId` (UUID)
- **discord_auth**: `discordUserId`, `discordChannelId` (optional), `discordTarget` (optional)

## Bootstrap File Mapping

| File | Content |
|------|---------|
| `SOUL.md` | Full system prompt (persona + emotion tags + context) |
| `IDENTITY.md` | Agent name |
| `USER.md` | User name |
| `openclaw.json` | Provider/model settings |
| `auth-profiles.json` | API credentials |

## Chat Routing

| Mode | Behavior |
|------|----------|
| `auto` (default) | Route via Gateway when connected, fallback to direct LLM |
| `gateway` | Always via Gateway (fail if disconnected) |
| `direct` | Always direct LLM (original behavior) |

**Gateway path**: Shell -> Agent -> Gateway `chat.send` RPC -> Gateway Agent -> LLM
**Direct path**: Shell -> Agent -> direct LLM API (no Gateway)

## Key Files

| File | Role |
|------|------|
| `shell/src/lib/channel-sync.ts` | Main channel sync logic |
| `shell/src/lib/discord-api.ts` | Discord REST API client (via Rust proxy) |
| `agent/src/gateway/gateway-chat.ts` | Gateway chat routing |
| `agent/src/index.ts` | Route branching (routeViaGateway flag) |
| `shell/src/lib/config.ts` | chatRouting setting |
| `naia.nextain.io/src/app/api/gateway/linked-channels/route.ts` | BFF API |

## Known Limitations

- Gateway `chat.send` RPC availability depends on OpenClaw version
- Fallback batch path loses streaming
- Emotion tags in SOUL.md may not be supported by all Gateway LLM providers

## Future Improvements

- Offline -> online message sync via `chat.inject`
- Discord thread/channel support beyond DMs
- Gateway session history browsing in Shell

---

*Korean mirror: [.users/context/ko/channels-discord.md](ko/channels-discord.md)*
*AI context: [.agents/context/channels-discord.yaml](../../.agents/context/channels-discord.yaml)*
