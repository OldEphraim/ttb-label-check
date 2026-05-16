// Image preprocessing for the OpenAI vision call (Phase 1.4.5).
//
// OpenAI's Chat Completions vision endpoint downsamples large images to a fixed tile
// grid internally; bytes above the high-detail upper bound of 1568 px on the longer
// side are paid for in upload time but discarded by the model. End-to-end testing in
// Phase 1.4 showed 14–17 s round-trips on a 3.3 MB native PNG, dominated by upload.
//
// `normalizeForExtraction` takes a byte buffer and returns a base64 data URL ready to
// drop into `image_url.url`, after:
//   1. Applying EXIF Orientation (sharp does this when .rotate() is called with no args).
//   2. Resizing so the longer dimension is <= MAX_DIMENSION_PX, preserving aspect
//      ratio, never upscaling smaller inputs.
//   3. Re-encoding as JPEG at OUTPUT_JPEG_QUALITY.
//
// File I/O is the caller's responsibility. Errors are surfaced via a tagged outcome
// union mirroring extractFields.ts; this module never throws on invalid input.
import sharp from "sharp";

export const MAX_DIMENSION_PX = 1568;
export const OUTPUT_JPEG_QUALITY = 85;
export const OUTPUT_MIME = "image/jpeg" as const;

const ACCEPTED_FORMATS = new Set<string>(["jpeg", "jpg", "png", "webp"]);

export type Dimensions = { width: number; height: number };

export type NormalizeFailureKind =
  | "invalid_image"
  | "unsupported_format"
  | "processing_error";

export type NormalizeFailure = {
  ok: false;
  kind: NormalizeFailureKind;
  message: string;
  cause?: unknown;
};

export type NormalizeSuccess = {
  ok: true;
  dataUrl: string;
  mime: typeof OUTPUT_MIME;
  originalBytes: number;
  normalizedBytes: number;
  originalDimensions: Dimensions;
  normalizedDimensions: Dimensions;
};

export type NormalizeOutcome = NormalizeSuccess | NormalizeFailure;

export async function normalizeForExtraction(
  input: Buffer | Uint8Array,
): Promise<NormalizeOutcome> {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const originalBytes = buf.byteLength;

  let originalDimensions: Dimensions;
  let format: string | undefined;
  try {
    // Apply EXIF rotation before reading dimensions so width/height reflect the
    // image as it will render. metadata() on a rotated pipeline returns
    // post-rotation dims in sharp 0.32+.
    const meta = await sharp(buf, { failOn: "error" }).rotate().metadata();
    if (!meta.width || !meta.height || !meta.format) {
      return {
        ok: false,
        kind: "invalid_image",
        message: "Image metadata is missing required width/height/format fields.",
      };
    }
    originalDimensions = { width: meta.width, height: meta.height };
    format = meta.format;
  } catch (err) {
    return {
      ok: false,
      kind: "invalid_image",
      message: `Could not decode image: ${errorMessage(err)}`,
      cause: err,
    };
  }

  if (!ACCEPTED_FORMATS.has(format)) {
    return {
      ok: false,
      kind: "unsupported_format",
      message: `Unsupported image format "${format}". Expected JPEG, PNG, or WebP.`,
    };
  }

  try {
    const { data, info } = await sharp(buf, { failOn: "error" })
      .rotate()
      .resize({
        width: MAX_DIMENSION_PX,
        height: MAX_DIMENSION_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: OUTPUT_JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true });

    return {
      ok: true,
      dataUrl: `data:${OUTPUT_MIME};base64,${data.toString("base64")}`,
      mime: OUTPUT_MIME,
      originalBytes,
      normalizedBytes: data.byteLength,
      originalDimensions,
      normalizedDimensions: { width: info.width, height: info.height },
    };
  } catch (err) {
    return {
      ok: false,
      kind: "processing_error",
      message: `sharp pipeline failed: ${errorMessage(err)}`,
      cause: err,
    };
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
