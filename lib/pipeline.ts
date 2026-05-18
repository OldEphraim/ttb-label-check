// Shared verify-one-label pipeline. Used by both /api/verify (single-label,
// Phase 1.5) and /api/batch (per-row in the batch handler, Phase 3.2) so they
// can't drift. Takes raw image bytes + validated expected values, returns the
// full VerifyApiResponse on success or a tagged failure on any pipeline stage.
import { normalizeForExtraction } from "@/lib/image-prep";
import { extractFields } from "@/lib/openai/extractFields";
import { runVerifier } from "@/lib/verifiers/fieldVerdict";
import type { ExpectedValuesInput, VerifyApiResponse } from "@/lib/schema";

export type PipelineFailureKind =
  | "normalize_invalid_image"
  | "normalize_unsupported_format"
  | "normalize_processing_error"
  | "missing_api_key"
  | "api_error"
  | "rate_limited"
  | "timeout"
  | "refusal"
  | "no_parsed"
  | "validation_error";

export type PipelineFailure = {
  ok: false;
  kind: PipelineFailureKind;
  message: string;
};

export type PipelineSuccess = {
  ok: true;
  body: VerifyApiResponse;
};

export type PipelineOutcome = PipelineSuccess | PipelineFailure;

export async function verifyLabel(
  imageBytes: Buffer,
  expected: ExpectedValuesInput,
): Promise<PipelineOutcome> {
  const normalized = await normalizeForExtraction(imageBytes);
  if (!normalized.ok) {
    return {
      ok: false,
      kind: `normalize_${normalized.kind}` as PipelineFailureKind,
      message: normalized.message,
    };
  }

  const extraction = await extractFields({
    imageDataUrl: normalized.dataUrl,
    expected,
  });
  if (!extraction.ok) {
    return { ok: false, kind: extraction.kind, message: extraction.message };
  }

  const fields = runVerifier(extraction.result, expected);
  return {
    ok: true,
    body: {
      imageQuality: extraction.result.imageQuality,
      imageQualityReason: extraction.result.imageQualityReason,
      fields,
      normalizedImageDataUrl: normalized.dataUrl,
      normalizedImageDimensions: normalized.normalizedDimensions,
    },
  };
}
