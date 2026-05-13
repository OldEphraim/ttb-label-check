# STEPS.md

## Phasing Philosophy

The build is structured as four phases, each ending with a deployable artifact. This shape is intentional: the operator has parallel high-priority commitments (Thomson Reuters interview process, possible 24-hour TR take-home mid-week) that may compress available time. After Phase 2, the project is a credible submission on its own. Phases 3 and 4 are additive polish and differentiation, valuable but not load-bearing.

Submission target: end of day Sunday. Calendar shape:

- **Phase 1** — Tuesday evening through Wednesday. Single-label happy path, deployable.
- **Phase 2** — Wednesday into Thursday. NEEDS_REVIEW verdict logic, government warning strict check, audit-trail thumbnails.
- **Phase 3** — Thursday into Friday. Batch upload, eval suite.
- **Phase 4** — Saturday through Sunday. README, deployment hardening, polish.

If TR disruption shifts the schedule, cut from Phase 3 first (eval suite, then batch), then Phase 4 polish. Never cut from Phases 1 or 2; those are load-bearing. Cuts to Phase 3 are authorized by REQUIREMENTS.md's Guiding Principle ("Working core application with clean code is preferred over ambitious but incomplete features"), and any cut must be documented in the README's "Assumptions and limitations" section as a known, deliberate decision rather than a silent retreat.

---

## Phase 1: Single-Label Happy Path

**Goal:** A deployable web app that accepts one label image and one set of expected values, returns per-field verdicts, and displays them in a readable table. No NEEDS_REVIEW tier yet — just PASS/FAIL. No audit thumbnails yet. No batch.

### 1.1 Project initialization

- Initialize Next.js 15 project with TypeScript strict, Tailwind, ESLint.
- Install dependencies: `openai`, `zod`, `react-hook-form`, `@hookform/resolvers`. Add shadcn/ui with the components needed for forms and tables.
- Create the file structure described in CLAUDE.md (empty stubs are fine; populate as phases proceed).
- Initialize Git, create GitHub repo via `gh repo create <name> --public --source=. --remote=origin --push`.
- Set up `.env.example` with `OPENAI_API_KEY` placeholder.

**Acceptance:** `pnpm dev` runs without errors. Repo exists on GitHub. Typecheck passes on empty project.

### 1.2 Schema and types

- In `lib/schema.ts`, define Zod schemas for:
  - `ExpectedValues` — the form input: brand name, class/type, ABV, net contents, bottler name/address, beverage type enum, an `isImport` boolean, and country of origin. The schema uses Zod's `superRefine` (or equivalent) to make `countryOfOrigin` required when `isImport === true` and ignored when `isImport === false`. ABV is required regardless of beverage type for the prototype — the wine/beer exception noted in REQUIREMENTS.md is scoped out as a known simplification and must be documented in the README's "Assumptions and limitations" section.
  - `FieldVerdict` — `{ field, extracted, expected, verdict: 'PASS' | 'FAIL' | 'NEEDS_REVIEW', confidence, rationale }`. Audit thumbnail field exists but is optional, populated in Phase 2.
  - `VerificationResult` — the full response: array of `FieldVerdict` plus a top-level `imageQuality` indicator (`'sufficient' | 'insufficient'` with an optional reason string when insufficient).
- Export TypeScript types derived from the Zod schemas.

**Acceptance:** Schemas typecheck. A unit-test-style ad-hoc verification at the bottom of the file or in a scratch script confirms parse round-trips.

### 1.3 OpenAI integration

- In `lib/openai/client.ts`, initialize the OpenAI client from `OPENAI_API_KEY`.
- In `lib/openai/prompts.ts`, draft the extraction prompt: instructs the model to extract specific field values from the label image, return structured JSON conforming to the schema, and assess image quality.
- In `lib/openai/extractFields.ts`, implement the single API call:
  - Model: `gpt-5.4-mini`.
  - Input: image (base64 or URL) plus expected values for context.
  - Response format: `zodResponseFormat(VerificationResult, "verification")`.
  - Catch and type API errors; surface them as structured failures, not silent fallbacks.

**Acceptance:** A scratch script calls `extractFields` against a sample label and prints a valid `VerificationResult`. Round-trip latency is under 5 seconds on a typical label.

### 1.4 Verdict comparison

