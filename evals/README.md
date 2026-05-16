# Evals

Methodology and current scores for the eval suite. Populated in Phase 2.4 (smoke fixtures) and Phase 3.4 (full suite + per-field accuracy).

## Populating fixtures

The Phase 1.3 scratch runner (`pnpm scratch:extract`) looks for a sample image at `evals/fixtures/sample-1.jpg` by default. Drop a single beverage-label image there to smoke-test the extraction pipeline before the API route exists.

- JPEG or PNG (script defaults to `image/jpeg`; `.png` extension is honored).
- Per the project brief, AI-generated synthetic labels are acceptable — no real submission data.
- Suggested target field values (matched by the scratch runner's `SAMPLE_EXPECTED`):
  - Brand: **Old Tom Distillery**
  - Class/type: **Kentucky Straight Bourbon Whiskey**
  - Alcohol content: **45% Alc./Vol.**
  - Net contents: **750 mL**
  - Bottler: **Old Tom Distillery, Bardstown, KY**
  - Warning: standard "GOVERNMENT WARNING:" statutory text with a bold all-caps prefix.

Phase 2.4 will replace this single ad-hoc image with 2–3 hand-picked fixtures plus JSON sidecars listing expected verdicts.
