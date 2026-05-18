# Evals

Per-field accuracy reporting (Phase 3.4) on top of the Phase 2.4 fixture loader.

## Fixture format

Each fixture is a pair of files in `evals/fixtures/`:

- `<name>.png` (or `.jpg` / `.jpeg`) — the label image.
- `<name>.expected.json` — top-level fields are the agent's expected `ExpectedValuesInput` (`brandName`, `classType`, `alcoholContent`, `netContents`, `bottlerNameAddress`, `beverageType`, `isImport`, and `countryOfOrigin` when `isImport` is `true`). Plus an optional `expectedVerdicts` map keyed by verifiable field.

### `expectedVerdicts`

Each entry is a single `VerdictTier` (`"PASS"`, `"FAIL"`, or `"NEEDS_REVIEW"`) — or, because the vision model is stochastic, an array of acceptable tiers. For example:

```json
"expectedVerdicts": {
  "brandName": ["PASS", "NEEDS_REVIEW"],
  "classType": "PASS",
  "alcoholContent": ["PASS", "NEEDS_REVIEW"],
  "netContents": "PASS",
  "bottlerNameAddress": "NEEDS_REVIEW",
  "governmentWarning": "PASS"
}
```

- A single tier asserts the verdict must equal that value.
- An array asserts the verdict must be in the set.

Fields not present in `expectedVerdicts` aren't compared — the runner prints the actual verdict as informational signal (`·` flag) but neither passes nor fails the fixture on them.

If `expectedVerdicts` is omitted entirely, the fixture only runs the pipeline-completion smoke check from Phase 2.4 — useful for "I just want to know the pipeline doesn't throw" cases.

## Current fixtures

- **`sample-1.png`** — synthetic AI-generated bourbon label (Old Tom Distillery, Bardstown KY). Clean rendering of all fields, correctly-styled Government Warning. `expectedVerdicts` admits the observed model stochasticity (brand returned either as `Old Tom Distillery` or `OLD TOM DISTILLERY`, alcohol content occasionally appending `(90 Proof)`).

Expanding to 8–12 fixtures (per STEPS.md Phase 3.4) is a deferred manual task — the infrastructure already supports them; the operator just needs to drop new image + sidecar pairs into `evals/fixtures/`. Coverage targets the imperfect-but-legible case, additional NEEDS_REVIEW edge cases, and the four government-warning failure modes (missing, lowercase prefix, non-bold prefix, modified wording).

## How to run

```sh
pnpm eval
```

For each fixture, prints:
- A header row with latency and matched-count summary.
- One line per verified field with the actual verdict and expected set, flagged `✓` / `✗` / `·` (untested).
- An overall accuracy figure and a per-field accuracy table once all fixtures are done.

Exit code:
- `0` — every tested verdict matched its expected set.
- `1` — at least one mismatch, or a pipeline error on any fixture.
- `2` — no fixtures discovered.

Requires `OPENAI_API_KEY` in `.env.local`.
