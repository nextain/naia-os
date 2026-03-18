# Iterative Code Review

Perform a structured iterative review. **Every pass MUST use Read/Grep/Glob — process-guard will block a "clean pass" declaration with no file reads.**

---

## Step 1: Determine scope

List every file changed in this work session:

```bash
git diff --name-only HEAD          # staged + unstaged vs last commit
git diff --name-only --cached HEAD # staged only
```

Also include any newly created files mentioned in the current task.

## Step 2: Read each file (Pass 1)

For EVERY file in scope, use the `Read` tool to read it.

While reading, check:
- Logic correctness and edge cases
- Consistency with the plan and adjacent code
- Missing error handling at system boundaries
- Naming clarity
- No debug artifacts (console.log, hardcoded test values)

## Step 3: Record findings

List every issue found, per file. Example:

```
shell/src/foo.ts:42 — Missing null check before .map()
shell/src/bar.ts — No issues
```

If you found issues → fix them now, then re-read the fixed files before continuing.

## Step 4: Pass 2

Re-read all files in scope again with the Read tool.

- If issues found → fix, re-read, restart Pass 2
- If no issues found → **this is your FIRST clean pass**
  - State: "Pass 2 clean. Files reviewed: [list]"

## Step 5: Pass 3 (confirmation)

Re-read all files in scope one more time.

- If issues found → fix and restart
- If no issues → **SECOND consecutive clean pass → review complete**
  - State: "Pass 3 clean. Review complete. Two consecutive clean passes confirmed."

---

## Completion declaration (required format)

Only use this format after two consecutive clean passes:

```
Review complete.
Pass N: [filename list] — no issues
Pass N+1: [filename list] — no issues
Two consecutive clean passes confirmed.
```

**Do NOT omit the file list.** The process-guard hook detects "clean pass" claims without file reads and will block the response.

---

## Update progress file

After review completes, update `.agents/progress/<issue>.json`:

```json
{
  "review_evidence": [
    {
      "pass": 1,
      "files_read": ["shell/src/foo.ts", "shell/src/bar.ts"],
      "issues_found": ["foo.ts:42 null check"],
      "date": "YYYY-MM-DD"
    },
    {
      "pass": 2,
      "files_read": ["shell/src/foo.ts", "shell/src/bar.ts"],
      "issues_found": [],
      "date": "YYYY-MM-DD"
    },
    {
      "pass": 3,
      "files_read": ["shell/src/foo.ts", "shell/src/bar.ts"],
      "issues_found": [],
      "date": "YYYY-MM-DD"
    }
  ]
}
```

Two passes with empty `issues_found` = review complete.
