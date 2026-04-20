# Sprint S7: Frontend renderer — Sandpack labs + RAG tutor panel + legacy deletion

**Goal**: `lab-viewer-v2.tsx` renders interactive Sandpack sections for `content_version=2` labs. `tutor-panel.tsx` is wired to a real RAG server action that queries `content_embeddings`, merges `tutor_context`, and streams responses. Frontend default flips to v2 on real labs. Legacy v1 markdown pipeline (both write and read paths) is deleted.

**Estimated sessions**: 3–4.

**Parent plan**: `.claude/plans/get-200-in-optimized-swing.md` §6, §7 (cutover steps 5–6).

**Prerequisites**:
- S4' + S5 + S6 complete.
- Real labs in the DB with `content_version=2`, `sandpack_files` populated.
- v1 lesson learned: `LabViewer.tsx` in v1 hit 504 lines by packing lab + chat + kebab + visibility. Don't repeat — decompose.

---

## Task dependency graph

```
S7-T1 (install @codesandbox/sandpack-react) ─> S7-T2 (SandpackSection component)
                                                │
S7-T3 (decompose legacy LabViewer: extract kebab/visibility)
                                                │
                                                └─> S7-T4 (LabViewerV2 with lazy mount) ─> S7-T5 (content_version gating)
                                                                                                     │
S7-T6 (tutor-panel.tsx) ─┐                                                                           │
                         ├─> S7-T7 (sendTutorMessage server action with real RAG) ──────────────────┤
S7-T8 (embedding client for query-time RAG) ─────────────────────────────────────────────────────────┘
                                                                                                     │
                                                                                                     └─> S7-T9 (QA on 3 real labs, flip default, delete v1)
```

---

## Tasks

### S7-T1: Add Sandpack dep

- **Depends on**: none
- **Files**: root `package.json`, `package-lock.json`.
- **Agent mode**: `/implement`
- **Implementation**: `npm i @codesandbox/sandpack-react`. Pin to the version compatible with React 19 / Next 16 (currently `^2.x`).
- **Acceptance**:
  - [ ] Dep present.
  - [ ] `npm run build` succeeds.

### S7-T2: `SandpackSection` wrapper

- **Depends on**: S7-T1
- **Files**: `src/components/student/sandpack-section.tsx` (new)
- **Agent mode**: `/implement`
- **Implementation**: thin wrapper around `<Sandpack template="react-ts" files customSetup={{dependencies}} options={{showConsole: false, showNavigator: false}} />`. Accepts `bundle: SandpackBundle` (type from `@muto/shared`). IntersectionObserver: don't mount the iframe until the section scrolls within 200px of viewport.
- **Acceptance**:
  - [ ] Component renders a placeholder until observed; mounts Sandpack on scroll.
  - [ ] Tailwind-consistent border + loading skeleton.

### S7-T3: Decompose current LabViewer

- **Depends on**: none
- **Files**:
  - `src/components/student/lab-viewer.tsx` (existing — refactor)
  - `src/components/student/lab-kebab-menu.tsx` (new, extracted if present)
  - `src/components/student/lab-visibility-toggle.tsx` (new, extracted if present)
