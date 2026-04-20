# Sprint S5: Retrieval module — the moat

**Goal**: `worker/lib/retrieval/` exists with four retrievers + a composer + unit tests. `lab_embeddings` backfilled for all completed labs. Module is imported by nothing yet — S6 wires it in. Net-new plumbing so the generator can pull (a) professor's chapter materials, (b) concept-taxonomy neighbors, (c) 3–5 similar successful labs, (d) student's cognitive model.

**Estimated sessions**: 2–3.

**Parent plan**: `.claude/plans/get-200-in-optimized-swing.md` §3 + v1 lessons.

**Prerequisites**:
- S4' complete: migration 006 applied, `lab_embeddings` + `cognitive_model_snapshots` tables exist, `packages/shared/src/config.ts` is the source for `EMBEDDING_DIM`, `EMBEDDING_MODEL`, `RAG_K_DEFAULT`.

**Out of scope**:
- Wiring the composer into `generate-lab.ts`. (S6.)
- Prompt template changes. (S6.)
- The tutor's server action that reads cognitive model at chat time. (S7.)

---

## Task dependency graph

```
S5-T1 (truncate helper extracted) ──┐
                                    │
S5-T2 (embed-batch adaptive backoff) ─┐
                                      │
S5-T3 (chapter-materials retriever) ──┤
S5-T4 (concept-neighbors retriever) ──┤
S5-T5 (similar-labs retriever) ───────┼─> S5-T7 (buildGenerationContext composer) ─> S5-T8 (backfill lab_embeddings)
S5-T6 (cognitive-model retriever) ────┘
```

T3–T6 can run in parallel.

---

## Tasks

### S5-T1: Extract truncation helper

- **Depends on**: none
- **Files**:
  - `worker/lib/prompts/generate-lab.ts` (extract inline truncation logic)
  - `worker/lib/retrieval/truncate.ts` (new)
  - `worker/lib/retrieval/index.ts` (new — re-export)
- **Agent mode**: `/implement`
- **Implementation**: move the `MAX_TOTAL_CHARS` / `MAX_PER_MATERIAL_CHARS` truncation helper into a standalone function `truncateChapterCorpus(blocks, {maxChars, maxPerMaterial})`. Keep the existing behavior byte-for-byte.
- **Acceptance**: `generate-lab.ts` still works (no behavioral change); unit test in `worker/tests/retrieval/truncate.test.ts` covers under-limit, exactly-at-limit, over-limit.

### S5-T2: `embed-batch` module with adaptive backoff (ported from v1)

- **Depends on**: S4p-T3 (config.ts)
- **Files**: `worker/lib/retrieval/embed-batch.ts` (new), `worker/tests/retrieval/embed-batch.test.ts` (new)
- **Agent mode**: `/implement`
- **Implementation**: port `~/kinetic-labs/src/app/api/inngest/route.ts:290-369` pattern: batch of N strings, exponential backoff 50ms → 2000ms on rate-limit errors, abort if >20% of chunks fail. Uses `EMBEDDING_MODEL` + `EMBEDDING_DIM` from `@muto/shared/config`. Accepts a client factory (testable).
- **Acceptance**: unit test with a mocked embedding client — 3 rate limits in a row triggers backoff; >20% hard failures throws `EmbeddingBatchFailedError`.

### S5-T3: `retrieveChapterMaterials`

- **Depends on**: S5-T1
- **Files**: `worker/lib/retrieval/chapter-materials.ts` (new), `worker/tests/retrieval/chapter-materials.test.ts` (new)
- **Agent mode**: `/implement`
- **Implementation**: given `labId`, join `source_materials` → `content_blocks` ordered by position. Apply `truncateChapterCorpus`. Return `{ materials: [{id,title,blocks:[...]}], totalChars, truncated: boolean }`.
- **Acceptance**: mocked Supabase client; returns correct shape; respects `maxChars` and `k` from config.

### S5-T4: `retrieveConceptNeighbors`

