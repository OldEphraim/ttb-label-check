// Batch verification endpoint (Phase 3.1 + 3.2).
//
// Accepts multipart/form-data with two kinds of parts:
//   - `csv`         (string) - the CSV text, with columns:
//                              filename, brandName, classType, alcoholContent,
//                              netContents, bottlerNameAddress, beverageType,
//                              isImport, countryOfOrigin.
//   - <filename>    (File)   - one File part per CSV row's `filename`.
//
// Pre-validation runs to completion before any OpenAI calls: every CSV row is
// validated against ExpectedValuesSchema; every filename is matched against the
// uploaded files (mismatches → 400 with the offending names listed); the row
// count is capped at BATCH_MAX_ROWS. Only after pre-validation passes do we
// open the SSE stream and begin per-label processing.
//
// Processing runs with BATCH_CONCURRENCY workers draining a shared queue.
// Each completed row is emitted as a Server-Sent Event (`data: <json>\n\n`).
// Individual failures emit ok:false events and do NOT abort the batch.
//
// Per the Next.js 16 streaming guide (node_modules/next/dist/docs/01-app/02-guides/streaming.md)
// and the route reference (03-api-reference/03-file-conventions/route.md), the
// canonical streaming pattern is a Web ReadableStream returned from a Response —
// no framework-specific SSE helper, just the underlying Web Platform APIs.
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  BATCH_CONCURRENCY,
  BATCH_CSV_COLUMNS,
  BATCH_MAX_ROWS,
  type BatchRowEvent,
} from "@/lib/batch";
import { csvRowsToRecords, parseCsv } from "@/lib/csv";
import { verifyLabel } from "@/lib/pipeline";
import { ExpectedValuesSchema, type ExpectedValuesInput } from "@/lib/schema";

export const runtime = "nodejs";
// Vercel free-tier function timeout is 60s; a 20-label batch at 5 concurrency
// with ~5s per label takes ~20s, but the Phase 4.3 scale test runs 50–100 labels,
// which needs more headroom. 300s is the upper bound on Vercel Fluid compute.
export const maxDuration = 300;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png"]);

type ErrorBody = {
  error: { kind: string; message: string; details?: unknown };
};

function errorResponse(
  status: number,
  kind: string,
  message: string,
  details?: unknown,
): NextResponse<ErrorBody> {
  const body: ErrorBody = { error: { kind, message } };
  if (details !== undefined) body.error.details = details;
  return NextResponse.json(body, { status });
}

type ValidatedRow = {
  index: number;
  filename: string;
  expected: ExpectedValuesInput;
  file: File;
};

