# UX/UI Optimization — Professor + Student Core Flows

## Status

This plan covers the **app shell + core happy-path UX** for both professor and student sides of Muto. It assumes:
- S1 (generation pipeline) is complete — materials upload, parse, propose plan, plan review, approval all functional.
- S2 (lab generation processor) is not yet built — this plan handles the *display* of generated labs but does not depend on actual generation working end-to-end.
- Auth is **stubbed** — `getAuthUser()` is the contract. A real SSO sprint comes later. For dev, seed a user.

This plan is large enough (11 subtasks) that it should be **converted to a sprint via `/sprint ux-optimization`** before implementation. The plan below is the architectural blueprint; the sprint will break it into verified, dependency-graphed tasks.

## Context Loading (for the implementing agent)

When implementing, read ONLY these:

**Always:**
- `CLAUDE.md` (conventions)
- This plan file

**Per-task — see "Files & Context" in each section. Schema lookups by table name:**
- Use `grep -n "### \`tablename\`" SCHEMA.md` to find line ranges, then read only those lines. Never read all of SCHEMA.md.

**Existing UI primitives** (already installed in `src/components/ui/`):
- `accordion`, `badge`, `button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `progress`, `separator`, `sonner` (toast), `tabs`, `textarea`

**Existing Server Actions:**
- `src/lib/actions/materials.ts` — `uploadMaterial`, `getMaterials`, `deleteMaterial`
- `src/lib/actions/generation.ts` — `getPlan`, `updatePlan`, `approvePlan`, `cancelPlan`

---

## Goals

1. **Reduce time-to-first-success** for a professor: from "I have a PDF" to "I have a generated lab visible to my class" without having to type UUIDs into URLs or guess what to do next.
2. **Make the data model legible**: visually surface the Course → Module → Lab → Concept hierarchy so professors understand what they're editing and students know where they are.
3. **Make state changes visible**: toasts for every save/delete/approve, optimistic UI for cheap actions, realtime indicators for slow ones (parse, generate).
4. **Minimal but complete student experience**: student can join a course, find a lab, read it, take a knowledge review, and chat with the tutor — all from a join code.
5. **No dead-ends**: every page links to its next logical action. Empty states explain what to do, not just that nothing exists.

## Non-Goals (defer to other sprints)

- Real auth/SSO (Duo SAML for Miami pilot — separate sprint)
- Lab generation processor (S2)
- Insight report rendering / professor analytics dashboards
- TA-specific permission UI
- Adaptive question selection logic
- Chat RAG backend (UI shell only — actual retrieval is a separate task)
- Embedding generation processor
- Mobile-optimized layouts (note responsive breakpoints but desktop-first for pilot)
- Marketing site / landing page polish (out of scope; minimal `/` landing only)

---

## Information Architecture

### Route Map

```
/                                             → marketing/landing (minimal: logo, "Sign in" CTA)
/login                                        → stubbed login (dev: pick a seeded user)
/join/[code]                                  → student join flow (enroll into course_instance via join_code)

(dashboard)/
  professor/
    courses/                                  → professor's course list (CREATE)
    courses/new                               → create course form (CREATE)
    courses/[courseId]/                       → course home / overview (CREATE)
    courses/[courseId]/materials              → materials upload + status (EXISTS — polish)
    courses/[courseId]/plan                   → generation plan editor (EXISTS — polish)
    courses/[courseId]/labs                   → list of generated labs (CREATE)
    courses/[courseId]/labs/[labId]           → lab detail / preview / regenerate (CREATE — minimal)
    courses/[courseId]/instances              → course instances list + join codes (CREATE — minimal)

  student/
    courses/                                  → student's enrolled courses (CREATE)
    courses/[instanceId]/                     → student course home (modules → labs) (CREATE)
    courses/[instanceId]/labs/[labId]         → lab content viewer + Bloom's-structured sections (CREATE)
    courses/[instanceId]/labs/[labId]/review  → knowledge review take flow (CREATE)
    courses/[instanceId]/labs/[labId]/chat    → chatbot UI shell (CREATE)
