# Evals

Smoke-level fixture infrastructure (Phase 2.4). Phase 3.4 will extend this into a per-field accuracy report against a broader fixture set.

## Fixture format

Each fixture is a pair of files in `evals/fixtures/`:

- `<name>.png` (or `.jpg` / `.jpeg`) — the label image.
- `<name>.expected.json` — JSON object matching `ExpectedValuesSchema` from `lib/schema.ts`: `brandName`, `classType`, `alcoholContent`, `netContents`, `bottlerNameAddress`, `beverageType`, `isImport`, and `countryOfOrigin` when `isImport` is `true`.

The runner discovers every `*.png|.jpg|.jpeg` file in the directory that has a matching `*.expected.json` sidecar.

## Current fixtures

- **`sample-1.png`** — synthetic AI-generated bourbon label (Old Tom Distillery, Bardstown KY). Clean rendering of all fields, correctly-styled Government Warning. Used as the canonical happy-path smoke case.

Phase 3.4 will broaden coverage to 8–12 fixtures, including:

- An imperfect-but-legible image (mild angle skew or partial glare, all fields still extractable).
- A NEEDS_REVIEW edge case (e.g. brand-name casing mismatch like the canonical `STONE'S THROW` vs `Stone's Throw`).
- A Government Warning failure mode (lowercase prefix, non-bold prefix, or modified wording).

These additional fixtures are deferred because they require new label images that aren't yet generated. The runner and schema already support them — drop new pairs into `evals/fixtures/` and they get picked up automatically.

## How to run

```sh
pnpm eval
```

Runs each discovered fixture through the same pipeline as the API route (normalize → extract → verify) without going through HTTP. Per fixture, prints latency, the count of PASS / NEEDS_REVIEW / FAIL verdicts, and the Government Warning row's verdict.

Requires `OPENAI_API_KEY` in `.env.local`. Exits non-zero if any fixture errored.

The smoke runner does not yet compare verdicts against expected ones — that comparison is Phase 3.4. For now the success criterion is "the pipeline completed without error and produced a parseable `VerificationResult`."
