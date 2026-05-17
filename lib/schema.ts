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

// Government Warning four-sub-check structure (Phase 2.2). The model populates this
// object on the governmentWarning field only; for every other field the property is
// null. The verifier reads these booleans deterministically to decide PASS/FAIL on
// the warning row.
export const WarningSubchecksSchema = z.object({
  present: z.boolean(),
  exactText: z.boolean(),
  prefixAllCaps: z.boolean(),
  prefixBold: z.boolean(),
});

// Approximate rectangular region the model attended to when extracting a field,
// expressed in image-normalized coordinates (Phase 2.3). (0,0) is the top-left
// corner of the image; (1,1) is the bottom-right. The client uses this together
// with the normalized image data URL to render a cropped audit thumbnail.
export const BoundingBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
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
  // Bounding box for the region the model attended to (Phase 2.3). Null when the
  // model could not confidently locate the region.
  boundingBox: BoundingBoxSchema.nullable(),
  // Government warning four-sub-check booleans (Phase 2.2). Null on every field
  // except governmentWarning, where the model populates all four assessments.
  warningSubchecks: WarningSubchecksSchema.nullable(),
});

export const VerificationResultSchema = z.object({
  imageQuality: ImageQualitySchema,
  // Set when imageQuality === "insufficient"; e.g. "excessive glare", "extreme angle".
  imageQualityReason: z.string().nullable(),
  fields: z.array(FieldVerdictSchema),
});

// Server-side image dimensions of the JPEG that was actually sent to the model
// (post-EXIF-rotate + post-resize from image-prep). The client uses these to
// scale boundingBox coordinates back to pixels for the audit thumbnail.
export const NormalizedImageDimensionsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

// Full shape returned by app/api/verify on success. Composes the model's
// VerificationResult with the server-side image-prep outputs the UI needs to
// render Phase 2.3 audit thumbnails.
export const VerifyApiResponseSchema = VerificationResultSchema.extend({
  normalizedImageDataUrl: z.string(),
  normalizedImageDimensions: NormalizedImageDimensionsSchema,
});

export type BeverageType = z.infer<typeof BeverageTypeSchema>;
export type VerdictTier = z.infer<typeof VerdictTierSchema>;
export type VerifiableField = z.infer<typeof VerifiableFieldSchema>;
export type ImageQuality = z.infer<typeof ImageQualitySchema>;
export type ExpectedValues = z.infer<typeof ExpectedValuesSchema>;
export type ExpectedValuesInput = z.input<typeof ExpectedValuesSchema>;
export type FieldVerdict = z.infer<typeof FieldVerdictSchema>;
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
export type WarningSubchecks = z.infer<typeof WarningSubchecksSchema>;
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;
export type NormalizedImageDimensions = z.infer<typeof NormalizedImageDimensionsSchema>;
export type VerifyApiResponse = z.infer<typeof VerifyApiResponseSchema>;
