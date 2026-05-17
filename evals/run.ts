// Eval runner: iterates fixtures under evals/fixtures, drives the same
// normalize → extract → verify pipeline as the API route (without HTTP), and
// prints a per-fixture summary (Phase 2.4 smoke level).
//
// Phase 3.4 will extend this to compute per-field accuracy against a broader
// fixture set; for now the success criterion is "the pipeline completed and
// returned a parseable VerificationResult." Verdict-tier counts and the
// warning sub-check outcome are surfaced as additional signal but do not
// affect the pass/fail of the smoke run.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { normalizeForExtraction } from "@/lib/image-prep";
import { extractFields } from "@/lib/openai/extractFields";
import { runVerifier } from "@/lib/verifiers/fieldVerdict";
import { ExpectedValuesSchema } from "@/lib/schema";

const FIXTURES_DIR = path.resolve("evals/fixtures");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

type Fixture = {
  name: string;
  imagePath: string;
  expectedPath: string;
};

type FixtureOutcome =
  | {
      name: string;
      ok: true;
      latencyMs: number;
      passCount: number;
      needsReviewCount: number;
      failCount: number;
      warningVerdict: "PASS" | "FAIL" | "NEEDS_REVIEW" | "missing";
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
  let expectedRaw: string;
  try {
    expectedRaw = await readFile(f.expectedPath, "utf8");
  } catch (err) {
    return { name: f.name, ok: false, stage: "read-expected", message: errorMessage(err) };
  }
  let expectedJson: unknown;
  try {
    expectedJson = JSON.parse(expectedRaw);
  } catch (err) {
    return { name: f.name, ok: false, stage: "parse-expected", message: errorMessage(err) };
  }
  const parsedExpected = ExpectedValuesSchema.safeParse(expectedJson);
  if (!parsedExpected.success) {
    return {
      name: f.name,
      ok: false,
      stage: "validate-expected",
      message: parsedExpected.error.message,
    };
  }
  const expected = parsedExpected.data;

  let bytes: Buffer;
  try {
    bytes = await readFile(f.imagePath);
  } catch (err) {
    return { name: f.name, ok: false, stage: "read-image", message: errorMessage(err) };
  }

  const normalized = await normalizeForExtraction(bytes);
  if (!normalized.ok) {
    return { name: f.name, ok: false, stage: "normalize", message: normalized.message };
  }

  const t0 = Date.now();
  const extraction = await extractFields({
    imageDataUrl: normalized.dataUrl,
    expected,
  });
  if (!extraction.ok) {
    return {
      name: f.name,
      ok: false,
      stage: "extract",
      message: `${extraction.kind}: ${extraction.message}`,
    };
  }
  const latencyMs = Date.now() - t0;

  const fields = runVerifier(extraction.result, expected);
  const counts = { passCount: 0, needsReviewCount: 0, failCount: 0 };
  for (const v of fields) {
    if (v.verdict === "PASS") counts.passCount++;
    else if (v.verdict === "NEEDS_REVIEW") counts.needsReviewCount++;
    else counts.failCount++;
  }
  const warning = fields.find((v) => v.field === "governmentWarning");
  return {
    name: f.name,
    ok: true,
    latencyMs,
    ...counts,
    warningVerdict: warning ? warning.verdict : "missing",
  };
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

  let okCount = 0;
  let errCount = 0;
  for (const fixture of fixtures) {
    const outcome = await runFixture(fixture);
    if (outcome.ok) {
      okCount++;
      console.log(
        `[ok]   ${outcome.name.padEnd(20)} latency=${outcome.latencyMs}ms  PASS=${outcome.passCount}  NEEDS_REVIEW=${outcome.needsReviewCount}  FAIL=${outcome.failCount}  warning=${outcome.warningVerdict}`,
      );
    } else {
      errCount++;
      console.error(
        `[err]  ${outcome.name.padEnd(20)} stage=${outcome.stage}  ${outcome.message}`,
      );
    }
  }
  console.log();
  console.log(
    `[eval] ${okCount}/${fixtures.length} fixtures completed pipeline cleanly.${errCount > 0 ? ` ${errCount} errored.` : ""}`,
  );
  process.exit(errCount === 0 ? 0 : 1);
}

void main().catch((err: unknown) => {
  console.error("[eval] Unexpected error:", err);
  process.exit(1);
});
