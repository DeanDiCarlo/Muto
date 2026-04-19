# Plan — Railway Worker Processors: `generate_lab` + `evaluate_review`

## Summary

Close the two processing gaps that currently break the professor → approve plan → labs appear → students take review → results surface loop.

Today the app already **enqueues** both job types but the worker has **no processor registered** for them:

- `src/lib/actions/generation.ts:282` enqueues `generate_lab` on plan approval → jobs pile up as `pending` forever.
- `src/lib/actions/reviews.ts:300` enqueues `evaluate_review` on review completion → `concept_evaluations` is never populated, and `getReviewResults` returns an empty array.

This plan adds both processors, their prompt builders, their Zod payload schemas, and registration wiring.

**Professor-facing** (generate_lab): populates `labs.content`, `labs.blooms_structure`, inserts `review_questions`, transitions `labs.generation_status`, and flips `generation_plans.status` to `completed` when all labs in the plan are done.

**Student-facing** (evaluate_review): populates `concept_evaluations` so `getReviewResults` (reviews.ts:325) returns actual mastery data.

**No schema migration needed.** Both enum values already exist:
- `generate_lab` — migration `001_initial_schema.sql:39-46`
- `evaluate_review` — migration `003_add_evaluate_review_job_type.sql`

## Size Check

Two processors + two prompt builders + schema additions + registration = ~4 implementation subtasks of meaningful size. **Recommend running this as `/sprint worker-processors` rather than a single `/implement`**, because the two processors are independent and can be verified separately. But the plan below is self-contained enough that `/implement` will also work if the implementing agent handles them sequentially.

## Context Loading (implementing agent reads ONLY these)

### Files to read in full
- `CLAUDE.md` — project conventions
- `worker/index.ts` — registration pattern (12 imports, one line to uncomment / add)
- `worker/lib/job-runner.ts` — processor contract, `registerProcessor`, `updateProgress`, `GenerationJob` type
- `worker/lib/cost-tracker.ts` — `trackUsage` signature
- `worker/lib/supabase.ts` — service-role client used by processors
- `worker/processors/propose-plan.ts` — reference implementation, copy its patterns (JSON extraction, cost calc, progress updates, trackUsage call)
- `worker/lib/prompts/propose-plan.ts` — reference for prompt-builder module layout
- `src/types/generation.ts` — extend with new Zod schemas
- `src/lib/actions/reviews.ts` **lines 250–411** — shows what payload `evaluate_review` receives and what `getReviewResults` expects to read back out
- `src/lib/actions/generation.ts` **lines 240–320** — shows what payload `generate_lab` receives and what state (`labs`, `concepts`, `generation_plans`) already exists when the job runs

### SCHEMA.md sections (grep-then-read, do not read the file end-to-end)

Run: `grep -n "^### \`" SCHEMA.md` to get line numbers, then read ONLY:
- `labs` — what columns to write (`content`, `blooms_structure`, `generation_status`, `generated_at`)
- `concepts` — status transitions (`proposed` → `approved` after generation names questions against them)
- `review_questions` — columns to insert (`lab_id`, `concept_id`, `question_text`, `blooms_level`, `source='generated'`, `evaluation_rubric`, `is_active=true`, `position`)
- `review_sessions` — what session lookup returns
- `review_responses` — what response rows look like
- `concept_evaluations` — exact columns to insert (`review_response_id`, `concept_id`, `enrollment_id`, `blooms_level`, `mastery_score`, `confidence`, `reasoning`, `evaluated_at`)
- `generation_jobs` — payload shapes (already on-screen in generation.ts when enqueued)
- `generation_plans` — `status` transitions (`generating` → `completed`)
- `api_usage_log` — via `cost-tracker.ts` usage, no direct writes
- `content_blocks` — columns used to build the generation prompt

**Do not read** diagnostic/learning_profile/insight/institution/enrollment_flow sections. Not in scope.

---

## Scope

### In scope
1. Add Zod schema `evaluateReviewPayloadSchema` to `src/types/generation.ts`.
2. Add Zod schema for `review_question` generation output (AI-produced question list for a lab).
3. Add Zod schema for `concept_evaluation` output (AI-produced eval per response).
4. New prompt builder module: `worker/lib/prompts/generate-lab.ts`.
5. New prompt builder module: `worker/lib/prompts/evaluate-review.ts`.
6. New processor: `worker/processors/generate-lab.ts`.
7. New processor: `worker/processors/evaluate-review.ts`.
8. Register both in `worker/index.ts`.
9. Flip `generation_plans.status` to `'completed'` when every `generate_lab` job for that plan's labs is done (coordination logic lives in the `generate-lab` processor — check on completion, not elsewhere).

