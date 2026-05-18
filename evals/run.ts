// Eval runner (Phase 2.4 smoke → Phase 3.4 per-field accuracy).
//
// For every `<name>.png` + `<name>.expected.json` pair under evals/fixtures/,
// the runner drives the same normalize → extract → verify pipeline as the
// API route and compares each field's verdict against the expected verdict
// declared in the sidecar's `expectedVerdicts` map. Because the model is
// stochastic, each expected verdict may be either a single tier
// (e.g. "PASS") or an array of acceptable tiers (e.g. ["PASS", "NEEDS_REVIEW"]).
//
// Exit codes:
//   0 — every fixture's actual verdicts fall within their expected sets.
//   1 — at least one mismatch (or a pipeline error on a fixture).
//   2 — no fixtures discovered.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { verifyLabel } from "@/lib/pipeline";
import {
  ExpectedValuesSchema,
  VERIFIABLE_FIELDS,
  VerdictTierSchema,
  VerifiableFieldSchema,
  type FieldVerdict,
  type VerdictTier,
  type VerifiableField,
} from "@/lib/schema";

const FIXTURES_DIR = path.resolve("evals/fixtures");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

// Sidecar shape: ExpectedValues fields at top level + optional `expectedVerdicts`
// map. The runner parses each chunk independently so the existing
// ExpectedValuesSchema (a ZodEffects superRefine) stays unchanged.
//
// Zod 4 note: `z.record(K, V)` is exhaustive when K is an enum — it requires
// every enum value as a key. Since fixtures may omit some fields from
// expectedVerdicts (e.g. a non-import fixture won't include countryOfOrigin),
// we use `z.partialRecord(K, V)` which permits partial keys.
const ExpectedVerdictsSchema = z
  .partialRecord(
    VerifiableFieldSchema,
    z.union([VerdictTierSchema, z.array(VerdictTierSchema)]),
  )
  .optional();

type Fixture = {
  name: string;
  imagePath: string;
  expectedPath: string;
};

type FieldComparison = {
  field: VerifiableField;
  actual: VerdictTier | "missing";
  expected: VerdictTier | VerdictTier[] | "unspecified";
  match: boolean | "untested";
};

type FixtureOutcome =
  | {
      name: string;
      ok: true;
      latencyMs: number;
      comparisons: FieldComparison[];
      mismatchCount: number;
      testedCount: number;
    }
  | {
      name: string;
      ok: false;
      stage: string;
      message: string;
    };

async function discoverFixtures(): Promise<Fixture[]> {
  let entries: string[];
  try {
    entries = await readdir(FIXTURES_DIR);
  } catch (err) {
    throw new Error(
      `Could not read fixtures directory at ${FIXTURES_DIR}: ${errorMessage(err)}`,
    );
  }
  const entrySet = new Set(entries);
  const fixtures: Fixture[] = [];
  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;
    const base = entry.slice(0, -ext.length);
    const sidecar = `${base}.expected.json`;
    if (entrySet.has(sidecar)) {
      fixtures.push({
        name: base,
        imagePath: path.join(FIXTURES_DIR, entry),
        expectedPath: path.join(FIXTURES_DIR, sidecar),
      });
    }
  }
  return fixtures.sort((a, b) => a.name.localeCompare(b.name));
}