- In `lib/verifiers/normalize.ts`, implement basic normalization helpers (trim, collapse whitespace, casefold for comparison purposes).
- In `lib/verifiers/fieldVerdict.ts`, implement the PASS/FAIL decision: exact match after normalization → PASS, otherwise FAIL. NEEDS_REVIEW logic is Phase 2; for now, anything that isn't a clean match is FAIL.
- When `isImport === false`, the verifier skips the country-of-origin field entirely — it does not appear in the verdict array and is not flagged as missing.
- The model's structured output already returns a verdict — but the verifier layer is where deterministic rules override model judgment if needed. Phase 1 trusts the model; Phase 2 adds rules.

**Acceptance:** Given a `VerificationResult` from the model and an `ExpectedValues` object, the verifier produces a final array of verdicts matching the schema.

### 1.5 API route

- `app/api/verify/route.ts`: POST handler that accepts multipart form data (image + JSON-encoded expected values), validates with Zod, calls `extractFields`, runs the verifier, returns a `VerificationResult`.
- Handle errors: 400 for invalid input, 502 for OpenAI errors, 500 for unexpected. All error responses include a human-readable message.

**Acceptance:** A curl request with a real label image and form data returns valid JSON within 5 seconds.

### 1.6 UI

- `app/page.tsx`: single-page layout with `UploadForm` and `ResultsTable`.
- `UploadForm`:
  - File input for the image with preview. Client-side validation rejects files that are not JPEG or PNG (clear error: "Please upload a JPEG or PNG image.") and files larger than 10 MB (clear error: "Image must be 10 MB or smaller. Selected file is X MB."). Validation runs before submit is enabled, and the API route re-validates on the server side.
  - Text inputs for each expected field.
  - Beverage-type radio (beer, wine, distilled spirits) that toggles which fields are required.
  - An "Is this an imported product?" toggle. When on, the country-of-origin input is shown and required. When off, the country-of-origin input is hidden.
  - Submit button, disabled until the form is valid.
- `ResultsTable`: renders the verdict array. Color + icon + text indicator for PASS/FAIL. Rationale visible inline.
- **Image-quality-insufficient state:** when the API returns `imageQuality === 'insufficient'`, the UI does not render the verdict table. Instead it shows a clear panel: "Image quality is too low for reliable verification. Please re-upload a clearer photo." If the response includes a reason string (e.g. "excessive glare," "extreme angle"), surface it inline so the agent knows what to fix.
- Loading state: spinner with a "Verifying..." message. Error state: plain-English message with retry affordance.

**Acceptance:** End-to-end manual test: open the local dev server, upload a label, enter expected values, see verdicts within 5 seconds. Verify the four UX behaviors: non-image file rejected with the expected message, oversized image rejected with the expected message, import toggle correctly hides/shows country-of-origin, deliberately low-quality image triggers the image-quality-insufficient panel.

### 1.7 Deploy to Vercel

- Push to GitHub. Connect repo to Vercel. Set `OPENAI_API_KEY` environment variable.
- Verify the deployed URL works end-to-end.
- Record the deployed URL for the README.

**Acceptance:** Deployed URL accepts a label upload and returns verdicts.

**End of Phase 1.** Project is a credible (if minimal) submission at this point.

---

## Phase 2: Verdict Logic, Warning Check, Audit Trail

**Goal:** Differentiation layer. The system now distinguishes nuanced mismatches from real failures, treats the government warning as a special case with strict sub-checks, and produces an audit-trail thumbnail for each verdict.

### 2.1 NEEDS_REVIEW verdict logic

- Extend `lib/verifiers/fieldVerdict.ts` with a NEEDS_REVIEW tier. Triggers include:
  - Case-only differences (e.g. "STONE'S THROW" vs "Stone's Throw").
  - Whitespace-only or punctuation-only differences.
  - Unit-notation differences (e.g. "750 mL" vs "750 ML", "45% Alc./Vol." vs "45% ABV").
  - Confidence below a defined threshold (e.g. 0.7) on a model-asserted match.
- Each NEEDS_REVIEW verdict carries a rationale identifying *which* normalization rule triggered the review.

**Acceptance:** Test fixtures covering each NEEDS_REVIEW trigger produce the correct verdict tier and rationale.

### 2.2 Government warning strict check

- Implement the dedicated warning pipeline. **Default to folding the warning check into the main extraction call** — adding a dedicated section to the structured-output schema for the four warning sub-checks. This keeps the request count at one per label and protects the 5-second latency budget.
- Only split into a separate API call (`lib/openai/warningCheck.ts`) if smoke-fixture or eval results show the combined prompt is degrading warning-check accuracy. If split, verify that combined two-call latency still meets the 5-second target end-to-end; if it does not, the split is not viable and the prompt for the combined call must be improved instead.
- Sub-checks:
  1. Warning statement present.
  2. Exact statutory text present (after whitespace normalization). The canonical text is hard-coded in `lib/openai/prompts.ts` as a constant.
  3. "GOVERNMENT WARNING:" prefix in all caps.
  4. Prefix visually bold relative to surrounding text.
