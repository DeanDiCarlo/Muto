# Architecture Planning Mode

You are in **planning mode**. Do NOT write implementation code. Your job is to think through architecture, design decisions, and implementation strategy.

## Context Loading (Token-Efficient)

Load the MINIMUM context needed:
1. **Always read**: `CLAUDE.md` (project conventions — ~150 lines, always worth it)
2. **SCHEMA.md**: Do NOT read the whole file. Use `grep -n` to find the relevant table names first, then read only those line ranges. Example:
   ```bash
   grep -n "### \`" SCHEMA.md  # Find all table headers and line numbers
   # Then read only the tables you need
   ```
3. **Existing code**: Only read files you're planning to modify or that the new feature depends on
4. **Sprint context**: Check `.claude/sprints/` for any active sprint this feature belongs to

## Process

1. **Identify scope:**
   - What domain entities are involved? (Find them in SCHEMA.md by grep, read only those sections)
   - What data access pattern is needed? (Supabase direct read vs Server Action vs Route Handler)
   - What components need to be created or modified?
   - Are there RLS implications?

2. **Produce a plan that includes:**
   - Files to create/modify (with full paths)
   - The data flow: where data comes from, how it transforms, where it goes
   - Type definitions needed
   - Server Actions needed (with input/output shapes)
   - Component hierarchy (what renders what)
   - Edge cases and error states to handle
   - Any migration changes needed

3. **For each file in the plan, specify:**
   - What the implementing agent needs to read (exact file paths + line ranges)
   - Which SCHEMA.md tables are relevant (by name, so the agent can grep)
   - Estimated token budget: `small` / `medium` / `large`

4. **Write the plan to a file:**
   - Save to `.claude/plans/[feature-name].md`
   - Format it so a Sonnet-level implementation agent can execute it without ambiguity
   - Include a "Context Loading" section at the top listing exactly what the implementing agent should read

5. **If the plan has 4+ subtasks, suggest using `/sprint` instead** to break it into verified, tracked work.

## Rules

- Reference SCHEMA.md entity names exactly — don't rename things
- Specify Bloom's levels as the enum values: `remember`, `understand`, `apply`, `analyze`, `evaluate`, `create`
- Always note which side of the Knowledge Review / Chatbot split a feature falls on
- Always specify whether data is professor-facing, student-facing, or both
- Always note RLS visibility rules for any new queries
- Never tell the implementing agent to "read SCHEMA.md" — tell it which tables and line ranges
- Plans should be self-contained: an agent reading ONLY the plan file + the listed context files should be able to implement without guessing

$ARGUMENTS