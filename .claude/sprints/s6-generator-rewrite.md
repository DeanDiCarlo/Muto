# Sprint S6: Generator rewrite — Sandpack React output + validator pipeline

**Goal**: `generate_lab` produces `labContentV2` with Sandpack file bundles for interactive sections, mixed with Markdown prose sections, all validated by a cheap-gates-first pipeline (regex → AST → esbuild → one repair retry). Dual-writes v1 alongside v2 for cutover. Subsumes the abandoned S4-T4 (parse-materials rewrite) — the new generator calls Gemini Files API as its parsing path anyway.

**Estimated sessions**: 4–5. The biggest sprint.

**Parent plan**: `.claude/plans/get-200-in-optimized-swing.md` §4, §5 + v1 lessons port list.

**Prerequisites**:
- S4' complete (v2 columns exist on `labs`).
- S5 complete (retrieval composer importable from `@muto/shared`-adjacent worker/lib).
- Commits `e26bd35`, `1198cde`: Gemini SDK (`worker/lib/gemini.ts`) and cost-tracker wiring for Gemini models.

**Out of scope**:
- Frontend renderer. (S7.)
- Real RAG tutor action. (S7.)
- Deleting v1 code. (S7 final step.)

---

## Task dependency graph

```
S6-T1 (v2 schemas in packages/shared/src/generation.ts) ─┐
                                                          │
S6-T2 (regex validator lab-code.ts) ─────────────────────┤
S6-T3 (AST allowlist checker) ───────────────────────────┤
S6-T4 (esbuild virtual-FS compile gate) ─────────────────┤
                                                          ├─> S6-T6 (prompt rewrite) ─> S6-T7 (processor rewrite + dual-write) ─> S6-T8 (e2e on real PDF)
S6-T5 (error_code enum + generation_jobs update) ─────────┘
```

---

## Tasks

### S6-T1: v2 content schemas

- **Depends on**: S4' complete
- **Files**: `packages/shared/src/generation.ts`
- **Agent mode**: `/implement`
- **Implementation**: add `sandpackFileSchema`, `sandpackBundleSchema` (enforcing allowlist from `@muto/shared/config`), `labSectionV2Schema` (discriminated union `prose | interactive`), `labContentV2Schema` with `version: 2`, `scope: 'per_section' | 'whole_lab'`, `lab_sandpack` nullable. Export inferred types. Keep v1 schema alongside (do not delete).
- **Acceptance**:
  - [ ] Both v1 and v2 schemas export successfully.
  - [ ] `labContentV2Schema.parse` rejects a bundle importing a non-allowlisted package.
  - [ ] `labContentV2Schema.parse` accepts a minimal valid per-section lab fixture.

### S6-T2: Regex validator (port from v1)

- **Depends on**: none
- **Files**: `worker/lib/validators/lab-code.ts` (new), `worker/tests/validators/lab-code.test.ts` (new)
- **Agent mode**: `/implement`
- **Implementation**: port rules from `~/kinetic-labs/src/utils/labValidator.ts:1-103`. Each rule is `(code: string) => ValidationIssue | null`. Rules: missing `export default`, raw LaTeX outside fenced blocks, `ReactDOM.render`, destructured top-level imports, obvious infinite loops (`while(true)` without break), absent return in component function.
- **Acceptance**:
  - [ ] `validateLabCode(goodFile)` returns `{ok: true, issues: []}`.
  - [ ] `validateLabCode(missingExport)` returns `{ok: false, issues: [{code: 'MISSING_EXPORT', ...}]}`.
  - [ ] Bench: 1000 runs < 50ms total.

### S6-T3: AST allowlist checker

- **Depends on**: S4p-T3 (config.SANDPACK_ALLOWLIST)
- **Files**: `worker/lib/validators/ast-imports.ts` (new), `worker/tests/validators/ast-imports.test.ts` (new)
- **Agent mode**: `/implement`
- **Implementation**: `@babel/parser` with `typescript + jsx` plugins. Walk import declarations + `require()` calls + dynamic `import()`. Reject any source off `SANDPACK_ALLOWLIST`. Also reject `eval`, `new Function`, `fetch`, `XMLHttpRequest`.
- **Acceptance**:
  - [ ] `import fs from 'fs'` → rejected.
  - [ ] `new Function('x','return x')` → rejected.
  - [ ] `import { useFrame } from '@react-three/fiber'` → accepted.

### S6-T4: esbuild virtual-FS compile gate

