# Muto — Schema & Data Model

> This document defines the core data model for Muto. Every table, relationship, and design decision is documented here. This is the engineering source of truth — all API routes, RLS policies, and frontend data fetching derive from this schema.

---

## Design Principles

1. **Multi-tenant ready.** Institution is the top-level entity. The Miami pilot is one row in `institutions`. Every query scopes through institution → course → down.
2. **Semester isolation.** Each semester produces a fresh `course_instance` with its own join code, enrollment, and knowledge graph data. The parent `course` is reusable — professors clone structure without carrying over student data.
3. **Three-layer content storage.** Raw source files (immutable), parsed structured blocks (for generation), and vector embeddings (for chatbot RAG). Each layer serves a different consumer.
4. **Bloom's Taxonomy is structural.** Every Knowledge Review question and every evaluation is tagged with a Bloom's cognitive level. This isn't metadata — it's how the system understands depth of understanding.
5. **Measurement and learning are separated.** Knowledge Review responses feed the knowledge graph (primary signal). Chatbot conversations are for student learning and produce secondary signal only.

---

## Entity Relationship Overview

```
institution
  └── user (professor, ta, student)
  └── course
        └── course_instance (per semester)
              ├── enrollment (student ↔ instance)
              ├── course_staff (professor/ta ↔ instance)
              ├── insight_deadline
              ├── insight_report
              └── module
                    └── lab
                          ├── source_material
                          │     ├── content_block (parsed, ordered)
                          │     └── content_embedding (vector)
                          ├── concept
                          ├── review_question
                          │     └── review_response
                          │           └── concept_evaluation
                          └── chat_session
                                └── chat_message
```

---

## Tables

### `institutions`

Top-level tenant. One per university.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | "Miami University" |
| `slug` | text | Unique. "miami-university". Used in URLs and SSO routing. |
| `sso_provider` | text | SAML/OIDC provider identifier for institutional SSO. |
| `sso_config` | jsonb | Provider-specific config (entity ID, endpoints, Duo integration). |
| `created_at` | timestamptz | |

---

### `users`

All users across all roles. Authenticated via institutional SSO.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK. Matches Supabase Auth `auth.users.id`. |
| `institution_id` | uuid | FK → institutions. |
| `email` | text | Institutional email. Unique. |
| `full_name` | text | |
| `role` | enum | `professor`, `ta`, `student` |
| `created_at` | timestamptz | |

**Notes:**
- Role is global to the user. A professor is always a professor. Course-level permissions (who can access which course) are handled by `course_staff` and `enrollment`.
- SSO principal maps to this table via email match on the institution.

---

### `courses`

A reusable course definition. Not tied to a semester.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `institution_id` | uuid | FK → institutions. |
| `created_by` | uuid | FK → users. The professor who created it. |
| `title` | text | "Introduction to Quantum Computing" |
| `description` | text | |
| `subject_area` | text | "quantum_computing", "machine_learning", etc. Guides generation pipeline. |
| `created_at` | timestamptz | |

---

### `course_instances`

A specific offering of a course in a specific semester. Students enroll here. Fresh knowledge graph per instance.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `course_id` | uuid | FK → courses. |
| `semester` | text | "Fall 2026", "Spring 2027" |
| `join_code` | text | Unique. Short alphanumeric code professors share with students. |
| `join_link` | text | Generated. `https://trymuto.com/join/{join_code}` |
| `is_active` | boolean | Professor can deactivate to stop new enrollments. |
| `created_at` | timestamptz | |

---

### `course_staff`

Links professors and TAs to course instances with role-based permissions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `course_instance_id` | uuid | FK → course_instances. |
| `user_id` | uuid | FK → users. |
| `role` | enum | `professor`, `ta` |
| `can_edit_structure` | boolean | Professors: true. TAs: false (view metrics, not edit labs). |
| `created_at` | timestamptz | |

**Unique constraint:** (`course_instance_id`, `user_id`)

---

### `enrollments`

Links students to course instances.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `course_instance_id` | uuid | FK → course_instances. |
| `user_id` | uuid | FK → users. |
| `enrolled_at` | timestamptz | |

**Unique constraint:** (`course_instance_id`, `user_id`)

---

### `modules`

A topic unit within a course. Ordered. Professor decides granularity.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `course_id` | uuid | FK → courses. Modules belong to the reusable course, not the instance. |
| `title` | text | "Quantum Entanglement" |
| `description` | text | |
| `position` | integer | Display order within the course. |
| `created_at` | timestamptz | |

---

### `labs`