### Out of scope
- `generate_embeddings` processor (chatbot RAG — separate plan).
- Adaptive question selection for `review_sessions` (currently the system writes questions once; a future sprint handles selection).
- Retry/backoff logic for failed jobs (job-runner already handles failure state).
- Realtime UI wiring — already in place from S2-T10.
- Rate-limit pre-check — these are worker jobs classified as `alert`-only per CLAUDE.md; skip the pre-check, just log via `trackUsage`.

---

## Data Flow

### `generate_lab`
```
generation_jobs (type=generate_lab, input_payload={lab_id, source_material_ids, concept_ids})
  ↓
processor reads: labs (for title + blooms_structure hint from plan), concepts (for names), content_blocks (for context, filtered to source_material_ids)
  ↓
Claude call #1: generate lab content (LabContent shape: sections ordered by Bloom's progression)
  ↓
Claude call #2: generate review_questions (3-8 per lab, each tagged with concept_id + blooms_level + evaluation_rubric)
  ↓
writes: labs.content, labs.blooms_structure, labs.generation_status='complete', labs.generated_at; review_questions rows; concepts.status='approved'
  ↓
checks: if every lab in generation_plans.plan_data has generation_status='complete', sets generation_plans.status='completed'
  ↓
trackUsage for both Claude calls (usage_type='lab_generation', generation_job_id=job.id, lab_id=payload.lab_id)
```

### `evaluate_review`
```
generation_jobs (type=evaluate_review, input_payload={session_id})
  ↓
processor reads: review_sessions (enrollment_id, lab_id), review_responses (answer_text + review_question_id), review_questions (question_text, concept_id, blooms_level, evaluation_rubric), concepts (name)
  ↓
For each response, Claude evaluates answer against the question's evaluation_rubric at the question's Bloom level for the question's concept
  ↓
inserts: concept_evaluations rows (one per response: mastery_score 0.00-1.00, confidence 0.00-1.00, reasoning, evaluated_at=now())
  ↓
trackUsage (usage_type='review_evaluation', generation_job_id=job.id)
```

---

## File-by-File Implementation

### 1. `src/types/generation.ts` — **small**

Append after `generateLabPayloadSchema`:

```ts
// evaluate_review job input
export const evaluateReviewPayloadSchema = z.object({
  session_id: z.string().uuid(),
})
export type EvaluateReviewPayload = z.infer<typeof evaluateReviewPayloadSchema>

// review_question shape produced by the generate_lab AI call
export const generatedReviewQuestionSchema = z.object({
  concept_index: z.number().int().nonnegative(), // index into concept_ids array — AI picks which concept this tests
  question_text: z.string().min(1),
  blooms_level: bloomsLevelSchema,
  evaluation_rubric: z.string().min(1),
})
export type GeneratedReviewQuestion = z.infer<typeof generatedReviewQuestionSchema>

export const generatedReviewQuestionsSchema = z.object({
  questions: z.array(generatedReviewQuestionSchema).min(1).max(12),
})
export type GeneratedReviewQuestions = z.infer<typeof generatedReviewQuestionsSchema>

// concept_evaluation shape produced by the evaluate_review AI call (one per response)
export const aiConceptEvaluationSchema = z.object({
  review_response_id: z.string().uuid(),
  concept_id: z.string().uuid(),
  blooms_level: bloomsLevelSchema,
  mastery_score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
})
export type AiConceptEvaluation = z.infer<typeof aiConceptEvaluationSchema>

export const aiConceptEvaluationsSchema = z.object({
  evaluations: z.array(aiConceptEvaluationSchema).min(1),
})
```

**Agent reads**: nothing extra.

---

### 2. `worker/lib/prompts/generate-lab.ts` — **medium** (new file)

Exports two builders, mirroring `worker/lib/prompts/propose-plan.ts` style:

- `buildLabContentSystemPrompt()` — instructs Claude to produce `LabContent` JSON (`{title, sections: [{blooms_level, heading, body}, ...]}`) ordered `remember → understand → apply → analyze → evaluate → create`. Return ONLY JSON, no fences.
- `buildLabContentUserMessage(labTitle, conceptNames, contentBlocks)` — prepends concept list + lab title, then dumps filtered `content_blocks` text (same format as propose-plan builder).
- `buildReviewQuestionsSystemPrompt()` — instructs Claude to produce `{questions: [...]}` with 3–8 entries. Each question must reference `concept_index` (0..concepts.length-1), a `blooms_level` from the six enum values, and a short `evaluation_rubric` (guidance for the evaluator, not shown to student — format per SCHEMA.md review_questions notes).
- `buildReviewQuestionsUserMessage(labTitle, labContent, conceptNames)` — gives the model the final lab content and concept names so questions are grounded in what students will have actually read.

Token budget guardrail: reuse the 150k-char / 50k-per-material truncation pattern from `propose-plan.ts`.

**Agent reads**: `worker/lib/prompts/propose-plan.ts`.

