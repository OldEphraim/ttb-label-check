// PASS / FAIL / NEEDS_REVIEW decision logic for each verifiable field (Phase 1.4 / 2.1).
//
// Phase 1: exact match after normalization → PASS, otherwise FAIL.
// NEEDS_REVIEW (case-only differences, unit notation, low confidence, etc.) is Phase 2.1.
// The model already returns a verdict; this verifier layer is where deterministic rules
// override model judgment. Phase 1 only enforces (a) the isImport skip rule for
// countryOfOrigin and (b) the exact-match → PASS rule. Other model verdicts pass through.

import { isExactMatch } from "./normalize";
import type {
  ExpectedValuesInput,
  FieldVerdict,
  VerifiableField,
  VerificationResult,
} from "@/lib/schema";

type ExpectedAccessor = (e: ExpectedValuesInput) => string | undefined;

// governmentWarning has no per-agent expected value — its "expected" is the canonical
// statutory text, supplied by the prompt and echoed back by the model.
const EXPECTED_BY_FIELD: Partial<Record<VerifiableField, ExpectedAccessor>> = {
  brandName: (e) => e.brandName,
  classType: (e) => e.classType,
  alcoholContent: (e) => e.alcoholContent,
  netContents: (e) => e.netContents,
  bottlerNameAddress: (e) => e.bottlerNameAddress,
  countryOfOrigin: (e) => e.countryOfOrigin,
};

export function runVerifier(
  modelResult: VerificationResult,
  expected: ExpectedValuesInput,
): FieldVerdict[] {
  if (modelResult.imageQuality === "insufficient") {
    return [];
  }
  return modelResult.fields
    .filter((v) => !(v.field === "countryOfOrigin" && !expected.isImport))
    .map((v) => applyPhase1Rules(v, expected));
}

function applyPhase1Rules(v: FieldVerdict, expected: ExpectedValuesInput): FieldVerdict {
  // Phase 2.2 will replace this trust-the-model branch with a dedicated strict checker.
  if (v.field === "governmentWarning") {
    return v;
  }
  const accessor = EXPECTED_BY_FIELD[v.field];
  const expectedValue = accessor?.(expected);
  if (expectedValue === undefined || expectedValue === "") {
    return v;
  }
  const match = isExactMatch(v.extracted, expectedValue);
  return {
    ...v,
    expected: expectedValue,
    verdict: match ? "PASS" : "FAIL",
    rationale: match
      ? "Extracted value matches expected after trim/whitespace/case normalization."
      : "Extracted value does not match expected after trim/whitespace/case normalization.",
  };
}
