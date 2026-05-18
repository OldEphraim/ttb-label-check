# TTB Label Verification

A take-home prototype for the U.S. Department of the Treasury Alcohol and Tobacco Tax and Trade Bureau (TTB) Compliance Division. Compliance agents currently verify beverage label artwork against the application data in COLA by eye — the prototype automates the field-by-field comparison step. The agent uploads a label image and the expected values from the corresponding application, and the system returns per-field verdicts (PASS / NEEDS_REVIEW / FAIL) with rationale and a small audit thumbnail. It is a standalone tool — no COLA integration, no persisted state — sized to demonstrate the engineering shape of the problem, not to be deployed against production submissions.

## Deployed URL

**https://ttb-label-check.vercel.app** — public; no authentication required for evaluators.

## Quick start

```sh
git clone https://github.com/OldEphraim/ttb-label-check.git
cd ttb-label-check
pnpm install
```

Create `.env.local` at the repo root with your OpenAI key:

```sh
echo "OPENAI_API_KEY=sk-..." > .env.local
```

Run the dev server:

```sh
pnpm dev
```

Then open http://localhost:3000.

## What it does

Single-label verification lives at `/` — upload one label image plus the expected form values, and a verdicts table renders in about five seconds with one row per field. Batch verification lives at `/batch` — submit a CSV of expected values paired with multiple label images, and results stream in row-by-row over Server-Sent Events while the rest of the batch keeps running.

Per-field verdicts come from three tiers: **PASS** when the extracted text matches the agent's expected value, **NEEDS_REVIEW** when the difference is cosmetic enough to plausibly be the same thing (casing, whitespace, punctuation, or substring containment), and **FAIL** when the values clearly diverge. Every verdict carries a one-sentence rationale and a confidence score.

The government warning is handled by a dedicated strict check rather than the generic comparison chain. The vision model assesses four sub-conditions — warning present, exact statutory text, "GOVERNMENT WARNING:" prefix in all caps, prefix visually bold relative to body — and the verifier deterministically reduces those to PASS/FAIL with a rationale identifying any failing sub-check.

Every verdict row includes an audit thumbnail showing the bounding-box region the model attended to when extracting the field. Clicking the thumbnail expands the full label with the box overlaid as a red highlight, so an agent can see at a glance where the system was looking. A small eval suite (`pnpm eval`) runs the pipeline against committed fixtures and reports per-field accuracy.

## Approach and tools

The stack is Next.js 16 with the App Router, TypeScript strict mode, Tailwind CSS, and shadcn/ui primitives on a base-ui foundation, deployed to Vercel. Schemas are defined once in Zod and reused on both sides of the wire: the same `ExpectedValuesSchema` validates the form on the client and re-validates the multipart payload on the server, and the model's structured output is bound to `VerificationResultSchema` via `zodResponseFormat` so the API surface is type-safe end-to-end. Image preprocessing (EXIF rotation, resize to ≤1568 px on the longer side, JPEG q85 re-encode) is handled by `sharp` server-side before the OpenAI call, which cut single-label latency from ~14 s on a native 3.3 MB PNG to ~5–6 s on the same image after normalization.

The vision and extraction model is OpenAI `gpt-5.4-mini`. The take-home brief constrained the model choice to a US-based provider that excludes Anthropic from the deployed runtime, which left OpenAI as the natural fit. Among OpenAI's vision-capable models, `gpt-5.4-mini` is the published recommendation for low-latency, high-volume workloads and benchmarks in our prototype at 5–7 seconds warm round-trip per label — comfortably under the 5-second target Sarah Chen called out as the threshold below which compliance agents would adopt the tool.

The pipeline is a single vision call per label rather than a multi-hop OCR + LLM design. Multi-hop pipelines were a real consideration — they separate text extraction from interpretation, which is appealing for debuggability — but two API hops per label would have made the 5-second budget very hard to defend, and Sarah's interview specifically referenced a prior vendor pilot that was abandoned at 30–40 second response times. One vision call with structured output to the same schema the client validates against is the simplest design that meets the constraint.

## Design decisions

