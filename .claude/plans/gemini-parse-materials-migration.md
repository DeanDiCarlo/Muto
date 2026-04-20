# Worker OOM Fix → Migrate `parse_materials` to Gemini File API

## Context

The first end-to-end upload triggered SIGKILL 137 (Railway's OOM killer) mid-`parse_materials`. The current pipeline rasterizes every PDF page to a 1500–2000px PNG, accumulates all pages in memory (`pages: Uint8Array[]`), then sends each base64-encoded page to Claude Sonnet 4 as a vision input. The accumulator alone is 30–60MB on a 30-page PDF, plus pdfjs-dist working memory + the original PDF buffer — peak easily blows past the 512MB free-tier cap.

A streaming/scale patch could keep us on Claude vision. It's not what we want. The right long-term answer is Gemini's native file upload API:

- **Memory**: no rasterize, no PNG buffers, no `scale` tradeoff. We upload the PDF bytes once and pass a file reference in the generateContent call. Peak RAM drops to ~PDF size + small working set.
- **Cost**: Gemini 2.5 Flash is ~7× cheaper than Claude Sonnet 4 for this task (detail below). Scaling economics only work at those rates.
- **Speed**: one `generateContent` call processes the whole doc vs N sequential Claude calls. Lower wall time, lower Railway exec minutes.
- **Image understanding**: Gemini natively handles figures, diagrams, tables, and equations inside PDFs — same vision capability we had with Claude, without us re-rendering pixels. Standalone image uploads (PNG/JPEG) also go through the same Files API.

Status of the zombie job from the crash: the runner (`worker/lib/job-runner.ts:57-64`) only polls `status='pending'`, so the stuck `running` row isn't re-claimed — no crash loop — but nothing cleans it up either. A boot-time sweep closes that loop permanently.

## Provider choice: Gemini 2.5 Flash

Flash vs Pro for parsing:
- **Flash**: $0.30/M input, $2.50/M output. Vision-capable. Plenty accurate for "extract text/structure from textbook page into labeled JSON blocks" — this is not a reasoning-heavy task.
- **Pro**: $1.25/M input, $10/M output. Reserve for lab generation (Stage 2) where structured reasoning matters.

Split model usage: **Flash for parse_materials, Pro for generate_lab.** Two env vars already exist shape-wise (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` per CLAUDE.md); we're adding `GEMINI_API_KEY`.

## Scope limits — DOCX/PPTX handling

Gemini's Files API supports PDF, images, text, audio, video — **not DOCX/PPTX natively**. The upload UI currently accepts those types. This plan handles **PDF + PNG + JPEG** only. DOCX/PPTX goes into tech-debt entry #5 (options: server-side convert-to-PDF via LibreOffice in the Dockerfile, or text-extract via `mammoth`/`pptx-parser` losing visual content). We continue to accept the uploads in the UI but surface a clear "format not yet supported" failure message until a follow-up plan addresses them.

## Cost comparison (per-document, current published rates)

Assumed workload: 100-page textbook PDF, ~1000 output tokens per page of structured JSON.

| Model | Input tokens | Output tokens | Input $ | Output $ | **Total** |
|---|---|---|---|---|---|
| **Claude Sonnet 4 (current, vision)** | ~180k (100 imgs × 1568 + prompts) | ~100k | $0.54 | $1.50 | **$2.04** |
| **Gemini 2.5 Pro (file API)** | ~125k (PDF-optimized tokenization) | ~100k | $0.156 | $1.00 | **$1.16** |
| **Gemini 2.5 Flash (file API)** ⭐ | ~125k | ~100k | $0.0375 | $0.25 | **$0.29** |

Per-course projection (3 source docs × 50 pages avg = 150 pages of parsing):

| Pipeline | Parse cost / course | Notes |
|---|---|---|
| Claude Sonnet 4 vision | ~$3.06 | current |
| Gemini 2.5 Flash | ~**$0.44** | ~7× cheaper |

Lab generation (Stage 2) and chatbot costs are orders of magnitude larger than parse, so the total per-course LLM cost matters more than parse alone. But parse is the loop that OOMs today, and it's also the most image-token-heavy step — biggest easy win.

**Rates need re-checked before implementation** — the numbers above are from memory of mid-2025 pricing pages. Pull current Gemini pricing + verify Claude rates at the top of the implementation session.

## Railway tier recommendation

With Gemini file-API parsing, free tier (512MB RAM) should handle all typical uploads. Peak memory estimate for a 50MB PDF: ~80–100MB during upload, drops back to ~50MB during generateContent wait.

Stay on **free tier** until one of:
1. Multiple concurrent `parse_materials` jobs start overlapping regularly (pilot scale shouldn't hit this).
2. Worker execution hours exceed 500/month (500 hrs ≈ 20 days 24/7 — a polling worker uses this budget only when actively processing; idle polling is minimal).
3. A batch upload triggers the need for parallelism we currently don't have.

At that point, Railway Hobby ($5/mo base + usage-metered compute, typically $5–15/mo for this workload) is the next step. Fly.io and Render have comparable tiers if Railway becomes a friction point.

## Break-even framing for scaling

Per-course LLM cost estimate with Gemini-based pipeline:

| Stage | Est. cost per course |
|---|---|
| parse_materials (150 pages) | $0.44 |
| generate_lab (5 labs × Gemini Pro) | $3–6 |
| generate_embeddings (pgvector) | $0.01 |
| Chatbot (semester-long student usage, ~500 msgs) | $0.50–2 |
| **Total LLM cost per course** | **~$4–8** |

Infrastructure (Supabase free → pro, Vercel hobby → pro, Railway free → hobby) adds a fixed ~$50–75/mo base once you outgrow free tiers.

Back-of-envelope break-even: at $75/course/semester pricing, gross margin per course ≈ $67–71, or ~90%. That's the target business model and Gemini parse is a prerequisite for it. Claude-Sonnet-vision pricing would cut that margin by ~$2.60/course, or ~3-4 points — not fatal alone, but compounds badly across 3 LLM steps per course.

## Files to modify

| File | Change |
|---|---|
| `worker/package.json` | Add `@google/generative-ai` to `dependencies`. |
| `worker/lib/gemini.ts` *(new)* | Exports `geminiFlash` and `geminiPro` client instances, shape-mirrored on existing `worker/lib/supabase.ts` pattern. |
| `worker/processors/parse-materials.ts` | Remove `pdf-to-img` import, accumulator, and Claude vision loop. Replace with: (1) detect file type from material's `file_type`, (2) upload to Gemini Files API, (3) single `generateContent` call with structured JSON output schema, (4) parse response into `content_blocks` rows. Keep the existing `extractJson`, `buildParsePrompt`, and schema-validation path — just change the provider. |
| `worker/lib/cost-tracker.ts` | Add Gemini pricing constants + a cost calc path for the new usage entries. Reuse existing `trackUsage` signature. |
| `worker/lib/job-runner.ts` | Export new `sweepStuckJobs()` that marks `status='running' AND started_at < now - 10min` as `failed` with a clear error message. |
| `worker/index.ts` | Call `sweepStuckJobs()` once before the poll loop starts. |
| `.env.local.example` | Add `GEMINI_API_KEY=` (worker) and document. |
| `CLAUDE.md` | Update the Environment Variables section: add `GEMINI_API_KEY`. Update the "Generation Pipeline Architecture" paragraph to note parse_materials uses Gemini Flash. |
| `tasks/tech-debt.md` | Append entry #4: pdf-to-img removed; entry #5: DOCX/PPTX server-side conversion still open. |

No database schema changes. The existing `content_blocks` insert flow is provider-agnostic.

## Railway env var change (manual, UI)

Add `GEMINI_API_KEY` to the Railway worker service's Variables tab. Same value goes to Vercel if any Next.js route ever needs it (not today).

## Existing utilities to reuse

- `trackUsage(...)` — `worker/lib/cost-tracker.ts` — unchanged signature; we just pass new model names + cost numbers.
- `parsedPageSchema`, `parseMaterialsPayloadSchema` — `@muto/shared/generation` — unchanged; output shape is still structured JSON blocks.
- `updateProgress(jobId, pct, step)` — `worker/lib/job-runner.ts:161` — still called, just at coarser granularity (upload, generate, parse, insert) since we no longer loop per page.
- `extractJson` in `parse-materials.ts` — keep it as a belt-and-suspenders fallback for Gemini responses, even though we'll use response schema mode where possible.

## Implementation approach for `parse-materials.ts`

Rough shape (fill in types against actual Gemini SDK):

```ts
// 1. Download from Supabase Storage (unchanged)
// 2. Validate file_type — only PDF/PNG/JPEG proceed; DOCX/PPTX throw
//    "DOCX/PPTX parsing not yet supported — see tasks/tech-debt.md #5"
// 3. Upload to Gemini Files API
const fileRef = await geminiFiles.upload({ file: buffer, mimeType: material.file_type })

// 4. One generateContent call with a structured output schema
const response = await geminiFlash.generateContent({
  contents: [{ role: 'user', parts: [
    { fileData: { fileUri: fileRef.uri, mimeType: fileRef.mimeType } },
    { text: buildParsePrompt() }, // reuse existing prompt, drop the per-page wording
  ]}],
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: parsedDocumentSchema,  // new — whole-doc array of pages-of-blocks
  },
})

// 5. Parse & validate into content_blocks rows (reuse existing batch insert)
// 6. Track usage (Gemini response includes usageMetadata.promptTokenCount, candidatesTokenCount)
// 7. Delete the Gemini file after use (Files API has 48hr auto-expiry but be tidy)
```

Tricky bits to get right on execution:
- The prompt schema needs to shift from "page N" (we were calling per-page) to "whole document, return array of pages with blocks". Schema needs a `pages: [{page_number, blocks: [...]}]` shape.
- Gemini's response schema mode enforces JSON shape but has limits on nesting depth — validate against actual SDK behavior.
- File cleanup: call `geminiFiles.delete(fileRef.name)` after successful parse. On failure, still delete — don't leak.

## Out of scope (intentional)

- **DOCX/PPTX support**: deferred to tech-debt #5.
- **Provider abstraction layer** (swap between Claude/Gemini/etc behind an interface): premature; commit to Gemini for parse, revisit if we need multi-provider failover.
- **generate_lab / generate_embeddings / evaluate_review migration to Gemini**: separate plans. Those processors work today and aren't OOM-ing. Migrate opportunistically as cost data comes in.
- **Raising Railway tier**: not needed with this fix; revisit on real usage signals per the criteria above.
- **Cleaning up the current zombie job row**: the new `sweepStuckJobs()` handles it on next worker boot. No manual SQL needed.

## Verification

1. **Rate-check**: pull current Gemini 2.5 Flash + Pro pricing from `ai.google.dev/pricing` before writing the cost-tracker numbers. Update this plan's cost table if rates have moved.
2. **Local smoke**: `cd worker && GEMINI_API_KEY=... npm run dev`. Trigger via a `generation_jobs` row in Supabase. Memory should stay under 150MB peak (`ps -o rss= -p <pid>`).
3. **Type check**: `cd worker && npm run typecheck` clean.
4. **Build**: `npm run build` at repo root; `docker build .` if validating Dockerfile locally.
5. **Output schema parity**: pick a 10-page PDF already parsed by the old Claude flow (if one exists), rerun under Gemini, diff `content_blocks` rows for structural parity — same block types, similar hierarchy, page numbers correct.
6. **Railway smoke after push**:
   - Boot log should include `[worker] Swept N stuck running jobs` (expect 1 for the current zombie).
   - Upload the same PDF that OOM'd. Log should show `[parse-materials] Uploading to Gemini Files API` → `[parse-materials] Generating content` → completion, no exit 137.
   - Railway metrics: peak memory under 200MB even for the original crashing upload.
7. **Cost-tracking audit**: after a successful parse, query `SELECT * FROM api_usage_log WHERE generation_job_id = ...` — row should exist with `model='gemini-2.5-flash'`, non-zero token counts, and a sane `cost_cents` matching the pricing math.
8. **Zombie cleanup verification**: `SELECT id, status, error_message FROM generation_jobs WHERE id='f4794360-4c0d-42fa-989a-db00d50c0e3e'` → should show `failed` with the sweep message.
