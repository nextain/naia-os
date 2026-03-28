# Known-Good Test Fixtures

These files are selected from the naia-os codebase for false positive rate testing (TC-4.1).
Each file has no known bugs and has been through prior review or is stable production code.

## Selection Criteria
- No open bug reports against the file
- Stable (not recently modified in a bug-fix commit)
- Diverse: different languages, sizes, purposes

## Selected Files (10)

| # | File | Language | Lines | Why Selected |
|---|------|----------|-------|-------------|
| 1 | `shell/src-tauri/tauri.conf.windows.json` | JSON | 18 | Just cross-reviewed, 5 issues fixed |
| 2 | `shell/src-tauri/tauri.conf.json` | JSON | 83 | Base config, stable since initial setup |
| 3 | `shell/src-tauri/src/browser.rs` | Rust | 1128 | Browser panel, extensive cfg guards, verify-browser-panel passed |
| 4 | `shell/src-tauri/src/main.rs` | Rust | ~20 | Minimal entry point, no logic |
| 5 | `agent/src/gateway/device-identity.ts` | TypeScript | ~100 | Ed25519 crypto, stable |
| 6 | `shell/src/panels/workspace/constants.ts` | TypeScript | 12 | Minimal, no logic |
| 7 | `shell/src-tauri/src/workspace.rs` | Rust | ~896 | Large file, extensive tests |
| 8 | `shell/src/stores/panel.ts` | TypeScript | ~60 | Zustand store, stable |
| 9 | `.agents/profiles/_base.yaml` | YAML | 78 | Just cross-reviewed |
| 10 | `.agents/prompts/correctness.md` | Markdown | 20 | Just cross-reviewed |

## Usage

```
/cross-review code-review "TC-4.1: Review {file} for correctness (known-good, expect CLEAN)"
```

Run on each file. Record: findings count, false positive count, convergence rounds.
