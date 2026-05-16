// Zod schemas for ExpectedValues, FieldVerdict, and VerificationResult (Phase 1.2).
import { z } from "zod";

export const BEVERAGE_TYPES = ["beer", "wine", "distilled_spirits"] as const;
export const BeverageTypeSchema = z.enum(BEVERAGE_TYPES);

export const VERDICT_TIERS = ["PASS", "FAIL", "NEEDS_REVIEW"] as const;
export const VerdictTierSchema = z.enum(VERDICT_TIERS);

export const VERIFIABLE_FIELDS = [
  "brandName",
  "classType",
  "alcoholContent",
  "netContents",
  "bottlerNameAddress",
  "countryOfOrigin",
  "governmentWarning",
] as const;
export const VerifiableFieldSchema = z.enum(VERIFIABLE_FIELDS);

export const IMAGE_QUALITY_LEVELS = ["sufficient", "insufficient"] as const;
export const ImageQualitySchema = z.enum(IMAGE_QUALITY_LEVELS);

// Form input. ABV is required regardless of beverage type for this prototype;
// the wine/beer exception in REQUIREMENTS.md is a documented simplification.
// countryOfOrigin is required iff isImport === true (enforced via superRefine below).
const ExpectedValuesBaseSchema = z.object({
  brandName: z.string().min(1, "Brand name is required."),
  classType: z.string().min(1, "Class/type designation is required."),
  alcoholContent: z.string().min(1, "Alcohol content is required."),
  netContents: z.string().min(1, "Net contents is required."),
  bottlerNameAddress: z.string().min(1, "Bottler/producer name and address is required."),
  beverageType: BeverageTypeSchema,
  isImport: z.boolean(),
  countryOfOrigin: z.string().optional(),
});

export const ExpectedValuesSchema = ExpectedValuesBaseSchema.superRefine((value, ctx) => {
  if (value.isImport) {
    if (!value.countryOfOrigin || value.countryOfOrigin.trim() === "") {
      ctx.addIssue({
        code: "custom",
        path: ["countryOfOrigin"],
        message: "Country of origin is required for imported products.",
      });
    }
  }
});

// VerificationResult is the model's structured output (Phase 1.3) and the API response.
// OpenAI Structured Outputs strict mode requires every property to be in `required`, so
// optional model-side fields are declared as `.nullable()` rather than `.optional()`.
export const FieldVerdictSchema = z.object({
  field: VerifiableFieldSchema,
  extracted: z.string(),
  expected: z.string(),
  verdict: VerdictTierSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  // Audit thumbnail (cropped data URL) is populated in Phase 2.3.
  auditThumbnail: z.string().nullable(),
});

export const VerificationResultSchema = z.object({
  imageQuality: ImageQualitySchema,
  // Set when imageQuality === "insufficient"; e.g. "excessive glare", "extreme angle".
  imageQualityReason: z.string().nullable(),
  fields: z.array(FieldVerdictSchema),
});

export type BeverageType = z.infer<typeof BeverageTypeSchema>;
export type VerdictTier = z.infer<typeof VerdictTierSchema>;
export type VerifiableField = z.infer<typeof VerifiableFieldSchema>;
export type ImageQuality = z.infer<typeof ImageQualitySchema>;
export type ExpectedValues = z.infer<typeof ExpectedValuesSchema>;
export type ExpectedValuesInput = z.input<typeof ExpectedValuesSchema>;
export type FieldVerdict = z.infer<typeof FieldVerdictSchema>;
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
