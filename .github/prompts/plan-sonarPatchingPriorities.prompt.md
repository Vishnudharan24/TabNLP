High/Medium/Low classification from sonar report:

- High: 167 issues (`BLOCKER` 96 + `CRITICAL` 71)
- Medium: 749 issues (`MAJOR`)
- Low: 105 issues (`MINOR`)

Top high-priority flaws identified:
1. `python:S8410` (FastAPI dependency typing pattern; many occurrences)
2. `javascript:S3776` (high cognitive complexity)
3. `javascript:S2004` (deep nested control flow)
4. `python:S6903` (`datetime.utcnow` usage risk)
5. Async/sync mismatch patterns in backend request paths

Top medium-priority flaws identified:
1. `javascript:S5850` (regex precedence ambiguity)
2. `python:S5795` (`is` vs `==`)
3. `javascript:S3923` (same value on both conditional branches)
4. `javascript:S1854` (useless assignments)
5. `javascript:S6479` (array index as React key)

Top low-priority flaws identified:
1. `javascript:S1874` (deprecated APIs)
2. `javascript:S1128` / `javascript:S1481` (unused imports/variables)
3. `javascript:S7764` (`window` instead of `globalThis`)
4. Minor modernization/style rules (`S7781`, `S6594`, `S4138`)

## Plan: Patch High Priority First

Reduce immediate production risk by fixing correctness and architecture hotspots first in backend API dependency declarations and frontend complexity-heavy modules. This lowers defect probability and blocks cross-cutting regressions before bulk cleanup.

### Steps
1. Triage all `BLOCKER`/`CRITICAL` findings from sonar report into backend vs frontend owners.
2. Refactor FastAPI dependency signatures in `backend/main.py` around `Depends` and related route `symbol` usage.
3. Break down high-complexity logic in `App.jsx` into smaller `symbol` helpers with single responsibility.
4. Flatten deeply nested branches in `components/templates/HRTemplateDashboard.jsx` and `components/templates/SalesTemplateDashboard.jsx`.
5. Replace risky datetime patterns in `backend/main.py` and related backend `symbol` call sites.

### Further Considerations
1. Block release on unresolved high issues? Option A strict gate / Option B time-boxed exception list.
2. Do complexity refactors in one PR or per-module PRs to reduce review risk?

## Plan: Patch Medium Priority Next

After high-risk stabilization, remove medium-severity correctness and maintainability defects that can still cause subtle runtime errors, especially regex logic, comparison semantics, and state/render consistency in shared UI services.

### Steps
1. Prioritize `BUG`-typed major rules (`S5850`, `S3923`, `S5795`) from sonar report.
2. Correct regex grouping and branch semantics in `services/backendApi.js` and `App.jsx` related `symbol` flows.
3. Replace identity comparisons (`is`) with value comparisons (`==`) in backend Python `symbol` logic files.
4. Remove dead/useless assignments and stabilize React key strategy in `App.jsx` and list-rendering components.
5. Re-run Sonar and close medium issues by category (regex, comparisons, dead code, React list keys).

### Further Considerations
1. Enforce “no new major bug” policy in CI before merging feature branches.
2. Fix by rule-group first or file-group first depending on team ownership.

## Plan: Patch Low Priority Continuously

Keep low-priority debt from accumulating by handling deprecated APIs, unused code, and modernization rules in small, safe batches that do not block feature delivery but improve long-term maintainability.

### Steps
1. Batch-fix low-severity lint/style findings in `App.jsx` and `services/backendApi.js`.
2. Remove unused imports/variables and deprecated API usage across frontend component files.
3. Apply portability/readability updates (`globalThis`, modern array/string APIs) in shared utility `symbol` paths.
4. Add lint/format hooks to prevent reintroduction of minor rule violations.
5. Reserve recurring cleanup slots each sprint for remaining low findings from sonar report.

### Further Considerations
1. Track low-severity burn-down as a non-blocking KPI.
2. Prefer automated autofix tools for low-risk rules to reduce manual effort.
