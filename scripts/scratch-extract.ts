// Phase 1.3 / 1.4 scratch runner.
// Usage:
//   pnpm scratch:extract                              # uses evals/fixtures/sample-1.jpg
//   pnpm scratch:extract path/to/some-label.png       # uses the given path
//
// Reads OPENAI_API_KEY from .env.local (via tsx --env-file-if-exists). On missing image
// the script exits 2 with a clear message; on extraction failure it exits 1; on success
// it prints the model's VerificationResult and the verifier's filtered FieldVerdict[].
import { readFile } from "node:fs/promises";
import path from "node:path";

import { normalizeForExtraction } from "@/lib/image-prep";
import { extractFields } from "@/lib/openai/extractFields";
import { runVerifier } from "@/lib/verifiers/fieldVerdict";
import type { ExpectedValuesInput } from "@/lib/schema";

const DEFAULT_PATH = "evals/fixtures/sample-1.jpg";

// Matches the brief's example: Old Tom Distillery bourbon, domestic distilled spirit.
const SAMPLE_EXPECTED: ExpectedValuesInput = {
  brandName: "Old Tom Distillery",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45% Alc./Vol.",
  netContents: "750 mL",
  bottlerNameAddress: "Old Tom Distillery, Bardstown, KY",
  beverageType: "distilled_spirits",
  isImport: false,
  countryOfOrigin: undefined,
};

async function main(): Promise<void> {
  const imagePath = process.argv[2] ?? DEFAULT_PATH;
  const absImagePath = path.resolve(imagePath);

  let imageBytes: Buffer;
  try {
    imageBytes = await readFile(absImagePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      printMissingImageHelp(absImagePath);
      process.exit(2);
    }
    throw err;
  }

  console.log(`[scratch] Image:    ${absImagePath} (${imageBytes.length} bytes on disk)`);

  const normalized = await normalizeForExtraction(imageBytes);
  if (!normalized.ok) {
    console.error(`\n[scratch] Image normalization failed (${normalized.kind}): ${normalized.message}`);
    process.exit(1);
  }
  const { originalBytes, normalizedBytes, originalDimensions: od, normalizedDimensions: nd } = normalized;
  console.log(
    `[scratch] Normalized: ${originalBytes} → ${normalizedBytes} bytes, ${od.width}x${od.height} → ${nd.width}x${nd.height} jpeg`,
  );
  console.log(`[scratch] Calling extractFields against gpt-5.4-mini...`);

  const outcome = await extractFields({ imageDataUrl: normalized.dataUrl, expected: SAMPLE_EXPECTED });
  if (!outcome.ok) {
    console.error(`\n[scratch] extractFields failed (${outcome.kind}): ${outcome.message}`);
    process.exit(1);
  }

  console.log(`[scratch] Latency:  ${outcome.latencyMs} ms`);
  console.log(`\n=== Model VerificationResult ===`);
  console.log(JSON.stringify(outcome.result, null, 2));

  const verified = runVerifier(outcome.result, SAMPLE_EXPECTED);
  console.log(`\n=== Verifier FieldVerdict[] (Phase 1.4 post-filter / PASS-FAIL override) ===`);
  console.log(JSON.stringify(verified, null, 2));
}

function printMissingImageHelp(absImagePath: string): void {
  const lines = [
    `No label image found at: ${absImagePath}`,
    ``,
    `Place a sample beverage label at evals/fixtures/sample-1.jpg, or pass a path:`,
    `    pnpm scratch:extract path/to/label.jpg`,
    ``,
    `Per the project brief, AI-generated synthetic labels are acceptable for testing.`,
    `Suggested target (matches the SAMPLE_EXPECTED values in this script):`,
    `    Brand:           Old Tom Distillery`,
    `    Class/type:      Kentucky Straight Bourbon Whiskey`,
    `    Alcohol content: 45% Alc./Vol.`,
    `    Net contents:    750 mL`,
    `    Bottler:         Old Tom Distillery, Bardstown, KY`,
    `    Warning:         Standard "GOVERNMENT WARNING:" statutory text (bold prefix).`,
  ];
  console.error(lines.join("\n"));
}

void main().catch((err: unknown) => {
  console.error(`[scratch] Unexpected error:`, err);
  process.exit(1);
});