---

### 3. `worker/processors/generate-lab.ts` — **large** (new file)

Pattern follows `worker/processors/propose-plan.ts` exactly.

```ts
async function generateLab(job: GenerationJob): Promise<Record<string, unknown> | null> {
  // 1. Parse payload with generateLabPayloadSchema
  // 2. Fetch lab (id, title, module_id → modules.course_id), concepts (in concept_ids), content_blocks (in source_material_ids)
  // 3. Mark labs.generation_status = 'generating'  → updateProgress(10, 'Generating lab content')
  // 4. Claude call #1: system = buildLabContentSystemPrompt, user = buildLabContentUserMessage(...)
  //    → parse with labContentSchema, build blooms_structure from section order
  //    → updateProgress(55, 'Generating review questions')
  // 5. Claude call #2: system = buildReviewQuestionsSystemPrompt, user = buildReviewQuestionsUserMessage(labTitle, labContent, conceptNames)
  //    → parse with generatedReviewQuestionsSchema
  // 6. Write labs.content + labs.blooms_structure + labs.generation_status='complete' + labs.generated_at=now()
  //    → updateProgress(80, 'Saving review questions')
  // 7. Insert review_questions rows. Map concept_index → concept_ids[concept_index]. source='generated', is_active=true, position=i.
  //    → Skip/clip any row where concept_index is out of range (log warning, don't throw).
  // 8. Mark all concepts used by at least one question as status='approved'.
  // 9. Coordination: fetch the generation_plan for this course whose plan_data contains this lab (match by lab title + module). Simpler path: find any generation_plan with status='generating' where course_id = derived course. Then query all labs whose module belongs to a module in that plan — if every such lab has generation_status='complete', set generation_plans.status='completed'.
  //    → updateProgress(95, 'Finalizing plan state')
  // 10. trackUsage for each Claude call (usage_type='lab_generation', model='claude-sonnet-4-20250514', generation_job_id=job.id, lab_id=payload.lab_id)
  // 11. updateProgress(100, 'Lab generation complete')
  // 12. Return { lab_id, sections_count, questions_count, concepts_approved, plan_completed: boolean }
}

registerProcessor('generate_lab', generateLab)
```

**Error handling**:
- If payload parse fails → throw (job-runner marks failed).
- If lab_id doesn't exist → throw with clear message.
- If any Claude JSON parse fails → throw; job-runner marks failed, lab stays in `generating` state. **Before throwing, set `labs.generation_status = 'failed'`** so the UI can show the error.

**Cost calc**: reuse `calculateCostCents(inputTokens, outputTokens)` from propose-plan.ts (same $3/$15 per 1M). Either copy the function into this file or extract to `worker/lib/cost.ts` — copying is fine, this is 3 lines.

**Agent reads**: `worker/processors/propose-plan.ts` (already loaded).

---

### 4. `worker/lib/prompts/evaluate-review.ts` — **small** (new file)

One builder pair:

- `buildEvaluateReviewSystemPrompt()` — instructs Claude to produce `{evaluations: [...]}` with **exactly one entry per response**. Each must include `mastery_score` (0–1, based on rubric), `confidence` (0–1, based on answer clarity / AI certainty), `reasoning` (**student-facing qualitative feedback — this is shown to the student**, per SCHEMA.md line 330), and echo the `review_response_id`, `concept_id`, `blooms_level` passed in.
- `buildEvaluateReviewUserMessage(responses)` — emits a structured list: for each response, include `review_response_id`, `concept_id`, `concept_name`, `blooms_level`, `evaluation_rubric`, `question_text`, `answer_text`.

Guardrail the rubric: tell the model "use the rubric as ground truth; a student who matches the rubric's expectations at this Bloom level scores ≥ 0.6 (on_track bucket)". This keeps the `getReviewResults` bucket boundary at reviews.ts:398 meaningful.

---

### 5. `worker/processors/evaluate-review.ts` — **medium** (new file)

```ts
async function evaluateReview(job: GenerationJob): Promise<Record<string, unknown> | null> {
  // 1. Parse input_payload with evaluateReviewPayloadSchema
  // 2. Fetch review_session (id, lab_id, enrollment_id, labs!inner.module_id, modules!inner.course_id)
  //    Also fetch the course → institution_id/created_by for trackUsage.
  // 3. updateProgress(15, 'Loading responses')
  // 4. Fetch review_responses WHERE review_session_id = session_id. For each, join review_questions (question_text, concept_id, blooms_level, evaluation_rubric) and concepts (name).
  //    If zero responses → updateProgress(100), return {evaluations_created: 0, reason: 'empty_session'}.
  // 5. updateProgress(30, 'Evaluating answers')
  // 6. Claude call. Parse with aiConceptEvaluationsSchema. Ensure evaluations.length === responses.length; if mismatch, throw.
  //    Sanity: every returned review_response_id must match one of the input responses. Every concept_id must match the input question's concept_id. Reject mismatches.
  // 7. updateProgress(80, 'Saving evaluations')
  // 8. Insert concept_evaluations rows (enrollment_id = session.enrollment_id, evaluated_at = now()).
  //    Use a single insert() with array — atomic if possible.
  // 9. trackUsage (usage_type='review_evaluation', generation_job_id=job.id)
  // 10. updateProgress(100, 'Evaluation complete')
  // 11. Return { session_id, evaluations_created }
}

registerProcessor('evaluate_review', evaluateReview)
```

