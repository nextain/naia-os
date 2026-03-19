# Naia Panel Development Guide

Naia OS is extensible through **panels** — UI components that live in the right area of the shell alongside Naia's chat interface. Panels can expose AI tools to Naia so she can read and update panel state autonomously.

## What is a Panel?

A panel is a React component bundle installed under `~/.naia/apps/{id}/`. When installed, it:

1. Appears as a tab in the **ModeBar** (right side of the shell)
2. Renders a center UI component when activated
3. Optionally exposes **AI tools** (skills) so Naia can interact with the panel on the user's behalf

## Panel Manifest (`panel.json`)

Every panel directory must contain a `panel.json`:

```json
{
  "id": "my-panel",
  "name": "My Panel",
  "names": { "ko": "내 패널", "en": "My Panel" },
  "description": "What this panel does",
  "icon": "🔧",
  "version": "1.0.0",
  "entrypoint": "index.js"
}
```

| Field | Required | Description |
|-------|:--------:|-------------|
| `id` | ✅ | Unique kebab-case identifier (`my-panel`) |
| `name` | ✅ | Display name (fallback if `names` not set) |
| `names` | — | i18n names: `{ ko: "...", en: "..." }` |
| `description` | — | Short description shown in the future app store |
| `icon` | — | Emoji or single character shown in the ModeBar tab |
| `version` | — | Semantic version string |
| `entrypoint` | — | JS entry point (for future dynamic loading) |

## Installing a Panel

From the Naia shell, click the **`+`** button in the ModeBar:

**Git URL** (recommended):
```
https://github.com/your-org/my-panel.git
```

**Private repository** — include a token in the URL:
```
https://TOKEN@github.com/your-org/my-panel.git
```

**Zip file** (on-premises, no internet):
Select a `.zip` file containing the panel directory. The zip must extract to a folder with `panel.json` at its root.

You can also ask Naia directly:
> "my-panel 패널 https://github.com/... 에서 설치해줘"

## Panel Structure

```
my-panel/
├── panel.json          # Required manifest
├── index.tsx           # Panel registration entry (built into shell bundle)
└── MyCenterPanel.tsx   # UI component
```

> **Note**: Currently, panels are registered at shell build time. Dynamic JS loading is planned for a future release. For now, create a PR to add your panel to the shell or use the sample-note pattern as an installable template.

## Registering a Panel

In `index.tsx`, register with the panel registry:

```tsx
import { panelRegistry } from "../../lib/panel-registry";
import { MyCenterPanel } from "./MyCenterPanel";

panelRegistry.register({
  id: "my-panel",
  name: "My Panel",
  names: { ko: "내 패널", en: "My Panel" },
  icon: "🔧",
  // builtIn: true  ← omit this; built-in panels cannot be removed
  center: MyCenterPanel,
  tools: [
    {
      name: "skill_my_panel_read",   // must start with skill_
      description: "Read current state from My Panel",
      parameters: { type: "object", properties: {} },
      tier: 0,  // 0 = auto-approve, 1 = approve once, 2 = always ask
    },
    {
      name: "skill_my_panel_update",
      description: "Update My Panel with new data",
      parameters: {
        type: "object",
        properties: {
          data: { type: "string", description: "Data to set" },
        },
        required: ["data"],
      },
      tier: 1,
    },
  ],
});
```

## Implementing the Center Component

```tsx
import { useEffect, useRef, useState } from "react";
import type { PanelCenterProps } from "../../lib/panel-registry";

export function MyCenterPanel({ naia }: PanelCenterProps) {
  const [data, setData] = useState("");
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    // Register AI tool handlers
    const unsubRead = naia.onToolCall("skill_my_panel_read", () => {
      return dataRef.current || "(empty)";
    });

    const unsubUpdate = naia.onToolCall("skill_my_panel_update", (args) => {
      const newData = String(args.data ?? "");
      setData(newData);
      dataRef.current = newData;
      // Push context to Naia's system prompt (optional)
      naia.pushContext({ type: "my-panel", data: { content: newData } });
      return "Updated";
    });

    // Cleanup on unmount
    return () => {
      unsubRead();
      unsubUpdate();
    };
  }, [naia]);

  return (
    <div className="my-panel">
      <p>{data || "No data yet. Ask Naia to add something!"}</p>
    </div>
  );
}
```

### `PanelCenterProps` API

| Member | Type | Description |
|--------|------|-------------|
| `naia.onToolCall(name, handler)` | `(args) => string` | Register a tool handler. Returns an unsubscribe function. |
| `naia.pushContext(ctx)` | `void` | Push structured context into Naia's system prompt so she's aware of panel state. |

### Tool Handler Rules

- **Return value** must be a `string` — this is what Naia receives as the tool result.
- **Use a `ref`** for state accessed inside handlers to avoid stale closures.
- **Always unsubscribe** in the `useEffect` cleanup to avoid memory leaks.
- **Tool names** must start with `skill_` (e.g., `skill_my_panel_read`).

## Permission Tiers

| Tier | Behavior |
|------|----------|
| `0` | Auto-approved — Naia executes without asking |
| `1` | User is asked once per session; subsequent calls auto-approved |
| `2` | User is always asked before execution |
| `3` | Requires elevated privileges |

## Context Injection (`pushContext`)

When your panel's state changes, call `naia.pushContext()` to keep Naia informed:

```tsx
naia.pushContext({
  type: "my-panel",       // unique type string
  data: { content: "..." },
});
```

Naia will include this in her system context, so she can proactively reference panel state even without a tool call.

## skill_panel Built-in Tool

Naia has a built-in `skill_panel` tool for panel management:

```
skill_panel list      — list installed panels
skill_panel switch    — activate a panel by id
skill_panel install   — install from git URL or zip path
skill_panel remove    — uninstall a panel by id
```

Users can invoke these naturally:
> "패널 목록 보여줘"
> "my-panel 설치해줘 (https://github.com/...)"
> "sample-note 삭제해줘"

## Reference Implementation

See `shell/src/panels/sample-note/` for a complete working example:

- `panel.json` — manifest
- `index.tsx` — registration with `skill_note_read` / `skill_note_write`
- `SampleNoteCenterPanel.tsx` — textarea UI + tool handlers

## Directory Layout After Install

```
~/.naia/
└── panels/
    └── my-panel/
        ├── panel.json
        └── ...
```

The shell scans `~/.naia/panels/` on startup and after each install/remove.

## Tips

- **Keep tools focused** — one tool per action, clear description
- **Tool descriptions are LLM prompts** — write them as instructions to an AI, not documentation
- **Avoid blocking handlers** — tool handlers must return synchronously (or return a Promise that resolves quickly)
- **Test with the sample-note pattern** — build your panel as a variation of sample-note first