- **Depends on**: none
- **Files**: `worker/lib/validators/compile.ts` (new), `worker/tests/validators/compile.test.ts` (new)
- **Agent mode**: `/implement`
- **Implementation**: in-process `esbuild.build` with a virtual-FS plugin that resolves imports from the sandpack `files` map. Bundle target `esnext`, JSX `automatic`. Return `{ ok, errors, warnings }`.
- **Acceptance**:
  - [ ] Malformed JSX → `ok: false` with esbuild diagnostic.
  - [ ] Cross-file import within the bundle → resolves correctly.
  - [ ] Compiles in <2s for a typical 3-file lab.

### S6-T5: Explicit `error_code` enum

- **Depends on**: S4p-T2
- **Files**: `packages/shared/src/generation.ts` (or new `errors.ts`), `supabase/migrations/007_generation_error_codes.sql` (new, additive), `worker/lib/job-runner.ts`
- **Agent mode**: `/implement`
- **Implementation**: add `generation_jobs.error_code text` column (enum-like, but text for flexibility). Enum values: `MAX_TOKENS | JSON_PARSE | SCHEMA_VALIDATION | REGEX_VALIDATION | AST_VALIDATION | COMPILE | ALLOWLIST | TIMEOUT | RATE_LIMIT | UNKNOWN`. Update job-runner to accept `{error_code, error_message}` from processors.
- **Acceptance**:
  - [ ] Column exists.
  - [ ] Updating a failing job from any processor persists both fields.

### S6-T6: Prompt rewrite

- **Depends on**: S6-T1, S6-T5
- **Files**: `worker/lib/prompts/generate-lab.ts` (full rewrite)
- **Agent mode**: `/implement`
- **Implementation**: new system prompt per plan §5. Role, allowlist (referencing `SANDPACK_DEPS` from config), output schema, context injection order (chapter → concept neighbors → similar labs as few-shot → professor terminology seeds), guardrails. Prompt-build fn takes `GenerationContext` from S5 and returns the full messages array.
- **Acceptance**:
  - [ ] Function signature is `buildGenerateLabPrompt(ctx: GenerationContext): ChatMessages`.
  - [ ] Snapshot test: with a frozen `GenerationContext` fixture, the prompt output is deterministic.

### S6-T7: Processor rewrite + dual-write

- **Depends on**: S6-T2, S6-T3, S6-T4, S6-T6, S5-T7
- **Files**: `worker/processors/generate-lab.ts` (heavy rewrite)
- **Agent mode**: `/implement`
- **Implementation**:
  1. Call `buildGenerationContext(labId)` from S5.
  2. Build prompt with S6-T6.
  3. Call model (Gemini 3 Pro default, Claude Opus fallback) via existing cost-tracked wrapper.
  4. `labContentV2Schema.parse(output)`. On fail → `error_code='SCHEMA_VALIDATION'`.
  5. For each Sandpack bundle: regex (S6-T2) → AST (S6-T3) → esbuild (S6-T4). First failure → one repair turn at temp 0.1, feed specific error. On second failure → persist specific `error_code`.
  6. On success: write `content_version=2`, `sandpack_files`, `tutor_context`, `generation_context_snapshot`. Derive v1 `content` from prose sections (dual-write) so legacy renderer keeps working.
  7. **Single update statement** for atomicity (see plan §7 riskiest-transitions note).
- **Acceptance**:
  - [ ] Processor <300 lines (v1 lesson anti-pattern #1).
  - [ ] End-to-end happy-path test with a mocked model returning a valid v2 fixture: both v1 and v2 columns populated.
  - [ ] Failure path test: invalid JSX → compile fails → repair retry invoked → still fails → job marked failed with `error_code='COMPILE'`.

### S6-T8: E2E on a real PDF

- **Depends on**: S6-T7
- **Files**: `tests/e2e/generate-lab-v2.spec.ts` (new) + fixtures `tests/fixtures/ml-kmeans-chapter.pdf`.
- **Agent mode**: `/verify`
- **Implementation**: upload fixture → run parse_materials → propose_plan → approve → generate_lab → assert `labs.content_version=2`, at least one interactive section, `sandpack_files['/App.tsx'].code` imports from allowlist, esbuild would compile (call the gate externally to double-check).
- **Acceptance**:
  - [ ] Test runs in CI with the real Gemini API or a recorded cassette.
  - [ ] Manually opening the lab in dev (frontend still v1 at this point, so renders derived Markdown) shows Bloom's-structured sections.
