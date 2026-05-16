// Shared TypeScript types derived from lib/schema.ts (Phase 1.2).
// This file re-exports the inferred types so consumers can import from a stable surface
// without pulling in the full Zod schema module when they only need types.
export type {
  BeverageType,
  VerdictTier,
  VerifiableField,
  ImageQuality,
  ExpectedValues,
  ExpectedValuesInput,
  FieldVerdict,
  VerificationResult,
} from "@/lib/schema";
