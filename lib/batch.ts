// Shared types for the Phase 3.2 batch streaming protocol. Both the server
// (app/api/batch/route.ts) and the client SSE consumer (app/batch/page.tsx)
// import these so their wire envelopes can't drift.
import { z } from "zod";

import { VerifyApiResponseSchema } from "@/lib/schema";

export const BATCH_MAX_ROWS = 300;
export const BATCH_CONCURRENCY = 5;

// CSV header columns expected for batch input (Phase 3.1).
export const BATCH_CSV_COLUMNS = [
  "filename",
  "brandName",
  "classType",
  "alcoholContent",
  "netContents",
  "bottlerNameAddress",
  "beverageType",
  "isImport",
  "countryOfOrigin",
] as const;

// Per-row event emitted on the SSE stream. The client treats each event
// independently — a failed row doesn't abort the batch.
export const BatchRowEventSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    index: z.number().int().nonnegative(),
    filename: z.string(),
    result: VerifyApiResponseSchema,
  }),
  z.object({
    ok: z.literal(false),
    index: z.number().int().nonnegative(),
    filename: z.string(),
    error: z.object({
      kind: z.string(),
      message: z.string(),
    }),
  }),
]);

export type BatchRowEvent = z.infer<typeof BatchRowEventSchema>;
