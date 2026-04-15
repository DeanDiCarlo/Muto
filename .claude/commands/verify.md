# Task Verification Mode

Verify that a sprint task has been completed correctly. Run the verification tests and check acceptance criteria.

## Process

1. **Find the sprint file:**
   - Look in `.claude/sprints/` for the relevant sprint
   - Find the specific task by ID (e.g., `S1-T3`)
   - Read ONLY that task's section, not the whole sprint

2. **Run the verification test:**
   - Execute the exact command specified in the task's verification field
   - Capture the output
   - Report PASS or FAIL with details

3. **Check acceptance criteria:**
   - For each criterion, verify it's met by inspecting the relevant files
   - Don't re-read SCHEMA.md unless the criterion specifically requires schema validation
   - Check that files listed in "Files" actually exist and are non-empty

4. **Report results:**

```
## Task S1-T3: [Title]

### Verification test
[PASS/FAIL] — [command output summary]

### Acceptance criteria
- [x] Criterion 1 — verified by [how]
- [ ] Criterion 2 — FAILED: [what's wrong]
- [x] Criterion 3 — verified by [how]

### Files check
- [x] src/types/courses.ts — exists, 45 lines
- [x] src/lib/actions/courses.ts — exists, 82 lines

### Result: [PASS / FAIL — N of M criteria met]
```

5. **If FAIL:**
   - List exactly what needs to be fixed
   - Reference the specific acceptance criterion that failed
   - Do NOT attempt to fix it — report only (the user decides whether to run /implement to fix)

## Rules

- Read the minimum context needed — just the task definition and the files it created
- Never run destructive commands (db reset, rm, etc.) during verification — read-only checks
- If the verification test requires a running dev server, say so and provide the manual check steps
- Report results in the structured format above so they can be tracked

$ARGUMENTS