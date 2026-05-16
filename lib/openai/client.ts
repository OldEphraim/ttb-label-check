// OpenAI client initialization from OPENAI_API_KEY (Phase 1.3).
import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Copy .env.example to .env.local and fill in the key, " +
        "or set the variable in your deployment environment.",
    );
  }
  client ??= new OpenAI({ apiKey });
  return client;
}
