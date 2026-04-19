# Sprint: Worker Processors — `generate_lab` + `evaluate_review`

**Goal**: Wire up the two Railway worker processors whose jobs are already being enqueued but never handled, closing the loop from plan approval → lab content + review questions, and from review submission → concept evaluations.

**Estimated sessions**: 4–6 (several tasks parallelizable)

**Prerequisites**:
- Plan at `.claude/plans/worker-processors-generate-lab-and-evaluate-review.md` (source of truth for scope, prompts, edge cases).
- Migrations `001` (base schema + `generate_lab` enum) and `003` (adds `evaluate_review` enum) already applied — **no migration work in this sprint**.
- Worker poll loop at `worker/index.ts` and `worker/lib/job-runner.ts` already live.
- Reference processor `worker/processors/propose-plan.ts` exists and is the pattern to mirror.

## Dependency Graph

```
S-T1 (types)
  ├── S-T2 (generate-lab prompts) ──┐
  │                                  ├── S-T3 (generate-lab processor) ──┐
  ├── S-T4 (evaluate-review prompts) ─┐                                   │
  │                                   ├── S-T5 (evaluate-review processor) ┤
  │                                                                        │
  └────────────────────────────────────────── S-T6 (register in index.ts) ─┤
                                                                           │
                                                   S-T7 (integration check)
```

## Parallelization Hints

- **T2 ∥ T4**: Prompt builders are independent — can be done in one session by the same agent, or split across two.
- **T3 ∥ T5**: Once T1/T2/T4 are done, the two processors are independent. Best run in separate sessions to keep context clean.
- **T6** must be last before T7 (single-line edit, trivial).

---

## Tasks

### S-T1: Payload + output Zod schemas
- **Depends on**: none
- **Files**: `src/types/generation.ts` (modify)
- **Schema tables**: none directly (domain types only)
- **Agent mode**: `/implement S-T1`
- **Context to load**:
  - `.claude/plans/worker-processors-generate-lab-and-evaluate-review.md` (section "1. src/types/generation.ts")
  - `src/types/generation.ts` (full — 114 lines)
