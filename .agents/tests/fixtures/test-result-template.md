# Cross-Review Test Results

## Test Execution Summary

| Metric | Value |
|--------|-------|
| **Date** | {YYYY-MM-DD} |
| **Executor** | {who ran the tests} |
| **Framework version** | {commit hash} |
| **Tests executed** | {N} of {total} |
| **Pass** | {N} |
| **Fail** | {N} |
| **Characterization** | {N} |

---

## Individual Test Results

### TC-{id}: {name}

| Field | Value |
|-------|-------|
| **Date** | {ISO} |
| **Review ID** | {cr-id} |
| **Target** | {file or description} |
| **Profile** | {profile used} |
| **Run** | {1/3, 2/3, 3/3} |

**Setup**: {how the test was prepared}

**Expected**: {what should happen}

**Actual**: {what happened}

**Result**: PASS | FAIL | CHARACTERIZATION({value})

**Evidence**: `.agents/reviews/{cr-id}.jsonl`

**Metrics** (from parse-review-log.js):
```
Confirmed: {N}
Dismissed: {N}
Contested: {N}
Rounds: {N}
Status: {clean|found_issues|max_rounds}
```

**Notes**: {observations, unexpected behaviors, edge cases encountered}

---

## Aggregate Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Detection rate | >= 60% | {%} | PASS/FAIL |
| False positive rate | <= 20% | {%} | PASS/FAIL |
| Multi vs single improvement | >= +15% | {%} | PASS/FAIL |
| Natural convergence rate | >= 90% | {%} | PASS/FAIL |
| Parse failure rate | <= 10% | {%} | PASS/FAIL |
| Correlated blind spot rate | (measured) | {%} | CHARACTERIZATION |
