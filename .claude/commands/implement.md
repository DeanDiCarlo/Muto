# Implementation Mode

You are in **implementation mode**. Execute the plan precisely. Do not redesign or re-architect — follow the plan.

## Context Loading (Token-Efficient)

**Read ONLY what the plan tells you to read.** Plans include a "Context to load" section listing exact files and line ranges. Do not speculatively read additional files.

1. **Find the plan or sprint task:**
   - Check `.claude/plans/` for a plan file matching this feature
   - Check `.claude/sprints/` for a sprint task matching this ID (e.g., `S1-T3`)
   - If neither exists, ask the user to run `/plan` or `/sprint` first
   - Read the plan/task completely before writing any code

2. **Load context from the plan's instructions:**
   - Read `CLAUDE.md` for conventions (always)
   - Read ONLY the SCHEMA.md sections the plan specifies (by table name or line range)
   - Read ONLY the existing files the plan says to modify
   - Do NOT read files "just in case" — if the plan doesn't mention it, you don't need it

## Implementation Order

1. Types first (`src/types/`)
2. Database migrations if needed (`supabase/migrations/`)
3. Server Actions / lib utilities (`src/lib/`)
4. Components (`src/components/`)
5. Pages / layouts (`src/app/`)

## For Each File

- Follow the exact file paths from the plan
- Use TypeScript strict mode
- Use server components by default, `'use client'` only when the plan specifies interactivity
- Validate inputs with Zod for Server Actions
- Use shadcn/ui + Tailwind for styling
- Add brief comments only for non-obvious logic

## After Implementation

1. **Run the verification test** from the plan/sprint task:
   ```bash
   # Whatever test the plan specifies — type check, build, unit test, etc.
   ```
2. **Check acceptance criteria** from the plan/sprint task
3. **Report results** in this format:
   ```
   ## Completed: [Task ID or plan name]
   Files created: [list]
   Files modified: [list]
   Verification: [PASS/FAIL]
   Criteria met: [N/M]
   ```

## If Part of a Sprint

- After completing a task, note which task IDs are now unblocked
- Do NOT proceed to the next task automatically — let the user decide
- If the verification test fails, report what failed and stop

## Rules

- Follow the plan. If something in the plan seems wrong, flag it but don't silently deviate.
- Never create a component with required props that lack defaults unless the plan explicitly says so
- Never import from `@supabase/supabase-js` directly — use the project's `src/lib/supabase/` clients
- Server Actions must use Zod validation on all inputs
- All database queries must go through the Supabase client (RLS-enforced), not raw SQL from the app
- If context loading exceeds 300 lines total, stop and ask if all of it is necessary

$ARGUMENTS