**Idempotency**: if the worker crashes after insert but before `markCompleted`, a retry would double-insert. Mitigation for v1: **before insert, delete existing `concept_evaluations` where `review_response_id IN (...)`**. This is safe because a session only evaluates once per completion — re-evaluation is fine to overwrite. Document this in a single-line comment on the delete.

---

### 6. `worker/index.ts` — **small** edit

Uncomment and add:

```ts
import './processors/parse-materials.js'
import './processors/propose-plan.js'
import './processors/generate-lab.js'           // new
import './processors/evaluate-review.js'        // new
// import './processors/generate-embeddings.js' // still out of scope
```

---

## Edge Cases

- **Empty content_blocks for a lab's source materials** → `generate_lab` throws "no parsed content — run parse_materials first". Surface in `error_message`.
- **Lab has zero concept_ids** (professor deleted all concepts before approval) → `generate_lab` still generates content but skips question generation, marks lab complete with 0 questions.
- **Review session with zero responses** → `evaluate_review` marks complete, writes 0 evaluations, returns early. `getReviewResults` already handles the empty array.
- **AI returns evaluation for a response not in the session** → reject whole response, throw. Don't insert partial data.
- **AI returns wrong concept_id** (picks a concept from a different lab) → reject, throw. Don't silently remap.
- **Plan completion race**: two `generate_lab` jobs finish at nearly the same time. Both check "is every lab complete?" and both try to flip the plan. The `UPDATE generation_plans SET status='completed' WHERE id=? AND status='generating'` guard makes this a safe no-op for the loser.
- **Professor's generation_plans row cannot be found** (shouldn't happen, but defensive) → log warning, don't throw; lab generation still succeeds.

---

## Verification

Once implemented, the implementing agent must run:

```bash
# Typecheck
npx tsc --noEmit

# Worker typecheck (if separate tsconfig)
cd worker && npx tsc --noEmit

# Lint
npm run lint
```

### Manual verification script (happy path)

1. Seed a course with 1 material that has `content_blocks` populated.
2. Trigger `propose_plan` → wait for plan.
3. Approve plan via `approvePlan` action → observe `generate_lab` jobs enter `pending`.
4. Start worker: `cd worker && npm run dev`.
5. Confirm each lab job reaches `status='completed'`, `labs.generation_status='complete'`, `review_questions` rows exist, `concepts.status='approved'`.
6. Confirm `generation_plans.status='completed'` after last lab.
7. Enroll test student, take a review, submit → `evaluate_review` job enters `pending`.
8. Confirm job completes, `concept_evaluations` has one row per response.
9. Call `getReviewResults` → results UI shows mastery buckets.

### Failure verification

1. Insert a `generate_lab` job for a non-existent lab → job should end `failed` with a clear `error_message`.
2. Insert an `evaluate_review` job for a session with zero responses → job should end `completed` with `evaluations_created: 0`.

---

## Acceptance Criteria

- [ ] `worker/index.ts` imports both new processors.
- [ ] `generate_lab` job claimed → writes `labs.content` + `labs.blooms_structure` + `labs.generation_status='complete'` + `labs.generated_at`.
- [ ] `generate_lab` job → inserts ≥1 `review_questions` rows with valid concept_id + blooms_level + evaluation_rubric.
- [ ] `generate_lab` job → used concepts flip to `status='approved'`.
- [ ] When all labs in a `generation_plan` are complete, `generation_plans.status='completed'`.
- [ ] `evaluate_review` job → inserts one `concept_evaluations` row per `review_responses` in the session.
- [ ] `getReviewResults` returns a non-empty evaluations array after running the full loop.
- [ ] Both processors write to `api_usage_log` via `trackUsage`.
- [ ] `progress_percent` monotonically increases and reaches 100 on success.
- [ ] `npx tsc --noEmit` clean. `npm run lint` clean.
- [ ] No migrations added (enums already exist).

---

## Suggested Commit Layout (one branch, conventional commits)

1. `feat(types): add payload + output schemas for generate_lab & evaluate_review`
2. `feat(worker): add generate_lab processor + prompts`
3. `feat(worker): add evaluate_review processor + prompts`
4. `chore(worker): register generate_lab and evaluate_review processors`