async function runFixture(f: Fixture): Promise<FixtureOutcome> {
  let sidecarRaw: string;
  try {
    sidecarRaw = await readFile(f.expectedPath, "utf8");
  } catch (err) {
    return { name: f.name, ok: false, stage: "read-expected", message: errorMessage(err) };
  }
  let sidecarJson: Record<string, unknown>;
  try {
    sidecarJson = JSON.parse(sidecarRaw) as Record<string, unknown>;
  } catch (err) {
    return { name: f.name, ok: false, stage: "parse-expected", message: errorMessage(err) };
  }
  const { expectedVerdicts: rawVerdicts, ...rawExpected } = sidecarJson;
  const parsedExpected = ExpectedValuesSchema.safeParse(rawExpected);
  if (!parsedExpected.success) {
    return {
      name: f.name,
      ok: false,
      stage: "validate-expected",
      message: parsedExpected.error.message,
    };
  }
  const parsedVerdicts = ExpectedVerdictsSchema.safeParse(rawVerdicts);
  if (!parsedVerdicts.success) {
    return {
      name: f.name,
      ok: false,
      stage: "validate-expected-verdicts",
      message: parsedVerdicts.error.message,
    };
  }
  const expected = parsedExpected.data;
  const expectedVerdicts = (parsedVerdicts.data ?? {}) as Partial<
    Record<VerifiableField, VerdictTier | VerdictTier[]>
  >;

  let bytes: Buffer;
  try {
    bytes = await readFile(f.imagePath);
  } catch (err) {
    return { name: f.name, ok: false, stage: "read-image", message: errorMessage(err) };
  }

  const t0 = Date.now();
  const outcome = await verifyLabel(bytes, expected);
  const latencyMs = Date.now() - t0;
  if (!outcome.ok) {
    return {
      name: f.name,
      ok: false,
      stage: "pipeline",
      message: `${outcome.kind}: ${outcome.message}`,
    };
  }

  const actualByField = new Map<VerifiableField, FieldVerdict>();
  for (const v of outcome.body.fields) actualByField.set(v.field, v);

  const comparisons: FieldComparison[] = [];
  let mismatchCount = 0;
  let testedCount = 0;
  for (const field of VERIFIABLE_FIELDS) {
    const actualVerdict = actualByField.get(field);
    const expectedTier = expectedVerdicts[field];
    if (expectedTier === undefined) {
      if (actualVerdict) {
        comparisons.push({
          field,
          actual: actualVerdict.verdict,
          expected: "unspecified",
          match: "untested",
        });
      }
      continue;
    }
    if (!actualVerdict) {
      comparisons.push({
        field,
        actual: "missing",
        expected: expectedTier,
        match: false,
      });
      mismatchCount++;
      testedCount++;
      continue;
    }
    const match = Array.isArray(expectedTier)
      ? expectedTier.includes(actualVerdict.verdict)
      : actualVerdict.verdict === expectedTier;
    comparisons.push({ field, actual: actualVerdict.verdict, expected: expectedTier, match });
    if (!match) mismatchCount++;
    testedCount++;
  }

  return {
    name: f.name,
    ok: true,
    latencyMs,
    comparisons,
    mismatchCount,
    testedCount,
  };
}

function formatExpected(expected: VerdictTier | VerdictTier[] | "unspecified"): string {
  if (expected === "unspecified") return "(no expectation)";
  if (Array.isArray(expected)) return `[${expected.join(", ")}]`;
  return expected;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function main(): Promise<void> {
  const fixtures = await discoverFixtures();
  if (fixtures.length === 0) {
    console.error(
      `[eval] No fixtures found in ${FIXTURES_DIR}. Drop a foo.png + foo.expected.json pair to add one.`,
    );
    process.exit(2);
  }
  console.log(
    `[eval] Running ${fixtures.length} fixture(s): ${fixtures.map((f) => f.name).join(", ")}`,
  );
  console.log();

  let totalTested = 0;
  let totalMatched = 0;
  let pipelineErrors = 0;
  let anyMismatch = false;
  const perFieldMatched = new Map<VerifiableField, { matched: number; tested: number }>();

  for (const fixture of fixtures) {
    const outcome = await runFixture(fixture);
    if (!outcome.ok) {
      pipelineErrors++;
      console.error(
        `[err]  ${outcome.name.padEnd(20)} stage=${outcome.stage}  ${outcome.message}`,
      );
      continue;
    }
    const matched = outcome.testedCount - outcome.mismatchCount;
    totalTested += outcome.testedCount;
    totalMatched += matched;
    if (outcome.mismatchCount > 0) anyMismatch = true;
    console.log(
      `[ok]   ${outcome.name.padEnd(20)} latency=${outcome.latencyMs}ms  matched=${matched}/${outcome.testedCount}`,
    );
    for (const c of outcome.comparisons) {
      const flag =
        c.match === "untested" ? "·" : c.match ? "✓" : "✗";
      console.log(
        `       ${flag} ${c.field.padEnd(20)} actual=${String(c.actual).padEnd(13)} expected=${formatExpected(c.expected)}`,
      );
      if (c.match === true || c.match === false) {
        const agg = perFieldMatched.get(c.field) ?? { matched: 0, tested: 0 };
        agg.tested++;
        if (c.match) agg.matched++;
        perFieldMatched.set(c.field, agg);
      }
    }
    console.log();
  }

  if (totalTested > 0) {
    const pct = ((totalMatched / totalTested) * 100).toFixed(1);
    console.log(
      `[eval] Overall accuracy: ${totalMatched}/${totalTested} = ${pct}% across ${fixtures.length} fixture(s).`,
    );
    if (perFieldMatched.size > 0) {
      console.log(`[eval] Per-field accuracy:`);
      for (const field of VERIFIABLE_FIELDS) {
        const agg = perFieldMatched.get(field);
        if (!agg) continue;
        const fieldPct = ((agg.matched / agg.tested) * 100).toFixed(0);
        console.log(`         ${field.padEnd(20)} ${agg.matched}/${agg.tested} = ${fieldPct}%`);
      }
    }
  } else {
    console.log(`[eval] No expectedVerdicts declared in any fixture; nothing to compare.`);
  }

  const exitCode = anyMismatch || pipelineErrors > 0 ? 1 : 0;
  process.exit(exitCode);
}

void main().catch((err: unknown) => {
  console.error("[eval] Unexpected error:", err);
  process.exit(1);
});
