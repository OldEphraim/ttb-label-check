# CLAUDE.md

## Project Identity

This is a take-home prototype for the U.S. Department of the Treasury's Alcohol and Tobacco Tax and Trade Bureau (TTB) Compliance Division. It is a standalone web application that helps a compliance agent verify a beverage label against expected field values from a corresponding alcohol label application. The agent uploads a label image and enters expected values; the system returns per-field verdicts (PASS / FAIL / NEEDS_REVIEW) with rationale and an audit-trail thumbnail.

## Source-of-Truth Documents

- **REQUIREMENTS.md** is the source of truth for *what* the system does. Do not add functionality not listed there without first asking.
- **STEPS.md** is the source of truth for *when and how* the build proceeds. Follow phases in order. Each phase ends with a deployable artifact.
- This file (**CLAUDE.md**) is the source of truth for code style, stack decisions, and behavioral rules.

If any of these documents conflict, surface the conflict rather than silently choosing.

## Stack

- **Framework:** Next.js 15 with App Router, TypeScript strict mode.
- **Styling:** Tailwind CSS. shadcn/ui for primitive components.
- **AI model (production code path):** OpenAI `gpt-5.4-mini` for vision + Structured Outputs. Fallback to `gpt-5.4` documented as an option if eval quality is insufficient; do not switch without surfacing the trade-off first.
- **Schema validation:** Zod. Use `zodResponseFormat` from `openai/helpers/zod` to bind verdict schemas to API calls.
- **Package manager:** pnpm.
- **Deployment:** Vercel.
- **Repo hosting:** GitHub, created via `gh repo create` per the operator's standing preference.

## Critical Rules

These rules are non-negotiable and override any other instruction:

1. **No Anthropic models in product runtime.** Anthropic models may be used in development tooling (e.g. Claude Code itself), but the deployed application must not call any Anthropic API. The production code path uses OpenAI only.
2. **No real PII or production data.** All sample labels are synthetic or public-domain. The application does not persist user data beyond session lifetime.
3. **No silent failures.** If extraction fails, image quality is insufficient, or an API call errors, the user sees an explicit message. The system never substitutes default values or fabricates extracted text.
4. **Ask before adding features not in REQUIREMENTS.md.** If a feature feels implied but is not specified, surface the question rather than building it. This protects the time budget.

## Coding Conventions

- TypeScript strict mode. No `any` without an explicit comment justifying it.
- Server components by default; client components only where interactivity requires it (file upload, streaming results, form state).
- API routes under `app/api/` return typed responses validated against the same Zod schemas the client uses to parse them.
- Errors are typed and surfaced — no swallowing exceptions.
- Imports ordered: React/Next, third-party, internal absolute (`@/`), internal relative.
- File naming: PascalCase for React components, camelCase for utilities and hooks, kebab-case for route segments.
- No new dependencies without justification. Prefer the platform (Web APIs, Next.js built-ins) over a library.

## File Structure

```
/app
  /api
    /verify/route.ts       single-label verification endpoint
    /batch/route.ts        batch verification endpoint (Phase 3)
  /page.tsx                main UI
  /layout.tsx
/components
  /ui/                     shadcn primitives
  /UploadForm.tsx
  /ResultsTable.tsx
  /VerdictRow.tsx
  /AuditThumbnail.tsx
/lib
  /openai/
    client.ts              OpenAI client init
    prompts.ts             prompt templates
    extractFields.ts       single-label vision extraction
    warningCheck.ts        government warning strict checker (only if Phase 2.2 takes the split path; default is folded into extractFields.ts)
  /verifiers/
    fieldVerdict.ts        PASS/FAIL/NEEDS_REVIEW logic
    normalize.ts           string normalization helpers
  /schema.ts               Zod schemas for verdicts and forms
  /types.ts                shared TypeScript types
/evals
  /fixtures/               labeled test images with expected outputs
  /run.ts                  eval runner script
  /README.md               eval methodology and current scores
/public
  /samples/                publicly-shareable sample labels
```

Adjustments to this structure are allowed when justified, but cosmetic reorganizations are not.

## Local Development

- `pnpm dev` runs the Next.js dev server on port 3000.
- `.env.local` holds `OPENAI_API_KEY`. Never commit it. `.env.example` lists required variables.
- `pnpm typecheck` runs `tsc --noEmit`. Must pass before any commit.
- `pnpm lint` runs ESLint with the Next.js config. Must pass before any commit.
- `pnpm eval` runs the eval suite against `/evals/fixtures` and prints accuracy by field.

## Deployment

- Production deploys to Vercel via `git push` to the `main` branch.
- `OPENAI_API_KEY` is set as a Vercel environment variable, not committed.
- The deployed URL must be reachable without authentication for evaluators.
- README must include the deployed URL and a one-line health-check note.

## Testing and Evals

Formal unit tests are not a deliverable for this prototype. In their place, a two-tier quality signal:

- **Smoke fixtures (Phase 2, always ships):** 2–3 hand-picked test labels under `/evals/fixtures` with expected verdicts, runnable via `pnpm eval`. Covers the most important canonical cases (a clean PASS, a NEEDS_REVIEW edge case, a warning-check failure mode). These ride along regardless of time pressure.
- **Full eval suite (Phase 3, cuttable):** 8–12 labeled fixtures with broader coverage and a per-field accuracy report.
- Manual smoke testing is documented in the README under "How to verify the build works."

Together, the smoke fixtures and (if shipped) the full eval suite are the quality signal for model changes. If a prompt or model swap is being considered, run `pnpm eval` first and after.

## Working Style

- Prefer small, atomic commits with clear messages. One feature or fix per commit.
- When in doubt about scope, ask. When in doubt about style, match the existing surrounding code. When in doubt about the model behavior, write a quick eval before changing the prompt.
- Do not optimize prematurely. The 5-second latency target is the only performance constraint that matters; everything else can be revisited if it becomes a problem.