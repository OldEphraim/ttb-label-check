"use client";

import { useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ResultsTable } from "@/components/ResultsTable";
import { UploadForm, type UploadSubmitPayload } from "@/components/UploadForm";
import { VerificationResultSchema, type VerificationResult } from "@/lib/schema";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; result: VerificationResult };

export default function Home() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleSubmit({ image, expected }: UploadSubmitPayload) {
    setStatus({ kind: "loading" });
    const formData = new FormData();
    formData.append("image", image);
    formData.append("expected", JSON.stringify(expected));

    let response: Response;
    try {
      response = await fetch("/api/verify", { method: "POST", body: formData });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network request failed.";
      setStatus({ kind: "error", message });
      return;
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      setStatus({
        kind: "error",
        message:
          response.ok
            ? "Server returned a non-JSON response."
            : `Server returned ${response.status} ${response.statusText}.`,
      });
      return;
    }

    if (!response.ok) {
      const message = readErrorMessage(json) ?? `Verification failed (${response.status}).`;
      setStatus({ kind: "error", message });
      return;
    }

    const parsed = VerificationResultSchema.safeParse(json);
    if (!parsed.success) {
      setStatus({
        kind: "error",
        message: "Server returned a response that did not match the expected verification schema.",
      });
      return;
    }
    setStatus({ kind: "ok", result: parsed.data });
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          TTB Label Verification
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload a beverage label and the expected field values from the matching application.
          The tool returns per-field verdicts you use to make a final compliance decision.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Label and expected values</CardTitle>
          <CardDescription>
            JPEG or PNG, up to 10 MB. All fields are required; country of origin is required when the import switch is on.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadForm busy={status.kind === "loading"} onSubmit={handleSubmit} />
        </CardContent>
      </Card>

      {status.kind === "loading" ? (
        <Alert>
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          <AlertTitle>Verifying...</AlertTitle>
          <AlertDescription>
            Calling the extraction model. Typical round trips take a few seconds.
          </AlertDescription>
        </Alert>
      ) : null}

      {status.kind === "error" ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            <p>{status.message}</p>
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatus({ kind: "idle" })}
              >
                Try again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {status.kind === "ok" && status.result.imageQuality === "insufficient" ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Image quality is too low for reliable verification</AlertTitle>
          <AlertDescription>
            <p>Please re-upload a clearer photo.</p>
            {status.result.imageQualityReason ? (
              <p className="mt-1">Reason: {status.result.imageQualityReason}.</p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {status.kind === "ok" && status.result.imageQuality === "sufficient" ? (
        <Card>
          <CardHeader>
            <CardTitle>Verdicts</CardTitle>
            <CardDescription>
              Per-field outcomes. Use these as inputs to your final compliance decision, not as the decision itself.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResultsTable fields={status.result.fields} />
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}

function readErrorMessage(json: unknown): string | undefined {
  if (
    json &&
    typeof json === "object" &&
    "error" in json &&
    json.error &&
    typeof json.error === "object" &&
    "message" in json.error &&
    typeof (json.error as { message: unknown }).message === "string"
  ) {
    return (json.error as { message: string }).message;
  }
  return undefined;
}