- **Depends on**: S4p-T2
- **Files**: `worker/lib/retrieval/concept-neighbors.ts` (new), `worker/tests/retrieval/concept-neighbors.test.ts` (new)
- **Agent mode**: `/implement`
- **Implementation**: lab's concepts + 1-hop prerequisite/dependent concepts (check SCHEMA for the concept-graph table — likely `concept_prerequisites` or `concept_relations`) + same-module siblings. Return `{ focus: Concept[], neighbors: Concept[] }`.
- **Acceptance**: mocked Supabase; depth=1 returns direct neighbors only; test with a seeded 3-concept chain.

### S5-T5: `retrieveSimilarLabs`

- **Depends on**: S4p-T2, S5-T2
- **Files**: `worker/lib/retrieval/similar-labs.ts` (new), `worker/tests/retrieval/similar-labs.test.ts` (new)
- **Agent mode**: `/implement`
- **Implementation**:
  - Build query text from current lab's `(title + concept names + syllabus extract)`.
  - Embed via `embedBatch([queryText])`.
  - Cosine search against `lab_embeddings` filtered by `subject_area`, `quality_score >= minQuality`, exclude self, require `labs.generation_status = 'complete'`.
  - Return top-k with similarity scores.
- **Acceptance**: mocked Supabase `.rpc` or raw SQL; returns correctly ordered results; tolerates empty result set (returns `[]`, not null).

### S5-T6: `retrieveCognitiveModel`

- **Depends on**: S4p-T2
- **Files**: `worker/lib/retrieval/cognitive-model.ts` (new), `worker/tests/retrieval/cognitive-model.test.ts` (new)
- **Agent mode**: `/implement`
- **Implementation**:
  - Given `enrollmentId`, read latest `cognitive_model_snapshots` row.
  - If stale (>24h) or missing, recompute from `concept_evaluations` (aggregate mastery per concept) + last 5 `chat_messages` for this student. Upsert snapshot.
  - Return `{ byConcept: {conceptId: {mastery, trend, lastBloomsLevel}}, weakAreas, strengths, lastInteractionAt }`.
- **Acceptance**: stale-path test (24h+1m old snapshot triggers recompute + upsert); fresh-path test (returns cached without recomputing).

### S5-T7: `buildGenerationContext` composer

- **Depends on**: S5-T3, S5-T4, S5-T5, S5-T6
- **Files**: `worker/lib/retrieval/index.ts` (export composer), `worker/tests/retrieval/compose.test.ts` (new)
- **Agent mode**: `/implement`
- **Implementation**:
  ```ts
  export async function buildGenerationContext(
    labId: string,
    studentEnrollmentId?: string,
  ): Promise<GenerationContext> {
    const [chapter, conceptNeighborhood, similarLabs, cognitive] = await Promise.all([
      retrieveChapterMaterials(labId),
      retrieveConceptNeighbors(labId),
      retrieveSimilarLabs(labId),
      studentEnrollmentId ? retrieveCognitiveModel(studentEnrollmentId, { labId }) : Promise.resolve(null),
    ])
    return { chapter, conceptNeighborhood, similarLabs, cognitive }
  }
  ```
- **Acceptance**: fan-out test asserts all four retrievers invoked in parallel; student-less call returns `cognitive: null`.

### S5-T8: Backfill `lab_embeddings` for completed labs

- **Depends on**: S5-T2, S5-T5 (to verify the query works)
- **Files**: `worker/scripts/backfill-lab-embeddings.ts` (new, one-shot)
- **Agent mode**: `/implement`
- **Implementation**: script iterates `labs WHERE generation_status='complete' AND id NOT IN (SELECT lab_id FROM lab_embeddings)`. Builds `embedded_text` from `title + concept names + first section headings`. Embeds via `embedBatch`. Inserts row with `quality_score = 1.0` default.
- **Verification**: running the script twice is idempotent (zero inserts on second run).
- **Acceptance**:
  - [ ] Script runnable via `tsx worker/scripts/backfill-lab-embeddings.ts`.
  - [ ] `SELECT count(*) FROM lab_embeddings` matches count of completed labs.