**The NEEDS_REVIEW verdict tier.** Dave Morrison surfaced "STONE'S THROW" on the label versus "Stone's Throw" in the application as the canonical example of a cosmetic mismatch — clearly the same thing, but a strict equality check would call it FAIL. The verifier's comparison chain runs in priority order (exact match → whitespace-only → punctuation-only → case-only → substring containment) and short-circuits at the first match, emitting NEEDS_REVIEW with a rationale identifying the trigger. There's also a low-confidence override: if the model reports PASS but its self-reported confidence is below 0.7, the verifier reclassifies as NEEDS_REVIEW. The tier exists because in compliance work the cost of an agent re-reviewing a clear cosmetic match is much lower than the cost of an auto-reject that turns out to be wrong.

**The Government Warning strict check.** Jenny Park's emphasis was that the warning's exact statutory wording, the all-caps prefix, and the bold rendering all matter independently — a warning that's present but missing the bold prefix is non-compliant. The vision model assesses each of the four sub-conditions and the verifier deterministically combines them: all four true yields PASS, any false yields FAIL with a rationale that lists the failing sub-checks in priority order (presence → exact text → all-caps → bold, most fundamental to most cosmetic). The strict check is folded into the main extraction call rather than a separate API hop, which keeps the latency budget intact while still treating the warning as a special case rather than another field on the comparison chain.

**Audit-trail bounding box thumbnails.** Every verdict comes with a small thumbnail showing the rectangular region the model attended to, clickable to expand the full label with the box overlaid as a red highlight. Compliance decisions need to be defensible — an agent has to be able to show *why* something was flagged, not just that it was — and a verdict without provenance is worse than no verdict. The model's spatial localization is best-effort: tight, well-defined regions like the brand name and warning block are usually correct, but narrow horizontal fields in dense regions (ABV, net contents) can come back oversized. The click-to-expand surfaces this honestly — even when the tight thumbnail crop is imperfect, the expanded view with the box overlay gives the agent the authoritative audit.

## Assumptions and limitations

**ABV is required for every beverage type in this prototype.** REQUIREMENTS.md notes that certain wine and beer products are exempt from the ABV labeling requirement. The prototype does not model that exemption — the form requires ABV unconditionally regardless of the selected beverage type. This is a known simplification, documented here rather than papered over.

**The batch endpoint hits Vercel's 4.5 MB function payload cap before the route runs.** Phase 4.3's scale test discovered this on the first attempt: 50 native-sized sample labels (~3.3 MB each) total ~165 MB on the wire and Vercel's platform proxy rejected the request with HTTP 413 (`FUNCTION_PAYLOAD_TOO_LARGE`) before any Next.js code executed. The successful 50-label run used 66 KB JPEG re-encoded versions to fit under the cap. For realistic compliance photos (1–5 MB each from a phone or scanner), the inline-multipart batch design effectively limits each request to 1–4 labels, which defeats the endpoint's purpose. The production fix is to switch to client-uploaded blob storage (Vercel Blob, S3 presigned URLs) and pass URLs through the CSV instead of file bytes. The single-label `/api/verify` endpoint is not affected — one image per request fits within the cap with room to spare. Full scale-test metrics are in [`evals/scale-test-results.md`](evals/scale-test-results.md).

**Audit-trail bounding boxes are best-effort.** The model's spatial localization is imperfect, particularly for narrow horizontal fields in dense regions of the label. Thumbnails for the brand name and government warning are usually tight and accurate; thumbnails for ABV and net contents sometimes come back wider than the field actually occupies. The click-to-expand view shows the box overlaid on the full label so agents can verify spatial provenance even when the tight crop misleads.

**The scale test covers 50 labels, not 300.** REQUIREMENTS.md's architectural ceiling is 300 labels per batch and the route enforces that with `BATCH_MAX_ROWS = 300`. The empirically tested ceiling is 50 labels at concurrency 5, completing in 54 seconds wall-clock with zero errors. Projecting linearly to 300 labels gives ~325 seconds — just past Vercel's 300 s `maxDuration` cap — so 250 labels is a defensible demo ceiling on the current architecture; pushing to 300 needs either a separate measurement or the payload-cap remediation noted above (blob-storage uploads remove the inline payload cap and likely improve the upper bound).