- **Agent mode**: `/implement`
- **Implementation**: pull deletion/kebab/visibility into their own components (v1 lesson anti-pattern #8). Keep v1 renderer behavior identical.
- **Acceptance**:
  - [ ] `lab-viewer.tsx` stays under 200 lines.
  - [ ] No behavior change for `content_version=1` labs.

### S7-T4: `LabViewerV2`

- **Depends on**: S7-T2
- **Files**: `src/components/student/lab-viewer-v2.tsx` (new)
- **Agent mode**: `/implement`
- **Implementation**:
  - Accepts `content: LabContentV2` (typed via `@muto/shared`).
  - Discriminated render: `kind === 'prose'` → `<MarkdownSection />`; `kind === 'interactive'` → `<SandpackSection bundle={section.sandpack} />`.
  - If `content.scope === 'whole_lab'`, render a single Sandpack with tabs for each section file, ignoring per-section bundles.
  - Bloom's-level badge matches v1 UX.
- **Acceptance**:
  - [ ] Renders the fixture lab from `tests/fixtures/lab-v2-sample.json` correctly.
  - [ ] 6-section interactive lab: iframes mount on scroll (test with Playwright + scroll events).

### S7-T5: Gate renderer on `content_version`

- **Depends on**: S7-T3, S7-T4
- **Files**: `src/app/(dashboard)/student/courses/[instanceSlug]/labs/[labSlug]/page.tsx`, `src/app/(dashboard)/professor/courses/[courseSlug]/labs/[labSlug]/page.tsx`
- **Agent mode**: `/implement`
- **Implementation**: `lab.content_version === 2 ? <LabViewerV2 .../> : <LabViewer .../>`. Keep v1 branch for cutover safety.
- **Acceptance**:
  - [ ] Lab with `content_version=1` still renders via old path.
  - [ ] Lab with `content_version=2` renders Sandpack.

### S7-T6: `TutorPanel`

- **Depends on**: none (UI shell can predate server action)
- **Files**: `src/components/student/tutor-panel.tsx` (new)
- **Agent mode**: `/implement`
- **Implementation**: sticky right rail, collapsible, chat UI. Reads `labs.tutor_context` as a prop for the header ("Notation cheatsheet", citation chips). Messages state local until S7-T7 wires the server action.
- **Acceptance**:
  - [ ] UI mounts alongside `LabViewerV2`.
  - [ ] Collapse/expand works.

### S7-T7: `sendTutorMessage` server action with real RAG

- **Depends on**: S7-T6, S7-T8, S5 retrievers (for `cognitive_model` pull)
- **Files**: `src/lib/actions/chat.ts` (replaces TODO at line 202), `src/lib/actions/tutor.ts` (new — if separation is cleaner)
- **Agent mode**: `/implement`
- **Implementation**:
  1. Input: `{labId, sessionId, content}`.
  2. Embed `content` via the query-time embedding client (S7-T8).
  3. Cosine search `content_embeddings WHERE lab_id = $1 ORDER BY embedding <=> $2 LIMIT RAG_K_DEFAULT`.
  4. Pull `labs.tutor_context` + latest `cognitive_model_snapshots` for the current enrollment.
  5. Construct Opus/Gemini Pro prompt: system (tutor role + tutor_context) + top-k chunks + cognitive summary + user turn.
  6. Stream response back to client. Log to `api_usage_log` via existing cost tracker.
- **Acceptance**:
  - [ ] `src/lib/actions/chat.ts:202` TODO removed.
  - [ ] Integration test: seeded `content_embeddings` chunk for "Bell state definition" — asking "what is a Bell state?" returns an answer containing the seeded excerpt.

### S7-T8: Query-time embedding client

- **Depends on**: S4p-T3
- **Files**: `src/lib/embeddings.ts` (new, server-only)
- **Agent mode**: `/implement`
- **Implementation**: thin wrapper around OpenAI `text-embedding-3-small` (or the model specified by `EMBEDDING_MODEL`). Server-only (uses service role). No batching here — single query at a time.
- **Acceptance**:
  - [ ] Returns `number[]` of length `EMBEDDING_DIM`.
  - [ ] Throws on missing `OPENAI_API_KEY`.

### S7-T9: QA, flip default, delete v1

- **Depends on**: S7-T5, S7-T7
- **Files**:
  - Generate 3 real labs via S6 pipeline, manually review in browser.
  - Remove v1 write branch in `worker/processors/generate-lab.ts` (dual-write → v2-only).
  - Remove v1 `<LabViewer>` branch in both lab pages.
  - Delete `src/components/student/lab-viewer.tsx` (v1).
  - Grep for `content_version === 1` and remove.
  - Drop v1 `content` field population (keep column for historical data; do not drop column yet — too risky).
- **Agent mode**: `/verify` then `/implement`
- **Acceptance**:
  - [ ] All 3 QA labs render with working Sandpack + tutor panel.
  - [ ] Grep `content_version === 1` returns zero hits.
  - [ ] Worker produces `content_version = 2` rows only.
  - [ ] v1 renderer file deleted.

---

## Rollback plan

Each task is a separate commit. If S7-T9 lands and a real lab breaks in production:
1. Revert the T9 commit (re-introduces v1 fallback).
2. Worker keeps producing v2; v2 labs render via V2 component; broken v2 lab can be regenerated.
