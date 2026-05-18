"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { ResultsTable } from "@/components/ResultsTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BATCH_CSV_COLUMNS,
  BATCH_MAX_ROWS,
  BatchRowEventSchema,
  type BatchRowEvent,
} from "@/lib/batch";
import { csvRowsToRecords, parseCsv } from "@/lib/csv";
import type { VerifyApiResponse } from "@/lib/schema";

type Status =
  | { kind: "idle" }
  | { kind: "streaming"; total: number }
  | { kind: "error"; message: string }
  | { kind: "complete"; total: number };

type Preflight =
  | { ok: false; reason: string }
  | {
      ok: true;
      rowCount: number;
      filenamesInCsv: string[];
      uploadedNames: string[];
      missingUploads: string[];
      extraUploads: string[];
    };

export default function BatchPage() {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [csvName, setCsvName] = useState<string | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [rows, setRows] = useState<Map<number, BatchRowEvent>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const preflight = useMemo<Preflight>(() => {
    if (csvText === null) return { ok: false, reason: "Choose a CSV file." };
    if (images.length === 0) return { ok: false, reason: "Choose one or more image files." };
    let rawRows: string[][];
    try {
      rawRows = parseCsv(csvText);
    } catch (err) {
      return { ok: false, reason: `CSV parse failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (rawRows.length === 0) return { ok: false, reason: "CSV contains no rows." };
    const { records, header } = csvRowsToRecords(rawRows);
    const missingColumns = BATCH_CSV_COLUMNS.filter((c) => !header.includes(c));
    if (missingColumns.length > 0) {
      return {
        ok: false,
        reason: `CSV is missing required columns: ${missingColumns.join(", ")}.`,
      };
    }
    if (records.length === 0) return { ok: false, reason: "CSV has a header but no data rows." };
    if (records.length > BATCH_MAX_ROWS) {
      return { ok: false, reason: `Batch may contain at most ${BATCH_MAX_ROWS} labels; CSV has ${records.length}.` };
    }
    const filenamesInCsv = records.map((r) => (r.filename ?? "").trim());
    const uploadedNames = images.map((f) => f.name);
    const csvSet = new Set(filenamesInCsv);
    const uploadSet = new Set(uploadedNames);
    const missingUploads = [...csvSet].filter((f) => f !== "" && !uploadSet.has(f));
    const extraUploads = [...uploadSet].filter((f) => !csvSet.has(f));
    return {
      ok: true,
      rowCount: records.length,
      filenamesInCsv,
      uploadedNames,
      missingUploads,
      extraUploads,
    };
  }, [csvText, images]);

  const canSubmit =
    preflight.ok &&
    preflight.missingUploads.length === 0 &&
    preflight.extraUploads.length === 0 &&
    status.kind !== "streaming";

  async function handleCsvChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setCsvText(null);
      setCsvName(null);
      return;
    }
    setCsvName(file.name);
    setCsvText(await file.text());
    setRows(new Map());
    setStatus({ kind: "idle" });
  }

  function handleImagesChange(event: ChangeEvent<HTMLInputElement>) {
    const list = event.target.files;
    setImages(list ? Array.from(list) : []);
    setRows(new Map());
    setStatus({ kind: "idle" });
  }

  async function handleSubmit() {
    if (!preflight.ok || !canSubmit || csvText === null) return;
    setRows(new Map());
    setStatus({ kind: "streaming", total: preflight.rowCount });
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const formData = new FormData();
    formData.append("csv", csvText);
    for (const image of images) {
      formData.append(image.name, image, image.name);
    }

    let response: Response;
    try {
      response = await fetch("/api/batch", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network request failed.",
      });
      return;
    }

    if (!response.ok || !response.body) {
      let serverMessage = `Server returned ${response.status} ${response.statusText}.`;
      try {
        const json = (await response.json()) as { error?: { message?: string } };
        if (json?.error?.message) serverMessage = json.error.message;
      } catch {
        // ignore; keep status-line fallback message
      }
      setStatus({ kind: "error", message: serverMessage });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sepIdx: number;
        while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          dispatchEventLine(rawEvent, setRows);
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Stream read failed.",
        });
      }
      return;
    }
    setStatus({ kind: "complete", total: preflight.rowCount });
  }

  const sortedRows = useMemo(
    () => [...rows.values()].sort((a, b) => a.index - b.index),
    [rows],
  );
  const summary = useMemo(() => summarize(sortedRows), [sortedRows]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Batch verification</h1>
        <p className="text-sm text-muted-foreground">
          Upload a CSV of expected values paired with their label images. Results stream in row-by-row.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Batch input</CardTitle>
          <CardDescription>
            CSV columns (in any order, but all required): <code>{BATCH_CSV_COLUMNS.join(", ")}</code>.
            {" "}
            {"One image file per row, with the file's name matching the row's "}
            <code>filename</code>
            {" column."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="csv-input" className="text-base">
              CSV file
            </Label>
            <input
              id="csv-input"
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvChange}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted"
            />
            {csvName ? (
              <p className="text-xs text-muted-foreground">Loaded: {csvName}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="images-input" className="text-base">
              Label images (JPEG / PNG, multiple)
            </Label>
            <input
              id="images-input"
              type="file"
              accept="image/jpeg,image/png"
              multiple
              onChange={handleImagesChange}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted"
            />
            {images.length > 0 ? (
              <p className="text-xs text-muted-foreground">{images.length} image(s) selected</p>
            ) : null}
          </div>

          <PreflightPanel preflight={preflight} />

          <div>
            <Button
              type="button"
              size="lg"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              {status.kind === "streaming" ? "Verifying batch..." : "Verify batch"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {status.kind === "streaming" ? (
        <Alert>
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          <AlertTitle>
            Streaming results — {sortedRows.length} of {status.total} complete
          </AlertTitle>
          <AlertDescription>
            Concurrent labels are processed 5 at a time; rows appear as each label finishes.
          </AlertDescription>
        </Alert>
      ) : null}

      {status.kind === "error" ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Batch failed before completion</AlertTitle>
          <AlertDescription>
            <p>{status.message}</p>
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={() => setStatus({ kind: "idle" })}>
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {sortedRows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Batch results</CardTitle>
            <CardDescription>
              {status.kind === "complete"
                ? `Stream complete. ${summary.successCount} labels processed, ${summary.errorCount} errored.`
                : `Streaming. ${sortedRows.length} row(s) in so far.`} {" "}
              Totals across processed labels: <strong>{summary.passTotal}</strong> PASS, <strong>{summary.nrTotal}</strong> NEEDS_REVIEW, <strong>{summary.failTotal}</strong> FAIL.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BatchResultsTable rows={sortedRows} />
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}

function dispatchEventLine(
  rawEvent: string,
  setRows: React.Dispatch<React.SetStateAction<Map<number, BatchRowEvent>>>,
): void {
  // SSE events may carry multiple `data:` lines that concatenate; per spec we
  // treat each `data: ...` line and join with newlines. Our server only emits
  // a single `data:` line per event, but the parsing is robust either way.
  const dataLines = rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return;
  const payload = dataLines.join("\n");
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return;
  }
  const event = BatchRowEventSchema.safeParse(parsed);
  if (!event.success) return;
  setRows((prev) => {
    const next = new Map(prev);
    next.set(event.data.index, event.data);
    return next;
  });
}

function summarize(rows: BatchRowEvent[]) {
  let passTotal = 0;
  let nrTotal = 0;
  let failTotal = 0;
  let successCount = 0;
  let errorCount = 0;
  for (const row of rows) {
    if (row.ok) {
      successCount++;
      for (const v of row.result.fields) {
        if (v.verdict === "PASS") passTotal++;
        else if (v.verdict === "NEEDS_REVIEW") nrTotal++;
        else failTotal++;
      }
    } else {
      errorCount++;
    }
  }
  return { passTotal, nrTotal, failTotal, successCount, errorCount };
}

function PreflightPanel({ preflight }: { preflight: Preflight }) {
  if (!preflight.ok) {
    return (
      <Alert>
        <AlertTitle>Pre-flight</AlertTitle>
        <AlertDescription>{preflight.reason}</AlertDescription>
      </Alert>
    );
  }
  const clean =
    preflight.missingUploads.length === 0 && preflight.extraUploads.length === 0;
  return (
    <Alert variant={clean ? "default" : "destructive"}>
      <AlertTitle>
        Pre-flight: {preflight.rowCount} CSV row(s), {preflight.uploadedNames.length} image(s).
        {clean ? " Ready." : " Mismatches found."}
      </AlertTitle>
      <AlertDescription>
        {preflight.missingUploads.length > 0 ? (
          <p>
            CSV rows without an uploaded file ({preflight.missingUploads.length}):{" "}
            <code className="break-all">{preflight.missingUploads.join(", ")}</code>
          </p>
        ) : null}
        {preflight.extraUploads.length > 0 ? (
          <p>
            Uploaded files not referenced in the CSV ({preflight.extraUploads.length}):{" "}
            <code className="break-all">{preflight.extraUploads.join(", ")}</code>
          </p>
        ) : null}
        {clean ? <p>Every CSV row has a matching image. Submit when ready.</p> : null}
      </AlertDescription>
    </Alert>
  );
}

function BatchResultsTable({ rows }: { rows: BatchRowEvent[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>Filename</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead>Summary</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <BatchRow key={row.index} row={row} />
        ))}
      </TableBody>
    </Table>
  );
}

function BatchRow({ row }: { row: BatchRowEvent }) {
  if (!row.ok) {
    return (
      <TableRow>
        <TableCell className="tabular-nums">{row.index + 1}</TableCell>
        <TableCell className="break-all">{row.filename}</TableCell>
        <TableCell>
          <span className="text-destructive font-semibold">error</span>
        </TableCell>
        <TableCell className="break-words text-muted-foreground" colSpan={2}>
          <span className="font-mono text-xs">{row.error.kind}</span>: {row.error.message}
        </TableCell>
      </TableRow>
    );
  }
  return <BatchRowOk row={row} />;
}

function BatchRowOk({ row }: { row: BatchRowEvent & { ok: true } }) {
  const counts = perRowCounts(row.result);
  return (
    <>
      <TableRow>
        <TableCell className="tabular-nums">{row.index + 1}</TableCell>
        <TableCell className="break-all">{row.filename}</TableCell>
        <TableCell>
          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">processed</span>
        </TableCell>
        <TableCell className="text-sm">
          {counts.pass} PASS · {counts.nr} NEEDS_REVIEW · {counts.fail} FAIL
          {row.result.imageQuality === "insufficient" ? " · image insufficient" : null}
        </TableCell>
        <TableCell>
          <details>
            <summary className="cursor-pointer text-sm text-primary">View verdicts</summary>
            <div className="mt-3">
              {row.result.imageQuality === "insufficient" ? (
                <Alert variant="destructive">
                  <TriangleAlert aria-hidden="true" />
                  <AlertTitle>Image quality insufficient</AlertTitle>
                  <AlertDescription>
                    {row.result.imageQualityReason ? <p>Reason: {row.result.imageQualityReason}.</p> : <p>Re-upload a clearer photo.</p>}
                  </AlertDescription>
                </Alert>
              ) : (
                <ResultsTable
                  fields={row.result.fields}
                  imageDataUrl={row.result.normalizedImageDataUrl}
                  imageDimensions={row.result.normalizedImageDimensions}
                />
              )}
            </div>
          </details>
        </TableCell>
      </TableRow>
    </>
  );
}

function perRowCounts(result: VerifyApiResponse) {
  let pass = 0;
  let nr = 0;
  let fail = 0;
  for (const v of result.fields) {
    if (v.verdict === "PASS") pass++;
    else if (v.verdict === "NEEDS_REVIEW") nr++;
    else fail++;
  }
  return { pass, nr, fail };
}