export async function POST(request: NextRequest): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, "invalid_multipart", "Could not parse multipart form data.");
  }

  const csvField = formData.get("csv");
  if (typeof csvField !== "string" || csvField.trim() === "") {
    return errorResponse(400, "missing_csv", "Missing `csv` field in upload.");
  }

  // Parse CSV.
  let rawRows: string[][];
  try {
    rawRows = parseCsv(csvField);
  } catch (err) {
    return errorResponse(400, "csv_parse_error", `CSV parse failed: ${errorMessage(err)}`);
  }
  if (rawRows.length === 0) {
    return errorResponse(400, "csv_empty", "CSV contains no rows.");
  }

  const { records, header } = csvRowsToRecords(rawRows);
  const missingColumns = BATCH_CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missingColumns.length > 0) {
    return errorResponse(
      400,
      "csv_header_invalid",
      `CSV is missing required columns: ${missingColumns.join(", ")}.`,
      { expected: BATCH_CSV_COLUMNS, got: header },
    );
  }
  if (records.length === 0) {
    return errorResponse(400, "csv_empty", "CSV has a header but no data rows.");
  }
  if (records.length > BATCH_MAX_ROWS) {
    return errorResponse(
      400,
      "csv_too_many_rows",
      `Batch may contain at most ${BATCH_MAX_ROWS} labels; received ${records.length}.`,
    );
  }

  // Validate every row.
  const rowIssues: { index: number; filename: string; issues: unknown }[] = [];
  const validated: { index: number; filename: string; expected: ExpectedValuesInput }[] = [];
  records.forEach((record, idx) => {
    const filename = record.filename?.trim() ?? "";
    const rawExpected = {
      brandName: record.brandName ?? "",
      classType: record.classType ?? "",
      alcoholContent: record.alcoholContent ?? "",
      netContents: record.netContents ?? "",
      bottlerNameAddress: record.bottlerNameAddress ?? "",
      beverageType: record.beverageType ?? "",
      isImport: parseBoolean(record.isImport ?? ""),
      countryOfOrigin: record.countryOfOrigin?.trim() === "" ? undefined : record.countryOfOrigin,
    };
    const parsed = ExpectedValuesSchema.safeParse(rawExpected);
    if (!parsed.success) {
      rowIssues.push({ index: idx, filename, issues: parsed.error.flatten() });
      return;
    }
    if (filename === "") {
      rowIssues.push({
        index: idx,
        filename,
        issues: { fieldErrors: { filename: ["Filename is required."] } },
      });
      return;
    }
    validated.push({ index: idx, filename, expected: parsed.data });
  });

  if (rowIssues.length > 0) {
    return errorResponse(
      400,
      "csv_row_validation",
      "One or more CSV rows are invalid.",
      rowIssues,
    );
  }

  // Pair every validated row to an uploaded File.
  const uploadedFilenames = new Set<string>();
  const filesByName = new Map<string, File>();
  for (const [key, value] of formData.entries()) {
    if (key === "csv") continue;
    if (value instanceof File) {
      uploadedFilenames.add(value.name);
      filesByName.set(value.name, value);
    }
  }

  const expectedFilenames = new Set(validated.map((r) => r.filename));
  const missingUploads = [...expectedFilenames].filter((f) => !filesByName.has(f));
  const extraUploads = [...uploadedFilenames].filter((f) => !expectedFilenames.has(f));
  if (missingUploads.length > 0 || extraUploads.length > 0) {
    return errorResponse(
      400,
      "filename_mismatch",
      "CSV filenames and uploaded files do not match one-to-one.",
      { missingUploads, extraUploads },
    );
  }

  // Validate each uploaded file's type and size.
  for (const row of validated) {
    const file = filesByName.get(row.filename)!;
    if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
      return errorResponse(
        400,
        "unsupported_type",
        `File "${row.filename}" must be JPEG or PNG (got ${file.type || "unknown"}).`,
      );
    }
    if (file.size > MAX_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      return errorResponse(
        400,
        "too_large",
        `File "${row.filename}" is ${mb} MB; the per-label limit is 10 MB.`,
      );
    }
  }

  const ready: ValidatedRow[] = validated.map((row) => ({
    ...row,
    file: filesByName.get(row.filename)!,
  }));

  // Stream results via SSE. Pre-validation is done; from here on individual
  // failures become ok:false events rather than 4xx responses.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueueEvent = (event: BatchRowEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      let cursor = 0;
      const workers = Array.from(
        { length: Math.min(BATCH_CONCURRENCY, ready.length) },
        async () => {
          while (true) {
            const myIndex = cursor++;
            if (myIndex >= ready.length) return;
            const row = ready[myIndex];
            try {
              const buffer = Buffer.from(await row.file.arrayBuffer());
              const outcome = await verifyLabel(buffer, row.expected);
              if (outcome.ok) {
                enqueueEvent({
                  ok: true,
                  index: row.index,
                  filename: row.filename,
                  result: outcome.body,
                });
              } else {
                enqueueEvent({
                  ok: false,
                  index: row.index,
                  filename: row.filename,
                  error: { kind: outcome.kind, message: outcome.message },
                });
              }
            } catch (err) {
              enqueueEvent({
                ok: false,
                index: row.index,
                filename: row.filename,
                error: { kind: "worker_exception", message: errorMessage(err) },
              });
            }
          }
        },
      );

      try {
        await Promise.all(workers);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Hint to proxies (e.g. nginx, some CDNs) not to buffer the response.
      "X-Accel-Buffering": "no",
    },
  });
}

function parseBoolean(raw: string): boolean | string {
  const v = raw.trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  // Returning the raw value here lets Zod produce a clear "expected boolean"
  // error rather than us silently coercing to false.
  return raw;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