**Eval fixture coverage is one image.** `sample-1.png` is a synthetic AI-generated bourbon label with all fields rendered cleanly and a correctly-styled government warning. It exercises the happy path and (because the model is stochastic on brand-name casing and the alcohol-content parenthetical) also exercises the NEEDS_REVIEW comparison chain. Expanding to 8–12 fixtures — including an imperfect-but-legible image and one or more government-warning failure modes — is a deferred manual task; the runner discovers fixtures by `<name>.png` + `<name>.expected.json` pairing, so dropping new pairs into `evals/fixtures/` picks them up automatically.

**No real PII or production data.** All fixtures are synthetic. The deployed application uses the commercial OpenAI API for inference, which would not be appropriate for production TTB use as-is. A production deployment would need FedRAMP-authorized inference infrastructure (on-premise, VPC-hosted, or a commercial cloud endpoint with an active authorization), a document retention policy aligned with TTB internal standards, and integration with COLA rather than the standalone form. None of those are in scope for this prototype.

## How to verify it works

For a manual smoke test, start the dev server with `pnpm dev`, open http://localhost:3000, upload `evals/fixtures/sample-1.png`, fill the Old Tom Distillery values into the form (brand "Old Tom Distillery", class/type "Kentucky Straight Bourbon Whiskey", ABV "45% Alc./Vol.", net contents "750 mL", bottler "Old Tom Distillery, Bardstown, KY", beverage type "distilled spirits", not an import), and submit. Verdicts should render in 5–7 seconds with a mix of PASS and NEEDS_REVIEW per row and a PASS on the government warning.

For automated checks, `pnpm eval` runs the same pipeline against committed fixtures and asserts each per-field verdict matches an expected set (the expected sets allow for model stochasticity — `["PASS", "NEEDS_REVIEW"]` on the brand name, for example, because the model alternates between matching and non-matching case). Exits 0 when every verdict matches; exits 1 on mismatch.

For batch behavior at scale, see [`evals/scale-test-results.md`](evals/scale-test-results.md) — a 50-label run against the deployed URL completed in 54 seconds with zero errors and zero rate-limit events.

`pnpm typecheck` and `pnpm lint` should pass cleanly on the committed source.

## Repository structure

```
app/
  api/verify/route.ts      single-label verification (multipart → pipeline → JSON)
  api/batch/route.ts       batch verification (multipart + CSV → pipeline ×N → SSE)
  page.tsx                 single-label UI (form + results)
  batch/page.tsx           batch UI (CSV pre-flight + streaming results table)
  layout.tsx               shared shell with site-level nav
components/
  UploadForm.tsx           react-hook-form form bound to ExpectedValuesSchema
  ResultsTable.tsx         per-field verdict table
  VerdictRow.tsx           single verdict row with audit thumbnail
  AuditThumbnail.tsx       CSS-clipped bounding-box thumbnail with click-to-expand
  ui/                      shadcn primitives (input, label, button, table, etc.)
lib/
  schema.ts                Zod schemas + inferred types (single source of truth)
  pipeline.ts              shared normalize → extract → verify pipeline
  image-prep.ts            sharp-based image normalization (EXIF, resize, JPEG)
  openai/                  OpenAI client, prompts (including canonical warning text), extraction
  verifiers/               comparison chain (Phase 2.1) + warning strict check (Phase 2.2)
  csv.ts, batch.ts         CSV parser + batch event envelope types
evals/
  fixtures/                <name>.png + <name>.expected.json pairs
  run.ts                   eval runner with per-field accuracy reporting
  scale-test-results.md    Phase 4.3 batch scale test metrics
scripts/
  scratch-extract.ts       CLI runner for one image, used during development
```

`REQUIREMENTS.md` is the source of truth for the system's behavior; `STEPS.md` is the build plan; `CLAUDE.md` is the code-style and stack reference used by the development tooling.