- **Token budget**: small
- **What to add**: `evaluateReviewPayloadSchema`, `generatedReviewQuestionSchema`, `generatedReviewQuestionsSchema`, `aiConceptEvaluationSchema`, `aiConceptEvaluationsSchema` (shapes specified in the plan file).
- **Verification**:
  ```bash
  npx tsc --noEmit && node -e "require('./src/types/generation.ts')" 2>/dev/null || npx tsc --noEmit
  ```
  (TypeScript-only check — no runtime import needed since it's compiled with the rest of the app.)
- **Acceptance criteria**:
  - [ ] All five new schemas exported with inferred types
  - [ ] `npx tsc --noEmit` clean at repo root
  - [ ] No change to existing exports

---

### S-T2: `generate_lab` prompt builders
- **Depends on**: S-T1
- **Files**: `worker/lib/prompts/generate-lab.ts` (new)
- **Schema tables**: `labs`, `concepts`, `content_blocks`, `review_questions` (referenced in prompts, not written)
- **Agent mode**: `/implement S-T2`
- **Context to load**:
  - `.claude/plans/worker-processors-generate-lab-and-evaluate-review.md` (section "2. worker/lib/prompts/generate-lab.ts")
  - `worker/lib/prompts/propose-plan.ts` (full — 135 lines, reference style)
  - SCHEMA.md `labs` (lines 158–177) and `review_questions` (lines 256–276) — use `grep -n "### \`labs\`" SCHEMA.md` then read the range
- **Token budget**: medium
- **Exports required**:
  - `buildLabContentSystemPrompt()`
  - `buildLabContentUserMessage(labTitle, conceptNames, contentBlocks)`
  - `buildReviewQuestionsSystemPrompt()`
  - `buildReviewQuestionsUserMessage(labTitle, labContent, conceptNames)`
- **Verification**:
  ```bash
  npx tsc --noEmit -p worker/tsconfig.json
  ```
- **Acceptance criteria**:
  - [ ] System prompt for lab content specifies `LabContent` JSON shape with Bloom's-ordered sections
  - [ ] System prompt for review questions specifies `{questions: [...]}` with `concept_index` (not UUID) to keep the AI honest
  - [ ] Both builders instruct Claude to return ONLY JSON, no fences
  - [ ] Truncation guardrail mirrors `propose-plan.ts` (150k / 50k-per-material)
  - [ ] Worker typecheck clean

---

### S-T3: `generate_lab` processor
- **Depends on**: S-T1, S-T2
- **Files**: `worker/processors/generate-lab.ts` (new)
- **Schema tables**: `labs`, `concepts`, `content_blocks`, `review_questions`, `generation_jobs`, `generation_plans`, `modules`, `courses`, `api_usage_log` (via cost-tracker)
- **Agent mode**: `/implement S-T3`
- **Context to load**:
  - `.claude/plans/worker-processors-generate-lab-and-evaluate-review.md` (section "3. worker/processors/generate-lab.ts" + Edge Cases)
  - `worker/processors/propose-plan.ts` (full — 223 lines, exact pattern)
  - `worker/lib/job-runner.ts` (full — 176 lines)
  - `worker/lib/cost-tracker.ts` (full — 37 lines)
  - `worker/lib/supabase.ts`
  - SCHEMA.md `labs`, `concepts`, `review_questions`, `generation_plans` — grep then read only those ranges
- **Token budget**: large
- **Verification**:
  ```bash
  # Typecheck
  npx tsc --noEmit -p worker/tsconfig.json && \
  # Confirm registration call present
  grep -q "registerProcessor('generate_lab'" worker/processors/generate-lab.ts && echo PASS || echo FAIL
  ```
- **Acceptance criteria**:
  - [ ] Writes `labs.content`, `labs.blooms_structure`, `labs.generation_status`, `labs.generated_at`
  - [ ] Inserts ≥1 `review_questions` row per generated question with `source='generated'` and mapped `concept_id`
  - [ ] Flips used concepts to `status='approved'`
  - [ ] On last lab in plan complete, flips `generation_plans.status='completed'` using a race-safe `WHERE status='generating'` guard
  - [ ] On failure, marks `labs.generation_status='failed'` before rethrowing
  - [ ] Two `trackUsage` calls (one per Claude call) with `usage_type='lab_generation'`
  - [ ] Progress updates at 10/55/80/95/100

---

### S-T4: `evaluate_review` prompt builder
- **Depends on**: S-T1
- **Files**: `worker/lib/prompts/evaluate-review.ts` (new)
- **Schema tables**: `review_questions`, `review_responses`, `concepts`, `concept_evaluations` (referenced in prompts)
- **Agent mode**: `/implement S-T4`
- **Context to load**:
  - `.claude/plans/worker-processors-generate-lab-and-evaluate-review.md` (section "4. worker/lib/prompts/evaluate-review.ts")
  - `worker/lib/prompts/propose-plan.ts` (reference style — may already be loaded from T2)
  - SCHEMA.md `concept_evaluations` (lines 311–332)
- **Token budget**: small
- **Exports required**:
  - `buildEvaluateReviewSystemPrompt()`
  - `buildEvaluateReviewUserMessage(responses)` — `responses` is an array of `{review_response_id, concept_id, concept_name, blooms_level, evaluation_rubric, question_text, answer_text}`
- **Verification**:
  ```bash
  npx tsc --noEmit -p worker/tsconfig.json
  ```
- **Acceptance criteria**:
  - [ ] System prompt anchors the 0.6 mastery threshold to the rubric (aligns with `getReviewResults` bucket boundary in `src/lib/actions/reviews.ts:398`)
  - [ ] System prompt specifies `reasoning` is student-facing qualitative feedback
  - [ ] User message carries one block per response with all seven fields
  - [ ] Output schema `{evaluations: [...]}` with one entry per response

---

### S-T5: `evaluate_review` processor
- **Depends on**: S-T1, S-T4
- **Files**: `worker/processors/evaluate-review.ts` (new)
- **Schema tables**: `review_sessions`, `review_responses`, `review_questions`, `concepts`, `concept_evaluations`, `labs`, `modules`, `courses`, `api_usage_log`
- **Agent mode**: `/implement S-T5`
- **Context to load**:
  - `.claude/plans/worker-processors-generate-lab-and-evaluate-review.md` (section "5. worker/processors/evaluate-review.ts" + Edge Cases)
  - `worker/processors/propose-plan.ts` (pattern reference)
  - `worker/lib/job-runner.ts`, `worker/lib/cost-tracker.ts`
  - `src/lib/actions/reviews.ts` **lines 250–411** (confirms payload + what `getReviewResults` reads)
  - SCHEMA.md `review_sessions`, `review_responses`, `review_questions`, `concept_evaluations` — grep then read only those ranges
- **Token budget**: medium
- **Verification**:
  ```bash
  npx tsc --noEmit -p worker/tsconfig.json && \
  grep -q "registerProcessor('evaluate_review'" worker/processors/evaluate-review.ts && echo PASS || echo FAIL
  ```
- **Acceptance criteria**:
  - [ ] Zero-response sessions exit cleanly with `evaluations_created: 0`, no Claude call
  - [ ] AI output rejected if `evaluations.length !== responses.length` or if any `review_response_id` / `concept_id` doesn't match input
  - [ ] Idempotency: deletes pre-existing `concept_evaluations` for these `review_response_id`s before insert
  - [ ] Inserts one row per response with `enrollment_id` + `evaluated_at`
  - [ ] `trackUsage` called with `usage_type='review_evaluation'`
  - [ ] Progress updates at 15/30/80/100

---

### S-T6: Register processors in worker entry
- **Depends on**: S-T3, S-T5
- **Files**: `worker/index.ts` (modify)
- **Schema tables**: none
- **Agent mode**: `/implement S-T6` (trivial — could also be folded into T3/T5)
- **Context to load**: `worker/index.ts` (full — 42 lines)
- **Token budget**: small
- **Verification**:
  ```bash
  grep -q "import './processors/generate-lab.js'" worker/index.ts && \
  grep -q "import './processors/evaluate-review.js'" worker/index.ts && \
  npx tsc --noEmit -p worker/tsconfig.json && echo PASS || echo FAIL
  ```
- **Acceptance criteria**:
  - [ ] Both new processors imported (uncommented / added)
  - [ ] `generate-embeddings` import still commented (out of scope)
  - [ ] Worker builds cleanly

---

### S-T7: End-to-end integration check
- **Depends on**: S-T6
- **Files**: none (verification only; optionally `tests/worker-processors.md` for a checklist log)
- **Schema tables**: all from T3 + T5
- **Agent mode**: `/verify S-T7`
- **Context to load**:
  - `.claude/plans/worker-processors-generate-lab-and-evaluate-review.md` (section "Verification")
  - `src/lib/actions/generation.ts` lines 240–320 (approvePlan enqueues `generate_lab`)
  - `src/lib/actions/reviews.ts` lines 250–411 (review completion enqueues `evaluate_review`, `getReviewResults` reads output)
- **Token budget**: medium
- **Verification**:
  ```bash
  # 1. Typecheck everything
  npx tsc --noEmit && npx tsc --noEmit -p worker/tsconfig.json
  # 2. Lint
  npm run lint
  # 3. Happy path (requires local Supabase running + seed data with parsed content_blocks)
  #    Start worker: cd worker && npm run dev
  #    From app: approve a plan → observe generation_jobs rows reach status='completed'
  #    Confirm via psql or Supabase dashboard:
  #      SELECT generation_status, jsonb_array_length(content->'sections') FROM labs WHERE id = '<lab>';
  #      SELECT count(*) FROM review_questions WHERE lab_id = '<lab>';
  #      SELECT status FROM generation_plans WHERE id = '<plan>';
  # 4. Evaluation path:
  #    Take a review as a student, submit → observe evaluate_review job complete
  #    SELECT count(*) FROM concept_evaluations WHERE enrollment_id = '<enr>';
  #    Hit /student/labs/<id>/review/results — confirm mastery buckets render
  ```
- **Acceptance criteria**:
  - [ ] Root + worker `tsc --noEmit` both clean
  - [ ] `npm run lint` clean
  - [ ] Happy path: approved plan → all `generate_lab` jobs complete → `generation_plans.status='completed'` → results UI shows generated content
  - [ ] Evaluation path: submitted review → `concept_evaluations` populated → `getReviewResults` returns non-empty array → student results UI renders mastery buckets
  - [ ] Failure path spot-check: insert a `generate_lab` job with a bogus `lab_id` → job ends `failed` with a human-readable `error_message`, lab row unaffected
  - [ ] `api_usage_log` has new rows for both `lab_generation` and `review_evaluation` usage types

---

## Notes

- **Do not add `generate_embeddings` or RAG work in this sprint** — separate plan.
- **Do not wire adaptive question selection** — questions are simply written once; selection is a future sprint.
- **Rate limiting**: generation jobs are `alert`-only per `CLAUDE.md`; skip pre-checks in processors. `trackUsage` is the only cost touchpoint.
- **Commit style**: one commit per task using conventional commits (`feat(worker):`, `feat(types):`, `chore(worker):`). Push at end of sprint per user memory.

## Open Questions Carried From Plan

- None. The plan resolved the coordination race (race-safe UPDATE guard), idempotency (delete-before-insert on re-evaluation), and empty-session handling (early return).