- The warning sub-result populates a single `FieldVerdict` in the result array, with `rationale` identifying which sub-check failed when applicable.

**Acceptance:** Test labels covering the failure modes (missing warning, lowercase prefix, non-bold prefix, modified wording) each produce the correct sub-verdict and rationale.

### 2.3 Audit-trail thumbnails

- For each field verdict, capture the bounding box of the region the model attended to. Two approaches:
  - Have the model return approximate bounding boxes alongside extracted values in its structured output.
  - Crop client-side using the bounding boxes, store as data URLs, attach to the verdict.
- The `AuditThumbnail` component renders the cropped region inline with the verdict row, with a "view full label" affordance to expand.
- If the model's spatial localization is unreliable in testing, this becomes "best-effort" rather than guaranteed; document the limitation in the rationale text and the README.

**Acceptance:** Each verdict row in the UI has a thumbnail. Clicking expands to show the full label with the region highlighted.

### 2.4 Smoke fixtures

- Under `/evals/fixtures`, place 2–3 hand-picked test labels with JSON sidecars listing expected verdicts. Coverage targets:
  - One PASS case captured imperfectly but legibly (mild angle skew or partial glare, all fields still extractable). This covers the image-robustness success mode from REQUIREMENTS.md — that the system handles real-world capture conditions, not just studio-clean images.
  - One NEEDS_REVIEW case (e.g. a brand-name casing mismatch — Dave's "STONE'S THROW" example).
  - One government-warning failure (e.g. lowercase prefix or modified wording).
- `/evals/run.ts`: a minimal runner that iterates these fixtures, compares actual to expected, and prints pass/fail per fixture. Full per-field accuracy reporting is Phase 3.4; for now, the runner just confirms the pipeline behaves correctly on the three canonical cases.
- These fixtures ship regardless of whether the full eval suite (Phase 3.4) is built. They are the minimum quality signal for any future model or prompt change.

**Acceptance:** `pnpm eval` runs against all smoke fixtures and reports the expected outcomes.

### 2.5 Deploy

- Push and verify the deployed URL still works with the new logic.

**End of Phase 2.** Project now shows engineering judgment beyond the literal brief. This is the minimum viable submission target.

---

## Phase 3: Batch Upload and Eval Suite

**Goal:** Scale to the batch use case Sarah described and demonstrate engineering rigor via a small eval suite. Both items are cuttable if time pressure hits.

### 3.1 Batch input format

- Define the batch input: a CSV pairing image filenames with their expected field values, plus a multi-file upload component for the labels themselves.
- Validate that every CSV row has a matching uploaded file, and that every uploaded file has a matching CSV row. Surface mismatches before processing starts.

**Acceptance:** Uploading a 5-label batch with mismatched CSV/images produces a clear error before any API calls.

### 3.2 Batch processing endpoint

- `app/api/batch/route.ts`: accepts the batch input, processes labels concurrently with a configurable concurrency cap (start with 5), streams results back to the client as Server-Sent Events or a similar streaming primitive.
- Per-label processing reuses the single-label pipeline. Failures on individual labels do not abort the batch.
- **Vercel function duration:** the default function timeout is 60 seconds, which is insufficient for batches above ~10 labels at concurrency 5 with ~5s per label. Set `export const maxDuration = 300` at the top of the batch route file, and verify Fluid compute is enabled on the Vercel project. Without this, the Phase 4.3 scale test will 504. Document the chosen `maxDuration` value and the rationale in the README.
- The architectural ceiling per REQUIREMENTS.md is 300 labels. Development testing happens at 20 for fast iteration; a single scale test (50–100 labels, see Phase 4.3) confirms the architecture holds before submission. The README documents both the architectural ceiling and the empirically tested ceiling.

**Acceptance:** A 20-label batch processes to completion, with results streaming in as they finish. A single failed label produces an error row but does not break the batch.

### 3.3 Batch UI

- Extend the page (or add a tab) with a batch results table. Rows populate as results stream in. Each row links to the per-label verdict detail.
- Show overall progress (X of Y complete) and a summary row (X PASS, Y NEEDS_REVIEW, Z FAIL).

**Acceptance:** End-to-end batch test of 20 labels feels responsive — first results appear within a few seconds, table fills incrementally.

### 3.4 Eval suite

- Builds on the smoke fixtures from Phase 2.4. Extend `/evals/fixtures` to 8–12 sample labels total, broadening coverage: more clean PASS cases, additional FAIL cases, additional NEEDS_REVIEW edge cases, additional warning-statement failure modes.
- Extend `/evals/run.ts` to compute and report per-field accuracy across the full fixture set.
- `/evals/README.md` documents methodology and current scores.

**Acceptance:** `pnpm eval` produces an accuracy report. Document the score in the project README.

### 3.5 Deploy

- Push and verify batch endpoint works on the deployed URL.

**End of Phase 3.** Project is now competitive and shows scale awareness plus engineering rigor.

---

## Phase 4: README, Polish, Submission

**Goal:** Ship a clean submission. README is the primary deliverable for the evaluator's first impression; treat it with the same care as the code.

### 4.1 README

The README at the repo root must include, in order:

1. **One-paragraph project description.**
2. **Deployed URL** with a note that no auth is required.
3. **Quick start** — clone, install, env var, run dev.
4. **What it does** — brief feature list, ideally with a screenshot or two.
5. **Approach and tools used** — Next.js, OpenAI `gpt-5.4-mini`, Zod, Tailwind, Vercel. One paragraph each on the meaningful choices: why OpenAI (constraint), why GPT-5.4 mini specifically (latency + structured outputs), why a single-pass vision call rather than OCR + LLM pipeline.
6. **Design decisions** — NEEDS_REVIEW tier, dedicated warning check, audit-trail thumbnails. Each gets a short paragraph on the motivation (referencing the stakeholder concern it addresses).
7. **Assumptions and limitations** — explicit list. Required items include: the ABV-always-required simplification (REQUIREMENTS.md notes ABV has exceptions for certain wine/beer, which this prototype does not model), what was cut from Phase 3 if anything, what is intentionally out of scope, what would change for production (FedRAMP, PII handling, network-restricted inference, no commercial cloud API in real deployment).
8. **How to verify it works** — manual smoke test steps plus how to run the eval suite.
9. **Repository structure** — annotated directory tree.

### 4.2 UX polish

- Final pass on UX accessibility requirements from REQUIREMENTS.md. Tap targets, error messages, color+icon+text for verdicts.
- Quick check at simulated 1024x768 resolution (rough proxy for older government displays).

### 4.3 Smoke test on deployed URL

- Clear browser cache. Walk through single-label flow, batch flow (if Phase 3 shipped), error states (try an obviously bad image, try an empty form, try an oversized file).
- **Batch scale test (if Phase 3 shipped):** Run one batch of 50–100 labels (synthetic or duplicated fixtures are fine) and time end-to-end. This also verifies the `maxDuration` configuration from Phase 3.2 is sufficient — if the function 504s, either increase `maxDuration` and redeploy, or reduce the tested ceiling and document the actual working limit. Record the result in the README's "Assumptions and limitations" section: architectural ceiling per REQUIREMENTS.md is 300, empirically tested ceiling is X, total processing time at the tested ceiling was Y minutes at concurrency 5. If the test reveals issues (rate limits, memory pressure, streaming hiccups), document them and scope the demo to the working ceiling rather than claiming the architectural one.
- If anything is broken, fix it. Otherwise, submit.

### 4.4 Submission

- Confirm the GitHub repo is public and accessible.
- Confirm the deployed URL is reachable without VPN or auth.
- Send the submission email with both links.

---

## Submission Checklist

- [ ] GitHub repo is public and contains all source code.
- [ ] README at the root includes all sections above.
- [ ] Deployed URL is reachable without authentication.
- [ ] Single-label verification works end-to-end on the deployed URL within ~5 seconds.
- [ ] Government warning strict check correctly identifies the four failure modes on test labels.
- [ ] NEEDS_REVIEW verdicts surface with rationale identifying the trigger.
- [ ] Image-quality-insufficient state correctly surfaces the clear panel for a deliberately low-quality image, rather than producing a low-confidence verdict.
- [ ] (If shipped) Batch upload works end-to-end with streaming results.
- [ ] `pnpm eval` runs against the smoke fixtures and all expected outcomes are met. (If Phase 3 shipped, the full per-field accuracy report is also produced.)
- [ ] `pnpm typecheck` and `pnpm lint` both pass on the final commit.
- [ ] No Anthropic API calls in the deployed application's runtime.
- [ ] Submission email sent before end of day Sunday.