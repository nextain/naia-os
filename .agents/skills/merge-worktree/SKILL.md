---
name: merge-worktree
description: Squash-merge the current worktree branch into the main branch (or a specified target). Analyzes git history, source code, and progress.json to craft a naia-os conventional commit message.
argument-hint: "[target-branch]"
disable-model-invocation: true
---

# Merge Worktree (naia-os)

Squash-merge the current worktree branch back into the target branch with a structured commit message following naia-os conventions.

## Current context

- Git dir: `!git rev-parse --git-dir`
- Current branch: `!git branch --show-current`
- Recent commits: `!git log --oneline -20`
- Working tree status: `!git status --short`

## Instructions

Follow these phases exactly, in order. Do NOT skip phases.

---

### Phase 1: Validation

1. **Verify worktree**: Check if the current git directory is a worktree. The output of `git rev-parse --git-dir` must contain `/worktrees/`. If it does not, **stop immediately** and tell the user:
   > "This skill must be run from inside a git worktree. Create one first: `git worktree add ../<project>-issue-<N>-<desc> issue-<N>-<desc>`"

2. **Identify current branch**: Get the worktree branch name from `git branch --show-current`.

3. **Resolve target branch**:
   - If `$ARGUMENTS` is provided and non-empty, use it as the target branch.
   - Otherwise, detect the default branch: check if `main` exists, else check `master`. If neither exists, stop and ask the user.

4. **Identify the original repo path**: Use `git rev-parse --git-common-dir` to find the main repo, then derive the original repo working directory (its parent).

5. **Clean working tree**: Run `git status --porcelain`. If there are uncommitted changes, stop and tell the user to commit or stash them first.

---

### Phase 2: Research

This is the most critical phase. Deeply understand what was done before writing any commit message.

1. **Commit history**: Run `git log --oneline <target>..HEAD`.

2. **File change summary**: Run `git diff <target>...HEAD --stat`.

3. **Full diff**: Run `git diff <target>...HEAD`. Study it carefully.

4. **Read key files**: For significantly changed files, use the Read tool for full context.

5. **Read progress file**: Check `.agents/progress/*.json` for:
   - `issue` — GitHub Issue number (required for commit message)
   - `rejected_alternatives[]` — becomes `Rejected:` trailers
   - `constraints_discovered[]` — becomes `Constraint:` trailers
   - Any `Directive:` notes for future AI sessions

6. **Categorize changes**: Group changes into: feat / fix / refactor / test / docs / chore

7. **Identify scope**: Determine the affected module/scope (e.g., `shell`, `agent`, `gateway`, `os`, `config`).

---

### Phase 3: Target branch preparation

1. **Get the original repo path** (from Phase 1 step 4).

2. **Check target branch state**: Run `git -C <original-repo-path> log --oneline -10 <target>`.

3. **Detect stray WIP commits**: Warn the user if target has `wip:` / `auto-commit` / `WIP` commits.

4. **Fetch latest** (if remote exists): Run `git -C <original-repo-path> fetch origin <target> 2>/dev/null`.

---

### Phase 4: Squash merge

1. **Ensure target branch is checked out**:
   ```
   git -C <original-repo-path> checkout <target>
   ```

2. **Perform the squash merge**:
   ```
   git -C <original-repo-path> merge --squash <worktree-branch>
   ```

3. **Handle conflicts**: List conflicted files, show markers, **stop and report** — do NOT auto-resolve.

4. If merge succeeds, proceed to Phase 5.

---

### Phase 5: Craft commit message and commit

naia-os commit format (mandatory):

```
<type>(<scope>): <description> (#<issue>)

<optional body — 2-4 sentences explaining WHY, not what>

[Rejected: <approach> | <reason>]
[Constraint: <constraint description>]
[Directive: <warning for future AI modifying this code>]
Assisted-by: Claude Sonnet 4.6
```

**Rules:**
- `<type>`: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`
- `<scope>`: affected module (`shell`, `agent`, `gateway`, `os`, `config`, `harness`, `context`)
- `<description>`: imperative mood, no period, max 72 chars total on first line
- `(#<issue>)`: **required** — get from progress.json `issue` field (strip `#` prefix if present, format as `(#N)`)
- If no progress.json or no issue number: ask user before committing
- `Rejected:` — add one line per entry in `progress.rejected_alternatives[]` (only if non-empty)
- `Constraint:` — add one line per entry in `progress.constraints_discovered[]` (only if non-empty)
- `Directive:` — add only if a future AI session needs a specific warning (use judgment)
- `Assisted-by:` — always include

**Create the commit** in the original repo:
```bash
git -C <original-repo-path> commit -m "$(cat <<'EOF'
<your commit message here>
EOF
)"
```

---

### Phase 6: Verification

1. **Confirm the commit**: Run `git -C <original-repo-path> log --oneline -3` and show the result.

2. **Report summary**:
   - Final commit hash and summary line
   - Which branch it was merged into
   - Remind: worktree still exists — delete with `git worktree remove <path>` if done
   - Remind: `git push` to push to remote

---

## Important notes

- **Never force-push or use destructive git operations** without explicit user confirmation.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Issue number is mandatory** — do not commit without `(#N)` unless user explicitly waives it.
- If anything unexpected happens, **stop and explain** rather than guessing.
