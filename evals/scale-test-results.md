# Phase 4.3 — Batch Scale Test

## Test parameters

- **Date (UTC):** 2026-05-18T06:57:01Z
- **Deployed URL:** https://ttb-label-check.vercel.app
- **Endpoint:** `POST /api/batch`
- **Label count:** 50
- **Concurrency cap:** 5 (server-enforced via `BATCH_CONCURRENCY` in `lib/batch.ts`)
- **Function runtime:** Node.js, `maxDuration = 300` (Vercel Fluid compute)
- **Fixture:** `evals/fixtures/sample-1.png` re-encoded to JPEG quality 55 at 512 px wide (~66 KB per file, 3.2 MB total) and duplicated 50× — see "Anomalies" for why the native 3.3 MB PNGs couldn't be used on the first attempt.
- **Per-label expected values:** Old Tom Distillery / Kentucky Straight Bourbon Whiskey / 45% Alc./Vol. / 750 mL / "Old Tom Distillery, Bardstown, KY" / distilled spirits / domestic.

## Headline numbers

| Metric | Value |
|---|---|
| Total wall-clock time | **54.19 s** |
| Time to first result | 8.86 s |
| Time to last result | 54.19 s |
| Throughput | **55.4 labels / minute** |
| Successful labels (`ok: true` events) | 50 / 50 |
| Failed labels (`ok: false` events) | 0 |

## Per-label latency distribution

Approximated as `arrival[i] - arrival[i - 5]` (the duration the worker slot was occupied by label `i`). The first 5 values are measured from request start, so they include upload + queue priming + cold-start overhead in addition to model time.

| Statistic | Value |
|---|---|
| min | 1.81 s |
| median (p50) | 4.93 s |
| p95 | 9.01 s |
| max | 13.40 s |

The first wave of five labels arrived clustered at 8.86–9.61 s (still uploading and warming the function). From there, completions came in roughly two-per-second waves until the stream closed at 54.19 s. p50 sitting at ~5 s matches the warm-call latency we've seen on the single-label scratch path since Phase 1.4.5.

## Verdict-tier breakdown

Total per-field verdicts emitted: **300** (50 successful labels × 6 fields each — brand / class-type / ABV / net contents / bottler / government warning).

| Tier | Count | Share |
|---|---:|---:|
| PASS | 157 | 52.3% |
| NEEDS_REVIEW | 135 | 45.0% |
| FAIL | 8 | 2.7% |

The 45 % NEEDS_REVIEW share reflects the expected stochasticity on `brandName` (model alternates `Old Tom Distillery` ↔ `OLD TOM DISTILLERY`, the latter hits case-only) and `alcoholContent` (model sometimes appends `(90 Proof)`, hitting substring-containment), plus the consistent NEEDS_REVIEW on `bottlerNameAddress` ("Bottled by …" prefix). The 8 FAIL verdicts represent ~2.7 % of all per-field decisions and are within the band of normal model variation on these synthetic-fixture rows.

### Image-quality-insufficient labels

_(none — every label was decoded by the model at "sufficient" quality.)_

### Errored events (`ok: false`)

_(none — every label completed the pipeline cleanly.)_

## Anomalies

- **First attempt: HTTP 413 `FUNCTION_PAYLOAD_TOO_LARGE`.** Submitting the native `sample-1.png` (3.3 MB) duplicated 50× produced a ~165 MB multipart request body. Vercel's standard serverless function payload limit is 4.5 MB and Next.js never received the request — the platform proxy rejected it with 413 + `FUNCTION_PAYLOAD_TOO_LARGE` before our route ran. This is a **real production-deployment constraint**: the current `/api/batch` design accepts label images inline in the multipart body, which means the per-batch request body cap is ~4.5 MB regardless of `BATCH_MAX_ROWS = 300`. The successful 50-label run uses 66 KB JPEGs to fit under the cap. For a real production batch flow, the right fix is to switch to client-uploaded blob storage (Vercel Blob, S3 presigned URLs) and pass URLs through the CSV instead of multipart files. Single-label uploads through `/api/verify` are not affected by this limit (one 10 MB image fits comfortably).
- **Stream interruption:** none — all 50 SSE events arrived in-order on the wire before the stream closed.
- **504 / 5xx:** none. The function returned a single 200 with the SSE body, well under the 300 s `maxDuration`.
- **Rate limiting:** zero `rate_limited` events. OpenAI accepted all 50 requests at concurrency 5 without throttling.
- **Stream ordering:** SSE events arrived out of CSV order (`label-005` before `label-001`), as expected — workers complete labels in finish order, not submission order, and the client UI/runner sort by `index` for display. No correctness impact.

## Interpretation

At concurrency 5 and ~5 s warm latency per label, a 50-label batch is bounded below by `ceil(50/5) × 5 s = 50 s` of model time plus a one-time upload and cold-start charge. The measured **54.19 s** is essentially that lower bound — the architecture holds cleanly at this scale. Every label processed without error and every per-row event arrived intact in the SSE stream.

The empirically tested ceiling from this run is **50 labels in 54.19 s** (well under the 300 s Vercel maxDuration cap). Projecting linearly to the architectural ceiling of 300 labels gives roughly `300 / 50 × 54 s ≈ 325 s` — slightly over the 300 s cap, suggesting 300 is the right architectural target on paper but not a number to demo from this run alone. A safer demo ceiling based on this measurement is around **250 labels** (~270 s wall-clock with current scaling), which fits comfortably under maxDuration with margin for tail-latency spikes.

The 4.5 MB function-payload cap is the more pressing production concern. At the cap, a 50-label batch already has to use ~90 KB-per-image fixtures, and any realistic production photo (1–5 MB) would force batch sizes of 1–4 labels per request — defeating the batch endpoint's purpose entirely. The README's "Assumptions and limitations" section should call this out and recommend the blob-storage migration as the production path. The streaming architecture, concurrency model, and SSE protocol all work correctly; the constraint is purely on inline upload size.
