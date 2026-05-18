// Single-label verification endpoint (Phase 1.5).
//
// Accepts multipart/form-data with two parts:
//   - `image`     (File)   - the label image, JPEG or PNG, ≤ 10 MB.
//   - `expected`  (string) - JSON-encoded ExpectedValues form payload.
//
// Pipeline: parse multipart → validate image type/size → JSON-parse + Zod-validate
// `expected` → verifyLabel (normalize → extract → verify) → respond.
//
// All errors return `{ error: { kind, message, issues? } }` as JSON. No HTML pages.
// Next.js 16 route handlers use the Web Request/Response API; `request.formData()`
// is the canonical multipart parser per node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
// and the route reference at 03-api-reference/03-file-conventions/route.md.
//
// Runtime is Node.js because sharp (image-prep) and the OpenAI SDK require it.
import { type NextRequest, NextResponse } from "next/server";

import { verifyLabel } from "@/lib/pipeline";
import { ExpectedValuesSchema } from "@/lib/schema";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png"]);

type ErrorBody = {
  error: { kind: string; message: string; issues?: unknown };
};

function errorResponse(
  status: number,
  kind: string,
  message: string,
  issues?: unknown,
): NextResponse<ErrorBody> {
  const body: ErrorBody = { error: { kind, message } };
  if (issues !== undefined) body.error.issues = issues;
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, "invalid_multipart", "Could not parse multipart form data.");
  }

  const imageField = formData.get("image");
  if (!(imageField instanceof File)) {
    return errorResponse(400, "missing_image", "Missing `image` field in upload.");
  }
  if (!ALLOWED_IMAGE_MIMES.has(imageField.type)) {
    return errorResponse(400, "unsupported_type", "Please upload a JPEG or PNG image.");
  }
  if (imageField.size > MAX_BYTES) {
    const mb = (imageField.size / (1024 * 1024)).toFixed(1);
    return errorResponse(
      400,
      "too_large",
      `Image must be 10 MB or smaller. Received ${mb} MB.`,
    );
  }

  const expectedField = formData.get("expected");
  if (typeof expectedField !== "string") {
    return errorResponse(400, "missing_expected", "Missing `expected` field in upload.");
  }
  let rawExpected: unknown;
  try {
    rawExpected = JSON.parse(expectedField);
  } catch {
    return errorResponse(400, "invalid_expected_json", "`expected` must be valid JSON.");
  }
  const parsedExpected = ExpectedValuesSchema.safeParse(rawExpected);
  if (!parsedExpected.success) {
    return errorResponse(
      400,
      "invalid_expected_shape",
      "Expected values are invalid.",
      parsedExpected.error.flatten(),
    );
  }
  const expected = parsedExpected.data;

  const buffer = Buffer.from(await imageField.arrayBuffer());
  const outcome = await verifyLabel(buffer, expected);
  if (!outcome.ok) {
    if (outcome.kind === "missing_api_key") {
      // Don't leak the underlying detail; CLAUDE.md "no silent failures" still applies
      // — the caller gets an explicit explanation, just not the secret-leaking one.
      return errorResponse(
        500,
        "server_misconfigured",
        "The server is misconfigured. Please contact an administrator.",
      );
    }
    return errorResponse(502, outcome.kind, outcome.message);
  }

  return NextResponse.json(outcome.body);
}
