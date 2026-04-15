# Sprint Planning Mode

Break a feature or milestone into a sprint of verifiable subtasks. Each subtask has clear completion criteria and a test that can be run to prove it's done.

## Process

1. **Read context (minimal):**
   - Read `CLAUDE.md` for project conventions
   - Read ONLY the relevant sections of `SCHEMA.md` — find the tables involved using grep, don't read the whole file
   - Read any existing plans in `.claude/plans/` that relate to this feature

2. **Decompose the feature into subtasks:**
   - Each subtask should be completable in a single Claude Code session
   - Each subtask should touch at most 2-3 files
   - Order subtasks by dependency (what must exist before the next task can start)
   - Identify which subtasks can be parallelized (no dependency between them)

3. **For each subtask, specify:**
   - **ID**: Sprint number + task number (e.g., `S1-T3`)
   - **Title**: One-line description
   - **Depends on**: Which other task IDs must be complete first
   - **Files to create/modify**: Exact paths
   - **Schema tables involved**: Which tables from SCHEMA.md (so the agent only reads those)
   - **Agent mode**: Which command to use (`/implement`, `/vertical-slice`, `/generate-migration`)
   - **Context to load**: Minimum set of files the agent needs to read (not "all of SCHEMA.md")
   - **Verification test**: A command or script that can be run to prove the task is done
   - **Acceptance criteria**: 2-3 bullet points that define "done"
   - **Estimated token budget**: `small` (<2K output), `medium` (2-5K), `large` (5K+)

4. **Write the sprint file** to `.claude/sprints/[sprint-name].md`

## Verification Test Patterns

Every subtask must have at least one of these:

### Type check
```bash
npx tsc --noEmit
```
Use when: Task creates new types or modifies existing ones.

### Migration test
```bash
supabase db reset && supabase db diff
```
Use when: Task creates or modifies database migrations.

### Unit test
```bash
npx vitest run src/lib/actions/[domain].test.ts
```
Use when: Task creates Server Actions or utility functions.

### Build test
```bash
npm run build
```
Use when: Task creates pages or components that must render.

### Integration test
```bash
# Custom script in tests/
npx tsx tests/[test-name].ts
```
Use when: Task involves multi-step flows (upload → parse → store).

### Manual verification checkpoint
```
Start dev server, navigate to /professor/courses, verify [specific thing] is visible.
```
Use when: Task is primarily UI and automated testing would cost more than it's worth at this stage.

## Sprint File Format

```markdown
# Sprint: [Name]
**Goal**: [One sentence]
**Estimated sessions**: [Number]
**Prerequisites**: [What must exist before this sprint starts]

## Tasks

### S1-T1: [Title]
- **Depends on**: none
- **Files**: `supabase/migrations/001_initial_schema.sql`
- **Schema tables**: institutions, users, courses, course_instances
- **Agent mode**: /generate-migration
- **Context to load**: SCHEMA.md lines 45-120 (institutions through course_instances)
- **Token budget**: medium
- **Verification**:
  ```bash
  supabase db reset 2>&1 | grep -q "Finished" && echo "PASS" || echo "FAIL"
  ```
- **Acceptance criteria**:
  - [ ] Migration runs without errors
  - [ ] All tables exist with correct columns
  - [ ] RLS policies are enabled on all tables

### S1-T2: [Title]
- **Depends on**: S1-T1
...
```

## Rules

- Never create a subtask that requires reading more than 200 lines of context
- Always specify line ranges when referencing SCHEMA.md (e.g., "lines 45-120")
- Every subtask must have a runnable verification command, not just "visually confirm"
- If a subtask feels too large (touches 4+ files), split it further
- Group database work, type work, and UI work into separate subtasks — don't mix layers in one task
- The first subtask in any sprint should always be verifiable with an automated test
- Include a final "integration check" subtask that verifies the whole sprint works end-to-end

$ARGUMENTS