# Sprint S3 Review — Worker Processors (`generate_lab` + `evaluate_review`)

**Status**: Complete
**Completed**: 2026-04-19
**Plan**: `.claude/plans/worker-processors-generate-lab-and-evaluate-review.md`
**Sprint**: `.claude/sprints/s3-worker-processors.md`

## Outcome

Closed the two open loops in the generation pipeline:

1. **Plan approval → lab content + review questions.** `generate_lab` jobs (enqueued by `approvePlan`) now produce Bloom's-ordered lab content, review questions grounded in that content, flip used concepts to `approved`, and race-safely flip the `generation_plans` status to `completed` when the last lab finishes.
2. **Review submission → concept evaluations.** `evaluate_review` jobs (enqueued on review completion) now grade every free-text response against its question's rubric and populate `concept_evaluations`, which the results UI (`getReviewResults`) reads.

Both processors were registered in `worker/index.ts`; the worker is now a complete implementation of every enqueued job type except `generate_embeddings` (out of scope).

## Commits

| Hash | Task | Summary |
|---|---|---|
| `6aedaec` | S3-T1 | types: payload + output schemas for generate_lab & evaluate_review |
| `20720e5` | S3-T2 | worker: generate_lab prompt builders |
| `4724107` | S3-T4 | worker: evaluate_review prompt builder |
| `7380920` | S3-T3 | worker: generate_lab processor (+ `evaluate_review` added to JobType union) |
| `6634ec6` | S3-T5 | worker: evaluate_review processor |
| `38c649e` | S3-T6 | worker: register both processors in index.ts |
| (this)   | S3-T7 | lint fix (`let` → `const`) + sprint review |

## Verification Results

- Root `tsc --noEmit`: **clean**
- Worker `tsc --noEmit -p worker/tsconfig.json`: **clean**
- `npm run lint`: **0 errors** (7 pre-existing warnings in unrelated files, outside sprint scope)
- `registerProcessor('generate_lab', ...)` / `registerProcessor('evaluate_review', ...)` calls grep-verified.
- `worker/index.ts` imports both new processors; `generate-embeddings` remains commented as planned.

Manual end-to-end paths (local Supabase + worker + happy-path/evaluation-path/failure-path) are **not exercised here** — they require a running stack with seeded parsed content. The code paths are wired per plan; a follow-up manual QA pass should walk through approve-plan and submit-review flows before the pilot.

## Design Decisions That Held Up

- **Race-safe plan completion**: conditional `UPDATE ... WHERE status='generating'` guard means two jobs finishing at the same instant don't double-flip the plan; the loser silently no-ops.
- **Retry idempotency for evaluations**: delete-before-insert on the response-id set makes `evaluate_review` safe to retry after a mid-run crash.
- **Strict AI output validation**: `evaluate_review` rejects the batch if Claude changes any `review_response_id` or remaps a `concept_id`. Prevents silent corruption of the concept knowledge graph.
- **Zero-concepts / zero-responses early returns**: both processors handle the empty edge case without making a Claude call or writing garbage rows.
- **0.6 mastery threshold anchored to the rubric**: keeps the evaluator and `getReviewResults` bucket boundary in sync (`src/lib/actions/reviews.ts:398`).

## Lessons / Gotchas

- `z.record(enumSchema, T)` infers a full (non-partial) record. Had to use `Partial<BloomsStructure>` + cast in `buildBloomsStructure`.
- `JobType` in `worker/lib/job-runner.ts` is the source of truth — adding a new job type requires updating that union, not just calling `registerProcessor`.
- Supabase joins via `!inner` return typed objects but the TS inference for nested joins is weak; explicit row-shape types + `as unknown as RowType` casts remain the cleanest pattern.

## Out of Scope (Future Sprints)

- `generate_embeddings` processor (RAG/chatbot prep).
- Adaptive review-question selection — currently all generated questions are `is_active=true`; selection logic is deferred.
- Streaming progress via `response.content` chunks — current progress is coarse (10/55/80/95/100 for lab, 15/30/80/100 for eval).

## Unblocked

Nothing downstream in this sprint. Natural next steps:

- Manual end-to-end QA on the Miami pilot data before launch.
- `generate_embeddings` processor sprint.
- Rate-limit alerting wiring (currently `alert`-only rows in `api_usage_log` — no actual notification channel).