An interactive learning unit within a module. Professor controls how many labs per module. Generated content is Bloom's Taxonomy-structured.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `module_id` | uuid | FK → modules. |
| `title` | text | "Bell States and Quantum Correlations" |
| `description` | text | |
| `position` | integer | Display order within the module. |
| `content` | jsonb | The structured lab content. Sections ordered by Bloom's progression (remember → understand → apply → analyze → evaluate → create). |
| `blooms_structure` | jsonb | Metadata mapping which sections of the lab target which Bloom's levels. Used by the generation pipeline during Knowledge Review question creation. |
| `generation_status` | enum | `pending`, `generating`, `complete`, `failed` |
| `generated_at` | timestamptz | |
| `created_at` | timestamptz | |

**Notes:**
- Labs belong to the course-level module (reusable across semesters), not the course instance. Student data (responses, evaluations) is scoped to the course instance via enrollment.
- Labs never close. Students can retake Knowledge Reviews across the full semester.

---

### `source_materials`

**Layer 1 — Raw source files.** Immutable uploads from the professor.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `lab_id` | uuid | FK → labs. A lab can have multiple source materials. |
| `uploaded_by` | uuid | FK → users. |
| `file_name` | text | Original filename. |
| `file_type` | text | MIME type. `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, etc. |
| `storage_path` | text | Path in Supabase Storage bucket. |
| `file_size_bytes` | bigint | |
| `created_at` | timestamptz | |

---

### `content_blocks`

**Layer 2 — Parsed structured content.** Preserves document hierarchy and ordering. Used by the generation pipeline.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `source_material_id` | uuid | FK → source_materials. |
| `lab_id` | uuid | FK → labs. Denormalized for faster queries. |
| `block_type` | enum | `heading`, `paragraph`, `figure`, `table`, `equation`, `list`, `code` |
| `content` | text | The actual text content of the block. |
| `heading_level` | integer | Nullable. 1-6 for headings. |
| `position` | integer | Global ordering within the source material. |
| `page_number` | integer | Nullable. For PDF sources. |
| `metadata` | jsonb | Flexible. Caption text for figures, column headers for tables, etc. |
| `created_at` | timestamptz | |

---

### `content_embeddings`

**Layer 3 — Vector embeddings for RAG.** Powers the chatbot's semantic retrieval.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `content_block_id` | uuid | FK → content_blocks. |
| `lab_id` | uuid | FK → labs. Denormalized. Chatbot queries scope to a single lab's embeddings. |
| `embedding` | vector(1536) | Using pgvector. Dimension matches embedding model (e.g., OpenAI `text-embedding-3-small`). |
| `chunk_text` | text | The text that was embedded. May be a content_block or a sub-chunk of a long block. |
| `chunk_index` | integer | Position within the parent content_block if sub-chunked. |
| `created_at` | timestamptz | |

**Index:** IVFFlat or HNSW index on `embedding` column, partitioned by `lab_id` for scoped similarity search.

---

### `concepts`

Nodes in the knowledge graph. AI-proposed, professor-approved.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `lab_id` | uuid | FK → labs. |
| `name` | text | "Bell states", "measurement collapse", "quantum tunneling" |
| `description` | text | Brief explanation of what this concept covers. |
| `parent_concept_id` | uuid | Nullable. FK → concepts. Allows hierarchical concept relationships (e.g., "Bell states" is a child of "entanglement"). |
| `status` | enum | `proposed`, `approved`, `rejected` |
| `position` | integer | Display order within the lab's concept list. |
| `created_at` | timestamptz | |

**Notes:**
- The generation pipeline proposes concepts. Professors review and approve/edit/reject before the lab goes live.
- `parent_concept_id` enables a concept tree, not just a flat list. This matters for the knowledge graph — weakness in a parent concept implies weakness in children.

---

### `review_questions`

Knowledge Review questions. Concept-tagged and Bloom's-leveled. Can be AI-generated or professor-authored.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `lab_id` | uuid | FK → labs. |
| `concept_id` | uuid | FK → concepts. The concept this question tests. |
| `question_text` | text | The question presented to the student. |
| `blooms_level` | enum | `remember`, `understand`, `apply`, `analyze`, `evaluate`, `create` |
| `source` | enum | `generated`, `custom` |
| `evaluation_rubric` | text | Guidance for the AI evaluator. What constitutes understanding at this Bloom's level for this concept. Not shown to students. |
| `is_active` | boolean | Professor can deactivate questions without deleting. |
| `position` | integer | Display order within the review. |
| `created_at` | timestamptz | |

**Notes:**
- Questions tagged `generated` were created by the pipeline. Questions tagged `custom` were authored by the professor.
- `evaluation_rubric` is critical — it tells the AI evaluator *what to look for* in the free-text answer. E.g., "Student should be able to describe how Bell states exhibit correlations that cannot be explained by local hidden variables. At the 'apply' level, they should provide a specific example scenario."

---

### `review_sessions`

A single attempt at a Knowledge Review by a student. Groups responses together.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `lab_id` | uuid | FK → labs. |
| `enrollment_id` | uuid | FK → enrollments. Ties the session to a specific student in a specific course instance. |
| `started_at` | timestamptz | |
| `completed_at` | timestamptz | Nullable. Null if abandoned. |

**Notes:**
- Students can take multiple review sessions for the same lab (restudy).
- Adaptive question selection happens at session creation — the system looks at prior sessions and selects questions targeting weak concepts and unassessed Bloom's levels.

---

### `review_responses`

A student's free-text answer to a single Knowledge Review question.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `review_session_id` | uuid | FK → review_sessions. |
| `review_question_id` | uuid | FK → review_questions. |
| `answer_text` | text | The student's free-text response. |
| `answered_at` | timestamptz | |

---

### `concept_evaluations`

**The core data atom of the knowledge graph.** One row per evaluated response. Links a student's answer to a concept with a mastery score, Bloom's level, and confidence.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `review_response_id` | uuid | FK → review_responses. |
| `concept_id` | uuid | FK → concepts. |
| `enrollment_id` | uuid | FK → enrollments. Denormalized for fast per-student queries. |
| `blooms_level` | enum | `remember`, `understand`, `apply`, `analyze`, `evaluate`, `create` |
| `mastery_score` | numeric(3,2) | 0.00–1.00. AI-assessed mastery of the concept at this Bloom's level. |
| `confidence` | numeric(3,2) | 0.00–1.00. How confident the AI is in its assessment. Low confidence flags ambiguous answers for professor review. |
| `reasoning` | text | AI's explanation of the evaluation. Shown to the student as qualitative feedback. |
| `evaluated_at` | timestamptz | |

**Notes:**
- This is the row the knowledge graph reads. Every query about "how is this student doing" or "where is the class struggling" aggregates over `concept_evaluations`.
- `mastery_score` + `blooms_level` together paint a rich picture: a student might score 0.9 at `remember` but 0.3 at `apply` for the same concept.
- `reasoning` is student-facing (qualitative feedback). `mastery_score` and `confidence` are professor-facing only.
- Multiple evaluations per concept per student over time — the knowledge graph shows trajectory, not just current state.

---

### `insight_deadlines`

Professor-defined timestamps that trigger compiled metrics reports. Typically aligned to class meeting days.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `course_instance_id` | uuid | FK → course_instances. |
| `label` | text | "Tuesday class", "Thursday class", "Before midterm review" |
| `day_of_week` | integer | Nullable. 0=Sunday, 1=Monday, ... 6=Saturday. For recurring deadlines. |
| `time` | time | Time of day the report should be ready. E.g., "08:00" for a 10am class. |
| `is_recurring` | boolean | If true, repeats weekly on `day_of_week`. If false, one-time deadline using `specific_date`. |
| `specific_date` | date | Nullable. For one-time deadlines. |
| `is_active` | boolean | |
| `created_at` | timestamptz | |

---

### `insight_reports`

Compiled snapshots of the knowledge graph at a point in time. Triggered by deadlines or generated on-demand.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `course_instance_id` | uuid | FK → course_instances. |
| `insight_deadline_id` | uuid | Nullable. FK → insight_deadlines. Null if generated on-demand. |
| `report_type` | enum | `scheduled`, `on_demand` |
| `content` | jsonb | The humanized report. Structured sections: weak concepts, trending improvements, per-module breakdown, recommended focus areas, class-level aggregates. |
| `generated_at` | timestamptz | |

**Notes:**
- Reports are snapshots, not live views. The professor can always access the live knowledge graph directly, but insight reports capture a moment in time with humanized narrative.
- `content` is structured JSON, not a blob of text. The frontend renders it with appropriate visualizations.

---

### `chat_sessions`

A student's freeform chatbot conversation scoped to a lab.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `lab_id` | uuid | FK → labs. |
| `enrollment_id` | uuid | FK → enrollments. |
| `started_at` | timestamptz | |
| `last_message_at` | timestamptz | |

---

### `chat_messages`

Individual messages in a chat session.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `chat_session_id` | uuid | FK → chat_sessions. |
| `role` | enum | `student`, `assistant` |
| `content` | text | |
| `created_at` | timestamptz | |

**Notes:**
- Chat messages are the secondary signal source. A background process can optionally analyze chat patterns to flag concepts students are repeatedly asking about, feeding low-weight signals into the knowledge graph.

---

## Generation Pipeline & Job Queue

The generation pipeline uses a three-phase flow: **Map → Review → Generate**. Professors upload materials, the system proposes a generation plan (which modules, which labs, which concepts), the professor reviews and edits the plan, then triggers generation in batches. Long-running generation jobs execute on a Railway worker that polls a Supabase queue table.

### `generation_jobs`

The job queue. Each row represents a unit of generation work (one lab, one batch of labs, or one full module). The Railway worker polls this table for pending jobs.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `course_id` | uuid | FK → courses. |
| `created_by` | uuid | FK → users. The professor who triggered the job. |
| `job_type` | enum | `parse_materials`, `propose_plan`, `generate_lab`, `generate_batch`, `generate_embeddings`, `generate_review_questions` |
| `status` | enum | `pending`, `running`, `completed`, `failed`, `cancelled` |
| `priority` | integer | Default 0. Higher = processed first. Allows single-lab test generations to jump the queue. |
| `input_payload` | jsonb | Job-specific input. For `generate_lab`: `{ lab_id, source_material_ids, concept_ids }`. For `parse_materials`: `{ source_material_id }`. |
| `output_payload` | jsonb | Nullable. Job results. For `propose_plan`: the proposed module/lab/concept structure. For `generate_lab`: the generated content. |
| `progress_percent` | integer | 0-100. Updated by the worker as it progresses. Frontend subscribes via Supabase Realtime. |
| `current_step` | text | Nullable. Human-readable status. "Parsing chapter 3 of 12", "Generating concept taxonomy", "Creating review questions". |
| `error_message` | text | Nullable. Set on failure. |
| `estimated_cost_cents` | integer | Nullable. Pre-calculated estimate before generation starts. Shown to professor in the review phase. |
| `actual_cost_cents` | integer | Nullable. Tracked during execution based on token usage. |
| `started_at` | timestamptz | Nullable. When the worker picked up the job. |
| `completed_at` | timestamptz | Nullable. |
| `created_at` | timestamptz | |

**Notes:**
- The worker polls for `status = 'pending'` ordered by `priority DESC, created_at ASC` (highest priority first, FIFO within same priority).
- `progress_percent` and `current_step` are updated in real-time by the worker. The professor's UI subscribes to this row via Supabase Realtime and shows live progress.
- `estimated_cost_cents` is calculated during the `propose_plan` phase based on token estimates. The professor sees this before confirming generation.
- Jobs can be cancelled by the professor (sets `status = 'cancelled'`). The worker checks for cancellation between processing steps.

---

### `generation_plans`

The pre-generation map that professors review and edit before triggering generation. Output of the `propose_plan` job type.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `course_id` | uuid | FK → courses. |
| `generation_job_id` | uuid | FK → generation_jobs. The `propose_plan` job that created this plan. |
| `plan_data` | jsonb | The proposed structure: modules, labs per module, concepts per lab, estimated question counts. Editable by the professor. |
| `status` | enum | `draft`, `approved`, `generating`, `completed` |
| `professor_notes` | text | Nullable. Professor's annotations or instructions for the generator (e.g., "emphasize practical circuits over theory in module 3"). |
| `created_at` | timestamptz | |
| `approved_at` | timestamptz | Nullable. When the professor approved the plan for generation. |

**Notes:**
- `plan_data` structure:
  ```json
  {
    "modules": [
      {
        "title": "Quantum Entanglement",
        "position": 1,
        "labs": [
          {
            "title": "Bell States and Quantum Correlations",
            "source_material_ids": ["uuid1", "uuid2"],
            "proposed_concepts": ["Bell states", "Quantum correlations", "CHSH inequality"],
            "estimated_questions": 6,
            "blooms_levels": ["remember", "understand", "apply"],
            "estimated_cost_cents": 45
          }
        ]
      }
    ],
    "total_estimated_cost_cents": 320
  }
  ```
- Professor can add/remove/reorder modules and labs, edit concept lists, add professor_notes, and adjust Bloom's level coverage before approving.
- Once approved, the system creates individual `generate_lab` jobs for each lab in the plan.

---

## Rate Limiting & Cost Tracking

### `api_usage_log`

Tracks every LLM API call for cost monitoring and rate limiting. Written by both the Railway worker (generation) and the Next.js app (chatbot, Knowledge Review evaluation).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → users. Who triggered this usage. |
| `institution_id` | uuid | FK → institutions. For institution-level cost aggregation. |
| `usage_type` | enum | `chatbot`, `review_evaluation`, `lab_generation`, `plan_generation`, `embedding_generation`, `material_parsing` |
| `model` | text | Model identifier. "claude-sonnet-4-20250514", "text-embedding-3-small", etc. |
| `input_tokens` | integer | |
| `output_tokens` | integer | |
| `cost_cents` | integer | Calculated cost in cents. |
| `generation_job_id` | uuid | Nullable. FK → generation_jobs. Links to the job that triggered this call, if applicable. |
| `lab_id` | uuid | Nullable. FK → labs. Which lab this usage relates to. |
| `created_at` | timestamptz | |

---

### `rate_limits`

Configurable rate limits per usage type. Checked before each API call.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `institution_id` | uuid | Nullable. FK → institutions. Null = global default. |
| `usage_type` | enum | Matches `api_usage_log.usage_type`. |
| `limit_type` | enum | `per_user_hourly`, `per_user_daily`, `per_institution_daily`, `per_institution_monthly`, `cost_daily_cents`, `cost_monthly_cents` |
| `limit_value` | integer | The threshold. E.g., 50 for "50 messages per hour", or 5000 for "$50/day". |
| `action_on_limit` | enum | `block`, `alert`, `queue` |
| `is_active` | boolean | |
| `created_at` | timestamptz | |

**Default rate limits (seeded):**

| Usage Type | Limit Type | Value | Action |
|---|---|---|---|
| `chatbot` | `per_user_hourly` | 50 | `block` |
| `chatbot` | `per_user_daily` | 300 | `block` |
| `review_evaluation` | `per_user_hourly` | 100 | `block` |
| `lab_generation` | `per_institution_daily` | 20 | `alert` |
| `lab_generation` | `cost_daily_cents` | 5000 | `alert` |
| `lab_generation` | `cost_monthly_cents` | 50000 | `alert` |

**Notes:**
- Student chatbot and review evaluation limits use `block` — hard limits that reject the request with a friendly message.
- Generation limits use `alert` — you get notified but the job still runs. This is the "just alert me and I'll handle it manually" approach for the pilot phase.
- Limits are checked by a utility function in `src/lib/rate-limit.ts` that queries `api_usage_log` counts/sums against `rate_limits` thresholds before each API call.
- Institution-specific overrides: if a row exists with a matching `institution_id`, it takes precedence over the global default (null `institution_id`).

---

### `cost_alerts`

Notifications generated when cost thresholds are approached or exceeded.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `institution_id` | uuid | FK → institutions. |
| `rate_limit_id` | uuid | FK → rate_limits. Which limit was triggered. |
| `alert_type` | enum | `threshold_warning`, `threshold_exceeded` |
| `current_value` | integer | The current usage count or cost that triggered the alert. |
| `limit_value` | integer | The threshold that was hit. |
| `message` | text | Human-readable alert message. |
| `acknowledged` | boolean | Default false. You mark it true once you've seen it. |
| `created_at` | timestamptz | |

---

## Row Level Security (RLS) Policy Summary

| Table | Professor | TA | Student |
|---|---|---|---|
| `courses` | CRUD own courses | Read if staff | — |
| `course_instances` | CRUD own instances | Read if staff | Read if enrolled |
| `modules` | CRUD on own courses | Read if staff | Read if enrolled |
| `labs` | CRUD on own courses | Read if staff | Read if enrolled |
| `concepts` | Approve/edit/reject on own courses | Read if staff | Read approved only |
| `review_questions` | CRUD on own courses | Read if staff | Read active only |
| `review_responses` | Read all in own instances | Read all in staffed instances | CRUD own only |
| `concept_evaluations` | Read all in own instances | Read all in staffed instances | Read own reasoning only (not scores) |
| `insight_reports` | Read own instances | Read staffed instances | — |
| `chat_sessions` | Read all in own instances | Read all in staffed instances | CRUD own only |
| `chat_messages` | Read all in own instances | Read all in staffed instances | CRUD own only |
| `generation_jobs` | CRUD on own courses | Read if staff | — |
| `generation_plans` | CRUD on own courses | Read if staff | — |
| `api_usage_log` | Read own usage | — | Read own usage |
| `rate_limits` | Read all | Read all | Read own usage type limits |
| `cost_alerts` | — | — | — (admin only) |

**Critical RLS rule for students on `concept_evaluations`:** Students can read their own rows but the query must exclude `mastery_score` and `confidence` columns. They see `reasoning` only. This is enforced via a Postgres view (`student_evaluations_view`) that exposes only the permitted columns.

---

## Key Queries the Schema Must Support Efficiently

1. **"Where is my class struggling?"** — Aggregate `concept_evaluations` by `concept_id` for all enrollments in a `course_instance_id`, grouped by `blooms_level`. Low average `mastery_score` at any Bloom's level = weak concept.

2. **"How is this specific student doing?"** — Filter `concept_evaluations` by `enrollment_id`, ordered by `evaluated_at`. Shows trajectory across the semester.

3. **"What questions should this student see next?"** — For adaptive reviews: find concepts where the student has low or no evaluations, prioritizing untested Bloom's levels and previously weak concepts. Select questions accordingly.

4. **"Generate an insight report."** — Snapshot query: all `concept_evaluations` created since the last report (or since semester start), aggregated by concept and Bloom's level, with trend comparison to prior snapshot.

5. **"Chatbot: find relevant content for this question."** — Vector similarity search on `content_embeddings` scoped to `lab_id`, returning top-k `chunk_text` values as context for the LLM.

---

## Indexes

| Table | Index | Type | Purpose |
|---|---|---|---|
| `concept_evaluations` | `(enrollment_id, concept_id, evaluated_at)` | B-tree | Student trajectory queries |
| `concept_evaluations` | `(concept_id, enrollment_id)` | B-tree | Class-level concept aggregation |
| `content_embeddings` | `(embedding)` | HNSW (pgvector) | Chatbot similarity search |
| `content_embeddings` | `(lab_id)` | B-tree | Scope embedding search to lab |
| `review_questions` | `(lab_id, concept_id, blooms_level)` | B-tree | Adaptive question selection |
| `review_sessions` | `(enrollment_id, lab_id)` | B-tree | Student's review history for a lab |
| `enrollments` | `(course_instance_id, user_id)` | Unique | Prevent duplicate enrollment |
| `course_instances` | `(join_code)` | Unique | Join code lookup |
| `generation_jobs` | `(status, priority, created_at)` | B-tree | Worker polling for pending jobs |
| `generation_jobs` | `(course_id, status)` | B-tree | Professor views their jobs |
| `api_usage_log` | `(user_id, usage_type, created_at)` | B-tree | Per-user rate limit checks |
| `api_usage_log` | `(institution_id, usage_type, created_at)` | B-tree | Per-institution cost aggregation |
| `api_usage_log` | `(generation_job_id)` | B-tree | Total cost for a specific job |
| `cost_alerts` | `(institution_id, acknowledged, created_at)` | B-tree | Unacknowledged alerts dashboard |

---

## Generation Pipeline Output Schema

When the generation pipeline processes source materials for a lab, it produces a single structured output containing three linked artifacts:

```json
{
  "lab_content": {
    "title": "Bell States and Quantum Correlations",
    "sections": [
      {
        "blooms_level": "remember",
        "heading": "What are Bell states?",
        "body": "..."
      },
      {
        "blooms_level": "understand",
        "heading": "Why Bell states matter",
        "body": "..."
      },
      {
        "blooms_level": "apply",
        "heading": "Working with Bell state circuits",
        "body": "..."
      }
    ]
  },
  "concept_taxonomy": [
    {
      "name": "Bell states",
      "description": "The four maximally entangled two-qubit states",
      "parent": "Entanglement",
      "status": "proposed"
    },
    {
      "name": "Quantum correlations",
      "description": "Statistical correlations between entangled particles that violate Bell inequalities",
      "parent": "Bell states",
      "status": "proposed"
    }
  ],
  "review_questions": [
    {
      "concept": "Bell states",
      "blooms_level": "remember",
      "question_text": "Describe the four Bell states and what distinguishes them from each other.",
      "evaluation_rubric": "Student should name all four Bell states (Φ+, Φ−, Ψ+, Ψ−) and describe the superposition and phase relationships that distinguish them."
    },
    {
      "concept": "Bell states",
      "blooms_level": "apply",
      "question_text": "Given a two-qubit system initialized in |00⟩, describe a circuit that would produce the Bell state |Φ+⟩ and explain why each gate is necessary.",
      "evaluation_rubric": "Student should describe applying a Hadamard gate to the first qubit followed by a CNOT gate. They should explain that the Hadamard creates superposition and the CNOT creates entanglement."
    }
  ]
}
```

This output is validated against the schema, stored in the appropriate tables, and presented to the professor for concept approval before the lab goes live to students.

---

## Phase 2 — Personalized Learning Profiles

> **Status: Schema reserved. Not built in Phase 1.**
>
> These tables are designed now so that Phase 1 schema decisions don't block personalization later. No Phase 1 code reads or writes to these tables. When Phase 2 begins, the learning profile system layers on top of the existing knowledge graph without requiring migration of Phase 1 tables.

### How It Works

Each student builds a **learning profile** through two signals:

1. **Diagnostic assessment** — A short onboarding activity at the start of the semester that presents the same concept through different modalities (visual diagram, formal definition, worked example, hands-on exercise) and observes which approach produces the fastest and most confident understanding. Takes ~10 minutes. Produces an initial profile.

2. **Behavioral refinement** — As the student uses the system throughout the semester, their interaction patterns continuously update the profile. Which lab sections they spend the most time on, which chatbot explanation styles they engage with, which Knowledge Review Bloom's levels they perform best at, how they navigate content. The initial diagnostic is a starting point; behavior is the long-term signal.

The profile affects two things:
- **Chatbot response style** — The system prompt for each student's chatbot session includes their learning preferences, adjusting tone, explanation strategy, and example types. The lab content stays the same; the conversational voice adapts.
- **Content emphasis and navigation** — Labs highlight or suggest starting points based on the profile. A student who learns best by doing sees the "apply" sections surfaced first. A student who needs formal grounding sees "remember" and "understand" emphasized. The content itself isn't regenerated — the *presentation layer* adapts.

### Learning Dimensions

The profile captures preferences across three orthogonal dimensions:

| Dimension | Spectrum | What it affects |
|---|---|---|
| **Modality** | Visual ↔ Textual ↔ Example-driven | How the chatbot explains things. Visual learners get more "imagine a diagram where..." language. Example-driven learners get concrete scenarios first. Textual learners get precise definitions. |
| **Approach** | Formal-first ↔ Intuition-first | Whether the chatbot leads with the rigorous definition or the "here's the intuition" framing. Formal-first students want the math, then the metaphor. Intuition-first students want the metaphor, then the math. |
| **Entry point** | Theory-first ↔ Application-first | Where the system suggests starting in a lab. Theory-first students begin at "remember" and work up. Application-first students start at "apply" and backfill understanding as needed. Also affects Knowledge Review question ordering. |

Each dimension is stored as a continuous score (0.0–1.0), not a binary bucket. Most students are somewhere in the middle, and the system adjusts proportionally.

---

### `learning_profiles`

One per student per course instance. Initialized by the diagnostic, refined by behavior.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `enrollment_id` | uuid | FK → enrollments. Unique — one profile per enrollment. |
| `modality_visual` | numeric(3,2) | 0.00–1.00. Preference strength for visual explanations. |
| `modality_textual` | numeric(3,2) | 0.00–1.00. Preference strength for textual/definitional explanations. |
| `modality_example` | numeric(3,2) | 0.00–1.00. Preference strength for example-driven explanations. |
| `approach_formal` | numeric(3,2) | 0.00–1.00. 0 = strong intuition-first, 1 = strong formal-first. |
| `entry_point_theory` | numeric(3,2) | 0.00–1.00. 0 = strong application-first, 1 = strong theory-first. |
| `profile_source` | enum | `diagnostic`, `behavioral`, `blended` |
| `diagnostic_completed_at` | timestamptz | Nullable. When the student completed the onboarding diagnostic. |
| `last_refined_at` | timestamptz | When behavioral signals last updated the profile. |
| `created_at` | timestamptz | |

**Notes:**
- Modality scores are a soft distribution, not mutually exclusive. A student might be 0.7 visual, 0.4 textual, 0.8 example-driven — meaning they respond best to visual + example approaches combined.
- `profile_source` tracks whether the current values are from the diagnostic alone, behavioral observation alone, or a blend. Early in the semester it's `diagnostic`; after enough interactions it shifts to `blended`.
- The chatbot system prompt constructor reads this profile and translates the scores into natural language instructions (e.g., "This student learns best through concrete examples and visual analogies. Lead with a specific scenario before introducing formal notation.").

---

### `diagnostic_sessions`

A student's onboarding diagnostic assessment.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `enrollment_id` | uuid | FK → enrollments. |
| `started_at` | timestamptz | |
| `completed_at` | timestamptz | Nullable. |
| `results` | jsonb | Raw diagnostic data. Per-activity response times, engagement signals, self-reported preferences. |

---

### `diagnostic_activities`

Individual activities within the diagnostic. Each presents the same concept through a different modality/approach.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `diagnostic_session_id` | uuid | FK → diagnostic_sessions. |
| `activity_type` | enum | `visual_diagram`, `formal_definition`, `worked_example`, `hands_on_exercise` |
| `concept_topic` | text | The concept used for this activity. Same across all activities in a session. |
| `content` | jsonb | The activity content presented to the student. |
| `position` | integer | Order within the diagnostic. Randomized per student to avoid ordering bias. |
| `created_at` | timestamptz | |

---

### `diagnostic_responses`

Student's engagement with each diagnostic activity. Captures both explicit responses and implicit behavioral signals.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `diagnostic_activity_id` | uuid | FK → diagnostic_activities. |
| `enrollment_id` | uuid | FK → enrollments. |
| `time_spent_seconds` | integer | How long the student engaged with this activity. |
| `comprehension_answer` | text | Student's answer to a short comprehension check after the activity. |
| `comprehension_score` | numeric(3,2) | 0.00–1.00. AI-evaluated understanding from the comprehension answer. |
| `self_reported_clarity` | integer | 1–5. "How clear was this explanation?" Student self-report. |
| `engagement_signals` | jsonb | Behavioral data: scroll depth, re-reads, time-to-first-interaction, etc. |
| `created_at` | timestamptz | |

**Notes:**
- The diagnostic compares comprehension scores and engagement across activity types for the same concept. If a student scores 0.9 comprehension on the visual diagram but 0.5 on the formal definition, that's a strong modality signal.
- `self_reported_clarity` provides a cross-check. If comprehension is high but self-reported clarity is low, the student may have gotten the right answer without feeling confident — useful nuance for the profile.
- Activity order is randomized (`position` is shuffled per student) to prevent sequence effects from contaminating the signal.

---

### `behavioral_signals`

Ongoing behavioral observations that refine the learning profile over time. Written by a background process that analyzes student interactions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `enrollment_id` | uuid | FK → enrollments. |
| `signal_type` | enum | `section_time`, `chatbot_style_engagement`, `review_blooms_performance`, `content_navigation`, `restudy_pattern` |
| `dimension` | enum | `modality`, `approach`, `entry_point` |
| `signal_value` | numeric(5,2) | The observed value. Interpretation depends on `signal_type`. |
| `context` | jsonb | Additional context. Which lab, which section, which chatbot exchange generated this signal. |
| `observed_at` | timestamptz | |

**Notes:**
- These are raw observations, not profile updates. A scheduled job periodically aggregates recent signals and updates the `learning_profiles` table using a weighted blend of diagnostic baseline + behavioral observations.
- Signal types map to dimensions:
  - `section_time` → Which Bloom's-level sections the student spends the most engaged time in → `entry_point`
  - `chatbot_style_engagement` → When the chatbot tries different explanation styles, which ones produce follow-up "that makes sense" vs. "I still don't get it" → `modality`, `approach`
  - `review_blooms_performance` → Which Bloom's levels the student performs best at → `entry_point`
  - `content_navigation` → Does the student read linearly or jump to exercises first → `entry_point`
  - `restudy_pattern` → Which sections they return to on restudy → `modality`, `approach`
- Weight of behavioral signals increases over the semester as more data accumulates. The diagnostic is weighted heavily early on, then gradually deemphasized.

---

### Phase 2 Indexes

| Table | Index | Type | Purpose |
|---|---|---|---|
| `learning_profiles` | `(enrollment_id)` | Unique | One profile per enrollment |
| `behavioral_signals` | `(enrollment_id, observed_at)` | B-tree | Aggregate recent signals for profile refinement |
| `behavioral_signals` | `(enrollment_id, dimension)` | B-tree | Per-dimension signal aggregation |
| `diagnostic_responses` | `(enrollment_id)` | B-tree | Retrieve all diagnostic data for a student |

---

### Phase 2 Key Queries

6. **"Build chatbot system prompt for this student."** — Read `learning_profiles` by `enrollment_id`, translate scores into natural language style instructions, inject into the chatbot LLM call's system prompt.

7. **"Suggest starting point for this lab."** — Read `learning_profiles.entry_point_theory` for the student. High score → suggest starting at the first section (theory-first). Low score → suggest jumping to the "apply" section and linking back to foundational sections as needed.

8. **"Refine this student's profile."** — Aggregate `behavioral_signals` for `enrollment_id` since `last_refined_at`, compute weighted average per dimension blended with current profile values, update `learning_profiles`.

9. **"How does learning style correlate with outcomes?"** — Join `learning_profiles` with `concept_evaluations` aggregates. Professor-facing analytics: "Students with high visual preference are performing 20% better on entanglement concepts." This feeds back into how the professor designs their in-class sessions.

---

### Phase 2 RLS Additions

| Table | Professor | TA | Student |
|---|---|---|---|
| `learning_profiles` | Read all in own instances | Read all in staffed instances | Read own only |
| `diagnostic_sessions` | Read all in own instances | Read all in staffed instances | CRUD own only |
| `diagnostic_responses` | Read all in own instances | Read all in staffed instances | Read own only |
| `behavioral_signals` | Read aggregates in own instances | Read aggregates in staffed instances | — (system-generated, not student-visible) |

**Note:** Students can see their own learning profile (it's about them), but `behavioral_signals` are system internals — students see the *result* (their profile) not the *inputs* (individual tracked behaviors). This avoids the creepy "the system is watching everything I do" feeling.