// Single-label vision extraction via gpt-5.4-mini with Structured Outputs (Phase 1.3).
//
// API surface choice: Chat Completions API (`client.chat.completions.parse`) bound with
// `zodResponseFormat` from `openai/helpers/zod`. The openai 6.x SDK also exposes the
// Responses API (`client.responses.parse` + `zodTextFormat`), but Chat Completions matches
// what STEPS.md and CLAUDE.md reference and the canonical example in the helper docstring.
// Future phases should keep this surface unless there's a clear reason to migrate.
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import { getOpenAIClient } from "./client";
import { MODEL_NAME, SYSTEM_PROMPT, buildExtractionPrompt } from "./prompts";
import {
  VerificationResultSchema,
  type ExpectedValuesInput,
  type VerificationResult,
} from "@/lib/schema";

export type ExtractionFailureKind =
  | "missing_api_key"
  | "api_error"
  | "rate_limited"
  | "timeout"
  | "refusal"
  | "no_parsed"
  | "validation_error";

export type ExtractionFailure = {
  ok: false;
  kind: ExtractionFailureKind;
  message: string;
  cause?: unknown;
};

export type ExtractionSuccess = {
  ok: true;
  result: VerificationResult;
  latencyMs: number;
};

export type ExtractionOutcome = ExtractionSuccess | ExtractionFailure;

export type ExtractFieldsInput = {
  // Base64 data URL, e.g. "data:image/jpeg;base64,/9j/4AAQ...".
  imageDataUrl: string;
  expected: ExpectedValuesInput;
};

export async function extractFields(input: ExtractFieldsInput): Promise<ExtractionOutcome> {
  let client: OpenAI;
  try {
    client = getOpenAIClient();
  } catch (err) {
    return { ok: false, kind: "missing_api_key", message: errorMessage(err), cause: err };
  }

  const startedAt = Date.now();
  try {
    const completion = await client.chat.completions.parse({
      model: MODEL_NAME,
      response_format: zodResponseFormat(VerificationResultSchema, "verification"),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildExtractionPrompt(input.expected) },
            { type: "image_url", image_url: { url: input.imageDataUrl, detail: "auto" } },
          ],
        },
      ],
    });
    const message = completion.choices[0]?.message;
    if (message?.refusal) {
      return { ok: false, kind: "refusal", message: message.refusal };
    }
    if (!message?.parsed) {
      return {
        ok: false,
        kind: "no_parsed",
        message: "Model returned no parsed structured output.",
      };
    }
    return { ok: true, result: message.parsed, latencyMs: Date.now() - startedAt };
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      const kind: ExtractionFailureKind = err.status === 429 ? "rate_limited" : "api_error";
      return {
        ok: false,
        kind,
        message: `OpenAI API error (status ${err.status ?? "unknown"}): ${err.message}`,
        cause: err,
      };
    }
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, kind: "timeout", message: "OpenAI request was aborted.", cause: err };
    }
    return { ok: false, kind: "api_error", message: errorMessage(err), cause: err };
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