```

### Naming convention
- Route group `(dashboard)` for authenticated post-login surfaces
- Sub-segments `professor/` and `student/` keep role-scoped layouts cleanly separated
- All `[id]` params are uuids except `[code]` (join code is short alphanumeric)

---

## Subtasks Overview

| # | Subtask | Side | Depends on | Token |
|---|---|---|---|---|
| U1 | Design system: app shell, sidebar, top bar, toaster, loading skeletons | both | — | medium |
| U2 | Auth stub helper + role-aware redirects | both | — | small |
| U3 | Professor course list + create | professor | U1, U2 | medium |
| U4 | Professor course home (overview) | professor | U1, U3 | medium |
| U5 | Materials page polish (toasts, link to plan, attach-to-plan UX) | professor | U1, S1 | medium |
| U6 | Plan editor polish (source-material chips, drag reorder, lab→job mapping) | professor | U1, S1 | large |
| U7 | Lab list + minimal lab detail (professor) | professor | U1, U4 | medium |
| U8 | Course instance management (create instance, join code, copy link) | professor | U1, U4 | small |
| U9 | Student join flow + student course home | student | U1, U2 | medium |
| U10 | Student lab content viewer | student | U1, U9 | medium |
| U11 | Student knowledge review take flow | student | U1, U9, U10 | large |
| U12 | Student chatbot UI shell (no RAG impl) | student | U1, U9, U10 | medium |

**Recommendation:** convert to sprint. U1 and U2 should be first; U3–U8 form the professor track; U9–U12 form the student track. Tracks can be parallelized after U1+U2.

---

## U1 — Design System: Shell, Toaster, Loading

**Side:** both | **Token:** medium

### Goal
Replace placeholder layouts with a real shell. Establish reusable patterns: top bar with breadcrumbs, sidebar with role-aware nav, global toaster, page-level loading skeletons, error boundaries.

### Files
- `src/app/layout.tsx` (modify) — mount global Toaster from sonner
- `src/app/(dashboard)/layout.tsx` (modify) — wrap children in shell
- `src/app/(dashboard)/professor/layout.tsx` (modify) — replace placeholder sidebar with real nav
- `src/app/(dashboard)/student/layout.tsx` (create) — student variant
- `src/components/shell/sidebar.tsx` (create) — role-aware sidebar; takes `role: 'professor' | 'student'` and `courseContext?: { id, title }` for nested nav
- `src/components/shell/top-bar.tsx` (create) — breadcrumbs + user menu (sign out, role switcher for dev)
- `src/components/shell/breadcrumbs.tsx` (create) — derives crumbs from `usePathname()` + an optional override
- `src/components/shell/page-header.tsx` (create) — `<PageHeader title actions?>` reusable header for content pages
- `src/components/shell/empty-state.tsx` (create) — `<EmptyState icon? title description action?>` for "no data yet" panes
- `src/components/shell/loading-skeleton.tsx` (create) — primitive skeletons (card, list-row, text-line)
- `src/lib/utils/breadcrumb-context.tsx` (create) — small Context for pages to inject custom labels (e.g., course title instead of UUID)

### Design decisions

**Sidebar structure** (collapsible to icon-only on smaller widths):
- Professor:
  - Courses (top-level)
  - When in a course: nested under "Current Course" — Overview, Materials, Plan, Labs, Instances
- Student:
  - My Courses (top-level)
  - When in a course: nested — Overview, Labs (flat list grouped by module)

**Top bar:**
- Left: breadcrumbs (`Courses › Quantum Computing › Plan`)
- Right: user menu (avatar, name, sign out)
- Sticky, ~56px high

**Breadcrumb labels:**
- Default labels derived from path segments (titlecased)
- Pages can inject real labels via `BreadcrumbContext.Provider value={{ '[courseId]': 'Quantum Computing' }}` so users see names not UUIDs

**Toaster:**
- Use `sonner` (already installed). Mount once in root `layout.tsx`. Rich variants: success / error / loading / promise.
- Wrap heavy server-action calls with `toast.promise(...)` for built-in pending → resolved messaging.

**Loading skeletons:**
- Use Next.js `loading.tsx` co-located with pages for route-level loading
- `loading-skeleton.tsx` exports `<SkeletonCard />`, `<SkeletonRow />`, `<SkeletonText lines={n} />`

**Error boundaries:**
- Add `error.tsx` at `(dashboard)/error.tsx` — friendly fallback with retry, never raw stack
- Materials page already has inline error state — keep it but additionally `toast.error` on action failures

### Acceptance
- Sidebar renders for both roles with correct active link state
- Breadcrumbs show real names (course title, not UUID) when context is injected
- Toast appears on any save/delete in materials and plan pages
- `/professor/courses` shows a skeleton during loading

---

## U2 — Auth Stub Helper + Role-Aware Redirects

**Side:** both | **Token:** small

### Goal
Centralize the "who's logged in and what role" lookup. Currently scattered across server actions. Provide a clean redirect pattern: unauthed → `/login`, wrong role → their dashboard.

### Files
- `src/lib/auth.ts` (create) — exports `getCurrentUser()`, `requireProfessor()`, `requireStudent()`. Each throws or redirects.
- `src/app/login/page.tsx` (create) — dev-only login: lists seeded users, click to set a session cookie. **Document that this is replaced by SSO later.**
- `src/middleware.ts` (create or modify) — redirect unauthed users from `(dashboard)/*` to `/login`. Allow `/`, `/login`, `/join/*` through.
- `src/types/auth.ts` (create) — `UserRole = 'professor' | 'student'`. Role determination logic: a user is "professor" if they own ≥1 course or are in `course_staff` with role=professor. "student" if only in `enrollments`. Both is possible — default professor.

### Schema tables
- `users`, `courses`, `course_staff`, `enrollments`

### Design decisions
- Role is derived, not stored on `users` row — a user can be a professor in one course and a student in another. The dashboard sidebar lets them switch context.
- For pilot, the dev login dropdown bypasses auth entirely. **Real SSO is a separate sprint** (Supabase Auth + SAML for Miami).
- `requireProfessor()` and `requireStudent()` redirect, not throw, when used in server components. Server actions still throw `'Unauthorized'`.

### Acceptance
- Visiting `(dashboard)/*` while unauthed redirects to `/login`
- Login page lists seeded users and switching changes the session
- `requireProfessor()` redirects students away from professor routes

---

## U3 — Professor Course List + Create

**Side:** professor | **Token:** medium

### Goal
Professor's "home base." Lists courses they own or staff. "Create New Course" CTA front and center.

### Files
- `src/app/(dashboard)/professor/courses/page.tsx` (create) — server component, fetches courses
- `src/app/(dashboard)/professor/courses/new/page.tsx` (create) — server component renders `CourseCreateForm`
- `src/components/professor/course-create-form.tsx` (create) — client component, calls `createCourse` action
- `src/components/professor/course-card.tsx` (create) — displays one course with quick stats
- `src/lib/actions/courses.ts` (create) — `createCourse({ title, subjectArea, description? })`, `listCoursesForProfessor()`, `getCourse(id)`

### Schema tables
- `courses` (lines 79-92), `modules`, `labs` (for stats), `course_instances`, `enrollments` (for student count)

### Server Action contracts
```ts
createCourse(input: {
  title: string                  // required, min 3
  subjectArea?: string           // free text, optional, max 100
  description?: string           // optional, max 1000
}): { success: true, courseId } | { success: false, error }

listCoursesForProfessor(): {
  success: true,
  courses: Array<{
    id, title, description, subject_area, created_at,
    module_count, lab_count, active_instance_count, enrolled_student_count
  }>
} | { success: false, error }
```

### Stat aggregation
Use a single SQL query with `count()` over joined tables — don't N+1. If RLS gets in the way, do this in a Server Action with the admin client.

### Empty state
"You haven't created any courses yet. Click 'New Course' to get started." Single CTA button.

### Card content (per course)
- Title (link to `/professor/courses/[id]`)
- Subject area as a badge
- "{N modules · N labs · N students enrolled}" muted line
- Generation status pill if there's an active plan: "Plan in review" / "Generating" / "Ready"
- Right-aligned: "Open" button

### Acceptance
- List renders all courses owned by current user
- Empty state visible when no courses
- "New Course" form validates with Zod, shows toast, redirects to course home on success
- Stats accurate

---

## U4 — Professor Course Home (Overview)

**Side:** professor | **Token:** medium

### Goal
The single page that summarizes a course and surfaces "what to do next." Not a wall of data — a guided overview.

### Files
- `src/app/(dashboard)/professor/courses/[courseId]/page.tsx` (create) — server component
- `src/components/professor/course-overview.tsx` (create) — composition of widgets
- `src/components/professor/next-step-card.tsx` (create) — dynamic CTA based on course state

### Schema tables
- `courses`, `source_materials`, `generation_plans`, `generation_jobs`, `modules`, `labs`, `course_instances`, `enrollments`

### Page sections
1. **Header**: Course title (editable inline), subject area badge, "Course Settings" dropdown (rename, delete)
2. **Next Step card** (top, prominent): One CTA based on state:
   - No materials → "Upload course materials to begin" → button to materials page
   - Materials uploaded, parsing → "Parsing X of Y materials..." with progress
   - Parsing done, no plan → "Plan being proposed..." (auto-progresses)
   - Plan in draft → "Review and approve your generation plan" → link to plan
   - Plan generating → "Generating N labs (X of N complete)" → link to labs
   - Labs ready, no instance → "Create a course instance to share with students" → link to instances
   - Instance live → show join code prominently
3. **Pipeline status grid**: 4 small cards — Materials (count), Plan (status), Labs (count + status), Students (enrolled count)
4. **Recent activity** (optional, defer if time short): list of last 5 generation_jobs with timestamps

### Design decisions
- The "Next Step" card is the most important UX element. It removes the need for the professor to know what to do next — the app tells them.
- Course header rename uses optimistic UI + toast.
- Pipeline status grid links each cell to its detail page.

### Acceptance
- Next Step card displays the correct state for: empty course / parsing / plan-draft / generating / live
- Course title is renamable inline
- Pipeline grid links work
- Course title appears in breadcrumb (via BreadcrumbContext)

---

## U5 — Materials Page Polish

**Side:** professor | **Token:** medium

### Goal
The materials page already works. Polish it: toast feedback, clearer "what's next" CTA, link to plan when parse is done.

### Files (modify only)
- `src/components/material-upload.tsx` — replace inline error/success with toasts; show progress percent during upload (already shows "Uploading...")
- `src/components/material-list.tsx` — toast on delete success/error; add "Continue to Plan Review →" CTA when ALL materials show `completed` status; show estimated time remaining for running jobs (based on `progress_percent` + elapsed time, rough)
- `src/app/(dashboard)/professor/courses/[courseId]/materials/page.tsx` — use `<PageHeader>` from U1, inject course title into BreadcrumbContext

### Design decisions
- Don't add an "attach to plan" UI here — the plan editor itself handles material assignment (see U6). Materials page is purely about uploading.
- The "Continue to Plan Review →" CTA appears once all parses succeed. If a plan already exists with status='draft', the CTA reads "Review proposed plan →" instead.

### Acceptance
- Toast on upload success, delete success, delete error
- "Continue to Plan Review" CTA appears at correct time
- Course title in breadcrumb

---

## U6 — Plan Editor Polish

**Side:** professor | **Token:** large

### Goal
Take the existing plan editor from "functional" to "good." Fix the source-material attachment gap (currently invisible to the professor), wire per-lab progress badges to real lab IDs, add drag-to-reorder.

### Files
- `src/components/plan-review/plan-editor.tsx` (modify) — fetch real `labs` rows when `status='generating'` and map by `lab.position` within `module.position` to populate `jobStatusByLabIndex`
- `src/components/plan-review/lab-card.tsx` (modify) — replace "{N source(s)}" muted text with actual source-material chips (filename), each with an "x" to detach; add a "+ Source" picker to attach
- `src/components/plan-review/module-card.tsx` (modify) — add drag handle to module header for module reordering
- `src/components/plan-review/source-picker.tsx` (create) — Popover with checklist of available `source_materials` for the course
- `src/components/plan-review/sortable-list.tsx` (create) — small wrapper around `@dnd-kit/sortable` for module/lab reordering
- `src/lib/actions/generation.ts` (modify) — add `getLabsForCourse(courseId)` helper for the realtime mapping
- `package.json` (modify) — add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

### Schema tables
- `generation_plans`, `source_materials`, `labs`, `modules`, `generation_jobs`

### Design decisions
- **Source-material attachment is the biggest UX gap currently.** The plan editor stores `source_material_ids` per lab but provides no UI to set them. The AI's initial proposal includes IDs, but professors who add new labs manually have no way to attach materials. Add the source-picker.
- **Drag reorder**: use `@dnd-kit` (lighter and more accessible than `react-beautiful-dnd`). Reorder triggers a local state update + auto-save (no Save button needed for reorder — it should feel immediate).
- **Per-lab progress mapping**: after approval, fetch the `labs` rows once, build a map of `{ moduleIdx, labIdx } → lab_id`, then look up `labJobs[lab_id]`. Pass into `<ModuleCard jobStatusByLabIndex>`.
- **Save semantics**: keep "Save Draft" button explicit for content edits (titles, concepts, Bloom's). Reorder + source attach autosave silently with toast.
- **Confirmation dialog**: enrich with a list of labs that have **no source_materials attached** as a warning — those labs will fail or generate from nothing. Allow approval to proceed but warn loudly.

### Acceptance
- Source-material chips appear on each lab card with detach button
- Source picker popover opens, lists course materials, multi-select adds to lab
- Drag handles let user reorder modules and labs within a module
- After approval, per-lab progress bars update in real-time with correct lab title
- Approval dialog warns about labs with no source materials

---

## U7 — Lab List + Minimal Lab Detail (Professor)

**Side:** professor | **Token:** medium

### Goal
Once labs are generated, the professor needs to see them, preview them, and trigger regeneration if needed. This page exists even when generation is incomplete (shows in-progress).

### Files
- `src/app/(dashboard)/professor/courses/[courseId]/labs/page.tsx` (create) — server component, lists labs grouped by module
- `src/app/(dashboard)/professor/courses/[courseId]/labs/[labId]/page.tsx` (create) — lab detail / preview
- `src/components/professor/lab-list-item.tsx` (create) — one row per lab with status badge, concept count, action menu
- `src/components/professor/lab-preview.tsx` (create) — renders `lab.content.sections[]` Bloom's-grouped, read-only
- `src/lib/actions/labs.ts` (create) — `listLabsForCourse(courseId)`, `getLab(labId)`, `regenerateLab(labId)` (creates a new generate_lab job)

### Schema tables
- `labs` (lines 158-178), `concepts`, `modules`, `generation_jobs`

### Design decisions
- Group by module visually (module title as section header, labs underneath)
- Status badge per lab matches the `labs.generation_status` enum
- Lab detail page has 3 tabs: **Content** (rendered preview), **Concepts** (list of approved/proposed concepts), **Source Materials** (chips). Editing content is **out of scope** for this sprint (defer).
- "Regenerate" button on lab detail confirms (cost), then creates a new generate_lab job with the same lab_id (worker overwrites).
- If `generation_status='failed'`, show error from the most recent `generation_jobs` row and a clear "Retry" button.

### Acceptance
- Lab list renders all labs grouped by module
- Each lab shows generation status
- Lab detail renders content sections in Bloom's order
- Concepts tab lists concepts with their `status`
- Regenerate creates a new job and toasts confirmation

---

## U8 — Course Instance Management

**Side:** professor | **Token:** small

### Goal
Professor needs to create a `course_instance` for each semester and share the join code with students. Minimal UI.

### Files
- `src/app/(dashboard)/professor/courses/[courseId]/instances/page.tsx` (create) — server component, lists instances
- `src/components/professor/instance-create-dialog.tsx` (create) — dialog with semester input
- `src/components/professor/instance-card.tsx` (create) — instance row with join code (copy button), enrolled student count, deactivate toggle
- `src/lib/actions/instances.ts` (create) — `createInstance({ courseId, semester })`, `listInstances(courseId)`, `toggleInstanceActive(instanceId)`

### Schema tables
- `course_instances` (lines 95-107), `enrollments`

### Server Action: `createInstance`
- Generates a unique short alphanumeric `join_code` (8 chars, base32 — exclude ambiguous chars like 0/O, 1/l). Retry on collision.
- Builds `join_link = https://trymuto.com/join/{code}` (or `${env.NEXT_PUBLIC_SITE_URL}/join/{code}` for dev).
- Inserts row, creates `course_staff` entry for the creating professor with role='professor', can_edit_structure=true.

### Card content
- Semester label
- Join code in big mono font + copy button
- Join link with copy button
- Student count
- Active/deactivated toggle

### Acceptance
- Create instance dialog generates a code, persists, appears in list
- Copy buttons copy code/link to clipboard with toast
- Deactivate toggle persists; deactivated instances reject new joins (enforced in U9)

---

## U9 — Student Join Flow + Course Home

**Side:** student | **Token:** medium

### Goal
The student journey starts at `/join/[code]`. They land, see the course title, hit "Join," become enrolled, and land on their course home.

### Files
- `src/app/join/[code]/page.tsx` (create) — server component, looks up instance by code, shows preview + Join button
- `src/components/student/join-card.tsx` (create) — client component showing course info + Join action
- `src/app/(dashboard)/student/courses/page.tsx` (create) — student's enrolled courses
- `src/app/(dashboard)/student/courses/[instanceId]/page.tsx` (create) — student course home: modules → labs tree
- `src/components/student/course-tree.tsx` (create) — accordion of modules with lab links
- `src/components/student/lab-row.tsx` (create) — one lab with title, completion indicator, "Open" link
- `src/lib/actions/enrollment.ts` (create) — `joinCourse({ joinCode })`, `listMyEnrollments()`, `getStudentCourseView(instanceId)`

### Schema tables
- `course_instances`, `enrollments`, `courses`, `modules`, `labs`, `review_sessions`

### Server Action: `joinCourse`
- Looks up instance by code (case-insensitive)
- Returns error if instance not found, deactivated, or user already enrolled (return success in the latter case to be idempotent)
- Inserts `enrollments` row
- Returns `{ success: true, instanceId, courseTitle }`

### Server Action: `getStudentCourseView`
- Returns: `{ course, instance, modules: [{ ...module, labs: [{ ...lab, last_review_session?, mastery_summary? }] }] }`
- `mastery_summary` is optional aggregation; defer if complex. Initially just show "Started" / "Not started" based on whether a `review_session` exists.

### Design decisions
- Join page works whether or not user is logged in. If unauthed, redirect to `/login?next=/join/[code]`. If authed, show the join card.
- Student course home uses an accordion (modules collapsible). Each lab is a one-line row. Labs that the student has started have a small "Started" or "Mastered" indicator (defer mastery calc to a later sprint; "Started" is enough for now).

### Acceptance
- `/join/CODE123` shows course preview
- Joining creates an enrollment, redirects to student course home
- Re-joining (already enrolled) just redirects (no error)
- Deactivated instance shows "This course is no longer accepting enrollments"
- Student course home renders modules + labs

---

## U10 — Student Lab Content Viewer

**Side:** student | **Token:** medium

### Goal
A clean, focused reading experience for `lab.content.sections[]`. Bloom's-structured (the data already supports this; just render it well).

### Files
- `src/app/(dashboard)/student/courses/[instanceId]/labs/[labId]/page.tsx` (create) — server component, fetches lab content
- `src/components/student/lab-viewer.tsx` (create) — renders sections with Bloom's-level headers
- `src/components/student/lab-toc.tsx` (create) — sticky table-of-contents sidebar (jump to section)
- `src/components/student/lab-action-bar.tsx` (create) — bottom-of-page bar: "Take Knowledge Review" + "Ask the Tutor" buttons
- `src/lib/actions/student-lab.ts` (create) — `getLabForStudent({ instanceId, labId })` — verifies enrollment + lab belongs to the course

### Schema tables
- `labs` (lines 158-178), `enrollments`, `modules`, `courses`, `course_instances`

### Render strategy
- `lab.content.sections` is an array of `{ blooms_level, heading, body }`. Render each section with:
  - A Bloom's-level pill (small, colored by level)
  - The heading as `<h2>`
  - The body as Markdown (use `react-markdown` or `marked` — install if not present; specify in plan)
- Group adjacent sections with the same Bloom's level under a single divider

### Design decisions
- **Defer math/code rendering**: lab body is Markdown but math and code blocks need KaTeX/Prism. Note as a follow-up but render plain Markdown for now (which still handles fenced code blocks visibly, just not syntax-highlighted).
- **TOC**: sticky on desktop, collapsible on smaller screens
- **Action bar**: fixed at bottom of viewport. Two primary actions: take review, open chat.
- **Reading progress**: scroll-spy highlights the current section in TOC. Optional polish — defer if time short.

### Acceptance
- Lab content renders in Bloom's order
- TOC links jump to sections
- Action bar visible with both CTAs
- Page enforces enrollment (non-enrolled users get redirect)

---

## U11 — Student Knowledge Review Take Flow

**Side:** student | **Token:** large

### Goal
The most important student surface. A focused, one-question-at-a-time UI for free-text answers. Submission triggers async evaluation (worker job — but the take flow itself just persists responses).

### Files
- `src/app/(dashboard)/student/courses/[instanceId]/labs/[labId]/review/page.tsx` (create) — server component, kicks off or resumes a review session
- `src/components/student/review-runner.tsx` (create) — client component, the question-by-question UI
- `src/components/student/review-question-card.tsx` (create) — single question display with text area
- `src/components/student/review-progress-bar.tsx` (create) — N of M questions
- `src/components/student/review-completion-card.tsx` (create) — "Review submitted! Results coming soon." with link back to lab
- `src/components/student/review-results-card.tsx` (create) — once `concept_evaluations` arrive (poll or realtime), show qualitative `reasoning` per question
- `src/lib/actions/reviews.ts` (create):
  - `startOrResumeReview({ instanceId, labId })` — creates `review_sessions` row, returns first unanswered question + queued question list
  - `submitReviewResponse({ sessionId, questionId, answerText })` — inserts `review_responses` row, returns next question or completion signal
  - `completeReview({ sessionId })` — sets `completed_at`, enqueues an evaluate_review job (job_type to be defined)
  - `getReviewResults({ sessionId })` — returns `concept_evaluations` joined with questions for display

### Schema tables
- `review_sessions` (lines 279-294), `review_questions` (lines 256-275), `review_responses` (lines 297-308), `concept_evaluations` (lines 311-332), `enrollments`

### Question selection logic (defer adaptive — use simple version for now)
- For first iteration: just return all `is_active=true` questions for the lab in `position` order
- Note in plan: adaptive selection (target weak concepts, unassessed Bloom's levels) is a future enhancement that lives entirely in `startOrResumeReview`

### UX flow
1. Student lands on review page
2. If active session exists (no `completed_at`), resume from first unanswered question
3. Question renders: question text, large textarea, "Submit Answer" button (disabled until non-empty)
4. Submit → optimistic advance to next question, persist answer in background, toast on error (allow retry)
5. After last answer, show completion card: "Your answers are being evaluated. We'll show feedback as it's ready."
6. Realtime subscription on `concept_evaluations` filtered by `enrollment_id` — as evaluations arrive, populate the results card with `reasoning` (the student-facing text)
7. Results card shows: question, your answer, AI reasoning, mastery as a soft visual ("Strong understanding" / "Some gaps" — never show the raw 0.7 score; keep the score professor-only per SCHEMA notes)

### Design decisions
- **No timer** — Knowledge Reviews are formative, not high-stakes
- **Optimistic submit** with rollback on error — feels fast
- **Results poll fallback**: if Realtime fails, poll every 5s for 60s
- **Privacy of mastery_score**: per SCHEMA line 330, mastery_score is professor-facing only. Surface only `reasoning` to students. Use a qualitative bucket UI ("On track" / "Review this concept") derived from mastery but don't show the number.
- **Knowledge Review vs Chatbot split**: per CLAUDE.md, this is the structured measurement instrument. Make sure no chat UI bleeds in here.

### Acceptance
- Student can start a review, answer questions one at a time, submit
- Resume works if they refresh mid-review
- Completion card appears after last question
- Evaluations stream in via Realtime and render qualitative feedback
- No raw mastery scores shown to student

---

## U12 — Student Chatbot UI Shell

**Side:** student | **Token:** medium

### Goal
The chat surface — UI only. Backend RAG is a separate task. This sprint mounts the chat UI, wires send/receive messages, and persists to `chat_messages`. Assistant replies can be **stubbed** initially.

### Files
- `src/app/(dashboard)/student/courses/[instanceId]/labs/[labId]/chat/page.tsx` (create) — server component, finds-or-creates chat session
- `src/components/student/chat-window.tsx` (create) — client component, message list + composer
- `src/components/student/chat-message-bubble.tsx` (create) — student vs assistant styles
- `src/components/student/chat-composer.tsx` (create) — textarea + send button, Enter to send / Shift+Enter for newline
- `src/lib/actions/chat.ts` (create) — `getOrCreateChatSession({ instanceId, labId })`, `sendChatMessage({ sessionId, content })`

### Schema tables
- `chat_sessions` (lines 372-383), `chat_messages` (lines 386-399), `enrollments`, `labs`

### Server Action: `sendChatMessage`
- Validates rate limit (per CLAUDE.md: 50/hour, 300/day — enforced via `src/lib/rate-limit.ts`, which the agent should check exists or stub)
- Inserts student message
- **Stub assistant response for now**: insert a placeholder `'assistant'` message saying "RAG-based responses coming soon. For now, your message is logged." 
- Real RAG implementation is a separate task — note in code with `// TODO: RAG via content_embeddings (separate sprint)`
- Returns the assistant message

### Design decisions
- **Don't block on RAG**: ship the UI shell with stubbed responses so professors can demo the surface even before RAG works
- **Rate limit display**: if the rate limiter blocks, surface a clear toast: "You've reached your hourly chat limit. Resets at HH:MM."
- **Realtime**: subscribe to `chat_messages` filtered by session for streaming feel (when RAG eventually streams)
- **Message persistence**: every send persists immediately; messages are durable across page reloads

### Acceptance
- Chat page renders with message history if session exists
- Sending a message persists it and shows a stub assistant reply
- Rate limit blocks with a clear toast (manual test by hitting limit in dev)
- Realtime updates in the message list

---

## Cross-Cutting Concerns

### Toast usage convention
- Success: `toast.success(...)` — saves, deletes, copies
- Error: `toast.error(...)` — server action failures, validation errors not handled inline
- Promise: `toast.promise(promise, { loading, success, error })` — for any action >300ms

### Loading states
- Route-level: `loading.tsx` co-located with page
- Component-level: `<SkeletonCard />` or inline `Loader` icon
- Never show empty page with no indicator

### Empty states
Use `<EmptyState>` from U1. Pattern: icon (optional) + 1-line title + 2-line description + 1 primary action. Example:
- "No materials yet" / "Upload a PDF, DOCX, or PPTX to start generating labs." / "Upload"

### Error states
- Inline errors stay (e.g., "Course not found") for context-rich situations
- Catastrophic errors → `error.tsx` boundary
- Action errors → `toast.error` — never a silent failure

### Accessibility minimums
- All form inputs have associated `<Label>`
- Buttons have `aria-label` where text is icon-only
- Focus-visible states for all interactive elements
- No color-only signaling (status badges include text)

### Performance
- Server components by default; client components only when needed
- Stat aggregation in single SQL queries, not N+1
- Realtime subscriptions cleaned up in `useEffect` return

---

## RLS Considerations

For this plan to work, RLS policies need to permit:

| Table | Read | Write |
|---|---|---|
| `courses` | owner OR staff in any of its instances | owner only |
| `course_instances` | owner OR staff OR enrolled student | owner only |
| `course_staff` | self OR owner of the course | owner only |
| `enrollments` | self OR owner/staff of the instance | self (insert via joinCourse), owner (delete) |
| `modules`, `labs` | course owner OR staff OR enrolled student | course owner only |
| `concepts`, `review_questions` | course owner OR staff OR enrolled student | course owner only |
| `review_sessions`, `review_responses`, `concept_evaluations` | self (student) OR course owner/staff | self (student insert) |
| `chat_sessions`, `chat_messages` | self (student) OR course owner/staff (read-only) | self only |
| `source_materials`, `content_blocks`, `content_embeddings` | course owner OR staff | server actions only (admin client) |
| `generation_jobs`, `generation_plans` | course owner OR staff | server actions only |

If S1's migration doesn't already cover all of these, U2 should include a migration that adds them. The implementing agent should verify with `psql` or by checking `supabase/migrations/` before assuming.

---

## Visual Identity Notes (lightweight)

Don't over-design — pilot at one institution. Stick with shadcn defaults:
- Primary color: deep blue (Tailwind `blue-700`-ish via shadcn theme)
- Mono font: default `font-mono` for join codes, costs
- Bloom's-level color palette (suggest, finalize during U1):
  - remember: gray-500
  - understand: blue-500
  - apply: green-500
  - analyze: yellow-500
  - evaluate: orange-500
  - create: purple-500
- Status colors: pending=yellow, running=blue, completed=green, failed=red, cancelled=gray (already used in materials list — keep consistent)

---

## Recommended Execution Order

1. **U1 + U2** (shell + auth stub) — blocks everything else, do first
2. **U3 + U9** can run in parallel (professor list / student join — different surfaces)
3. **U4** (course home) — depends on U3
4. **U5 + U6** can run in parallel (materials polish + plan polish — separate files)
5. **U7 + U8** can run in parallel (lab list + instances)
6. **U10** (student lab viewer) — depends on U9, can run in parallel with professor track
7. **U11 + U12** (review + chat) — depend on U10

Estimated 11 subtasks total. Not implementable in a single sitting — convert to `/sprint ux-optimization` for tracked, dependency-graphed execution.

---

## Open Questions for the User Before Sprinting

1. **Does the professor's "course home" need an analytics widget now**, or can insight reporting be a separate later sprint? (Current plan: defer.)
2. **Should regeneration of a lab cost-charge again** or is the cost already paid at approval? (Affects U7's regenerate UX.) Current plan: re-charge.
3. **For the student review flow, do we want adaptive question selection now** or is "all questions in order" acceptable for v1? (Current plan: defer adaptive.)
4. **Math rendering in lab content** — required for quantum computing pilot. KaTeX install and integration in U10? (Current plan: defer to follow-up. Quantum without math is rough.)
5. **Multi-tenant institution UI** — does the professor see institution branding/scope, or is that invisible for the pilot? (Current plan: invisible — single institution per dev environment.)

Answer these before `/sprint` so the breakdown reflects real scope.
