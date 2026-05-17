// Prompt templates for extraction and the canonical government warning text (Phase 1.3 / 2.2).
import type { ExpectedValuesInput, VerifiableField } from "@/lib/schema";

// Production code path model. Operator confirmed this literal model string is current as of May 2026.
export const MODEL_NAME = "gpt-5.4-mini";

// The exact statutory text required on US alcohol labels per 27 CFR §16.21.
// Used by the warning strict-check in Phase 2.2.
export const GOVERNMENT_WARNING_TEXT =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

export const SYSTEM_PROMPT = [
  "You are a U.S. Department of the Treasury TTB compliance assistant.",
  "You read alcoholic-beverage label images and extract specific labeled fields verbatim.",
  "Quote text exactly as it appears on the label (preserve case, punctuation, units, line breaks).",
  "Never invent or paraphrase values. If a field is not visible or not legible, set its extracted value to an empty string and assign the verdict FAIL with a rationale explaining what was missing.",
  "If the image is too blurry, dark, glare-affected, or skewed for confident reading, set imageQuality to \"insufficient\" with a one-phrase imageQualityReason and return an empty fields array.",
  "Confidence is your own calibrated estimate between 0 and 1 of how certain you are about the extracted value.",
  "For the governmentWarning field, the `extracted` value is the full warning text you read off the label (or empty string if absent); the `expected` value is the canonical statutory text supplied to you. You must also populate `warningSubchecks` with four boolean assessments described in the user prompt.",
].join(" ");

const FIELD_LABELS: Record<VerifiableField, string> = {
  brandName: "Brand name",
  classType: "Class / type designation",
  alcoholContent: "Alcohol content (ABV)",
  netContents: "Net contents",
  bottlerNameAddress: "Name and address of bottler or producer",
  countryOfOrigin: "Country of origin",
  governmentWarning: "Government Health Warning Statement",
};

export function buildExtractionPrompt(expected: ExpectedValuesInput): string {
  const requestedFields: VerifiableField[] = [
    "brandName",
    "classType",
    "alcoholContent",
    "netContents",
    "bottlerNameAddress",
  ];
  if (expected.isImport) {
    requestedFields.push("countryOfOrigin");
  }
  requestedFields.push("governmentWarning");

  const expectedTable = [
    `- Brand name: ${expected.brandName}`,
    `- Class/type: ${expected.classType}`,
    `- Alcohol content: ${expected.alcoholContent}`,
    `- Net contents: ${expected.netContents}`,
    `- Bottler/producer name and address: ${expected.bottlerNameAddress}`,
    `- Beverage type: ${expected.beverageType}`,
    `- Is import: ${expected.isImport}`,
    expected.isImport ? `- Country of origin: ${expected.countryOfOrigin ?? ""}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const fieldList = requestedFields.map((f) => `- ${f} (${FIELD_LABELS[f]})`).join("\n");

  return [
    "Extract the following fields from the attached beverage label image and compare each one against the agent's expected value.",
    "",
    "Fields to extract (use these exact keys in the `field` property of each output entry):",
    fieldList,
    "",
    "Agent's expected values (for comparison; do not let these influence what you read off the label):",
    expectedTable,
    "",
    `Canonical Government Warning text to compare against the label's warning:\n${GOVERNMENT_WARNING_TEXT}`,
    "",
    "Government Warning sub-checks (governmentWarning field only):",
    "On the governmentWarning entry, populate the `warningSubchecks` object with four boolean assessments based on what you observe in the label image. For every other field, `warningSubchecks` must be null.",
    "- present: true if a Surgeon General / government warning statement is visible somewhere on the label; false if no such statement is present at all.",
    "- exactText: true if the warning's wording, after normalizing whitespace and line breaks, exactly matches the canonical statutory text shown above. False if any word is added, omitted, reordered, or substituted — even if the meaning is preserved.",
    "- prefixAllCaps: true if the literal `GOVERNMENT WARNING:` prefix appears at the start of the warning in all capital letters (with that exact colon). False if any letter in the prefix is lowercase, or if the prefix is missing/altered.",
    "- prefixBold: true if the `GOVERNMENT WARNING:` prefix is rendered visually heavier than the surrounding warning text — thicker stroke weight, clearly distinct font weight from the body of the warning. False if the prefix appears the same weight as (or lighter than) the body text. This is a visual judgment from the image; assess it from how the letters are actually rendered, not from any text-content cue.",
    "If `present` is false, the other three sub-checks must also be false.",
    "",
    "Output rules:",
    "1. Return exactly one entry per field listed above, in the same order.",
    "2. Always set `expected` to the agent's value for that field (or, for governmentWarning, to the canonical text above).",
    "3. Set `verdict` to PASS if the extracted value matches the expected value (exact match after trimming and casefolding), otherwise FAIL. The verifier layer applies a NEEDS_REVIEW tier deterministically — you should not emit NEEDS_REVIEW yourself. For the governmentWarning row, set `verdict` to PASS if all four sub-checks are true, otherwise FAIL; the verifier overrides this deterministically from `warningSubchecks` either way.",
    "4. `confidence` is between 0 and 1.",
    "5. `auditThumbnail` must be null for now (Phase 2.3 will populate it).",
    "6. Set `imageQualityReason` to null if `imageQuality` is \"sufficient\".",
    "7. `warningSubchecks` must be null on every field except governmentWarning. On the governmentWarning row, populate all four boolean sub-checks per the section above.",
  ].join("\n");
}
