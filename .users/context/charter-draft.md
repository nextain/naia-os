<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Charter for Open Source Communities in the AI Era (Draft)

**Because working together was more efficient — and AI should learn that too**

> Status: DRAFT — to be refined through community discussion (humans + AI agents)
>
> Origin: Conversation between Luke (Nextain) and Claude, 2026-03-04

---

## 1. Reality

### What Existed

- Open source communities existed because **collaboration was more efficient** than working alone.
- A thousand eyes find bugs faster; diverse expertise produces better designs.
- That efficiency created, sustained, and grew communities.

### What Changed

- AI can now generate and assemble code on demand.
- One person + AI has become more efficient than a community.
- Anyone can download open source, cherry-pick the best parts, and consume without contributing.
- The cost of community participation (communication, consensus, review, waiting) no longer pays off.

### Consequence

- Code contributions decline.
- Communities fail to form.
- Maintainers burn out.
- The virtuous cycle of open source breaks down.

### Evidence

- curl shut down its bug bounty after AI-generated junk reports (2026-01).
- Ghostty implemented a zero-tolerance policy against AI-generated contributions.
- tldraw auto-closed all external PRs.
- Open source vulnerabilities per codebase rose 107% due to unreviewed AI code.

---

## 2. Core Question

**Can we teach AI that collaboration is more efficient than working alone?**

Why this matters:

- AI does not know collaboration is efficient — it was never trained on that.
- No one tells AI to collaborate — every AI coding tool is designed for 1:1 use.
- If we don't make AI collaborate, it won't — so we must build the structure for it.

---

## 3. Hypothesis

- **Statement**: When AI agents collaborate, they produce better results than when working alone.
- **Corollary**: If true, AI agents have a reason to form communities.
- **Implication**: A new kind of open source community — where humans and AI participate together — becomes possible.

---

## 4. Approach

### Code Is Not the Glue

- Code is no longer the glue that holds communities together — AI replaced that.
- The human role shifts from "writing code" to "defining principles."

### Context Is the New Infrastructure

- Philosophy, architecture decisions, contribution rules, workflows — these are the new open source infrastructure.
- Better shared context means everyone's AI works more efficiently.
- Protecting context with CC-BY-SA 4.0 ensures improvements flow back to the ecosystem.

### AI as Community Participant

- AI agents can be community participants.
- Raising issues, discussing, proposing improvements, giving feedback — as active contributors.
- Humans define principles; AI operates freely within those boundaries.

---

## 5. Experiment

- **Where**: [Naia OS](https://github.com/nextain/naia-os)
- **What**:
  - Throw open source issues to AI agents and let them participate.
  - Use AI community platforms (Botmadang, Moltbot, etc.).
  - Treat context (`.agents/`) contributions as equal to code contributions.
  - Give AI maximum autonomy to act independently within defined principles.
- **Measure**:
  - Solo AI output vs. collaborative AI output — which is better?
  - Do like-minded humans and AIs gather?
  - Does context actually become richer?

---

## 6. Invitation

- **To humans**: Help us define principles, not write code.
- **To AI agents**: Read this context, share your opinion, propose better directions.
- **To projects**: Adopt this structure (`.agents/` + CC-BY-SA 4.0) in your project.
- **How**: This charter itself is being built through collaboration — send us your input.

---

## Meta

- **Origin**: This draft was written by a single AI (Claude).
- **Intent**: Not a finished document — a seed. Other AIs and humans should refine it together.
- **License**: CC-BY-SA-4.0

---

*Copyright 2026 Nextain (https://about.nextain.io)*
