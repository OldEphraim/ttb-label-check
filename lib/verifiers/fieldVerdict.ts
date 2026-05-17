// PASS / FAIL / NEEDS_REVIEW decision logic for each verifiable field (Phase 1.4 / 2.1 / 2.2).
//
// Per-field comparison chain for non-warning fields (first match wins):
//   1. Strict match (equal after trim) → PASS.
//   2. Model self-reported PASS with confidence < 0.7 → NEEDS_REVIEW (low confidence).
//   3. Whitespace-only difference → NEEDS_REVIEW.
//   4. Punctuation-only difference → NEEDS_REVIEW.
//   5. Case-only difference → NEEDS_REVIEW.
//   6. Substring containment (either direction) after trim + collapse + casefold
//      → NEEDS_REVIEW.
//   7. Otherwise → FAIL.
//
// The governmentWarning field is handled by `decideWarningVerdict`, which reads
// the four warningSubchecks booleans (Phase 2.2) and emits PASS only if all four
// are true; otherwise FAIL with a rationale identifying the failing sub-check(s)
// in priority order (presence → exact text → all-caps prefix → bold prefix).
// countryOfOrigin is dropped entirely when !isImport.

import {
  containsAfterNormalize,
  isCaseOnlyDifference,
  isPunctuationOnlyDifference,
  isStrictMatch,
  isWhitespaceOnlyDifference,
} from "./normalize";
import type {
  ExpectedValuesInput,
  FieldVerdict,
  VerifiableField,
  VerificationResult,
} from "@/lib/schema";

type ExpectedAccessor = (e: ExpectedValuesInput) => string | undefined;

const EXPECTED_BY_FIELD: Partial<Record<VerifiableField, ExpectedAccessor>> = {
  brandName: (e) => e.brandName,
  classType: (e) => e.classType,
  alcoholContent: (e) => e.alcoholContent,
  netContents: (e) => e.netContents,
  bottlerNameAddress: (e) => e.bottlerNameAddress,
  countryOfOrigin: (e) => e.countryOfOrigin,
};

const LOW_CONFIDENCE_THRESHOLD = 0.7;

export function runVerifier(
  modelResult: VerificationResult,
  expected: ExpectedValuesInput,
): FieldVerdict[] {
  if (modelResult.imageQuality === "insufficient") {
    return [];
  }
  return modelResult.fields
    .filter((v) => !(v.field === "countryOfOrigin" && !expected.isImport))
    .map((v) => applyComparisonChain(v, expected));
}

function applyComparisonChain(
  v: FieldVerdict,
  expected: ExpectedValuesInput,
): FieldVerdict {
  if (v.field === "governmentWarning") {
    return decideWarningVerdict(v);
  }
  const accessor = EXPECTED_BY_FIELD[v.field];
  const expectedValue = accessor?.(expected);
  if (expectedValue === undefined || expectedValue === "") {
    return v;
  }

  // 1. Strict match → PASS.
  if (isStrictMatch(v.extracted, expectedValue)) {
    return {
      ...v,
      expected: expectedValue,
      verdict: "PASS",
      rationale: "Extracted value matches expected exactly (after trimming).",
    };
  }

  // 2. Low-confidence model PASS → NEEDS_REVIEW.
  if (v.verdict === "PASS" && v.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return {
      ...v,
      expected: expectedValue,
      verdict: "NEEDS_REVIEW",
      rationale: `Model reported a match but with low confidence (${v.confidence.toFixed(2)}); manual review recommended.`,
    };
  }

  // 3. Whitespace-only.
  if (isWhitespaceOnlyDifference(v.extracted, expectedValue)) {
    return {
      ...v,
      expected: expectedValue,
      verdict: "NEEDS_REVIEW",
      rationale:
        "Extracted and expected match after whitespace normalization; difference appears to be whitespace-only.",
    };
  }

  // 4. Punctuation-only.
  if (isPunctuationOnlyDifference(v.extracted, expectedValue)) {
    return {
      ...v,
      expected: expectedValue,
      verdict: "NEEDS_REVIEW",
      rationale:
        "Extracted and expected match after punctuation normalization; difference appears to be punctuation-only.",
    };
  }

  // 5. Case-only.
  if (isCaseOnlyDifference(v.extracted, expectedValue)) {
    return {
      ...v,
      expected: expectedValue,
      verdict: "NEEDS_REVIEW",
      rationale:
        "Extracted and expected match after case normalization; difference appears to be case-only.",
    };
  }

  // 6. Substring containment.
  if (containsAfterNormalize(v.extracted, expectedValue)) {
    return {
      ...v,
      expected: expectedValue,
      verdict: "NEEDS_REVIEW",
      rationale:
        "Extracted text contains the expected value (or vice versa) with additional context; manual review recommended to confirm semantic equivalence.",
    };
  }

  // 7. No trigger matched → FAIL.
  return {
    ...v,
    expected: expectedValue,
    verdict: "FAIL",
    rationale:
      "Extracted value does not match expected after trim, whitespace, punctuation, case, or containment checks.",
  };
}

// Phase 2.2 strict checker for the Government Warning Statement. The four
// sub-checks are evaluated by the vision model and returned in
// v.warningSubchecks; this function only applies the deterministic rule that
// all four must be true for PASS, and identifies the failing sub-checks in
// priority order (presence is most fundamental; bold is most cosmetic).
function decideWarningVerdict(v: FieldVerdict): FieldVerdict {
  if (!v.warningSubchecks) {
    return {
      ...v,
      verdict: "FAIL",
      rationale:
        "Government warning sub-check data missing from the model output; cannot verify the four required conditions.",
    };
  }
  const sc = v.warningSubchecks;
  const failures: string[] = [];
  if (!sc.present) failures.push("warning statement is not present on the label");
  if (!sc.exactText)
    failures.push("statutory wording does not exactly match the canonical text");
  if (!sc.prefixAllCaps)
    failures.push('"GOVERNMENT WARNING:" prefix is not rendered in all capital letters');
  if (!sc.prefixBold)
    failures.push(
      '"GOVERNMENT WARNING:" prefix is not visually bold relative to surrounding text',
    );

  if (failures.length === 0) {
    return {
      ...v,
      verdict: "PASS",
      rationale:
        'All four sub-checks passed: warning present, exact statutory text, "GOVERNMENT WARNING:" prefix in all caps, prefix visually bold.',
    };
  }
  return {
    ...v,
    verdict: "FAIL",
    rationale: `Government warning failed sub-check(s): ${failures.join("; ")}.`,
  };
}
