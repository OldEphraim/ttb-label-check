// Minimal RFC-4180-ish CSV parser used by the Phase 3.1 batch endpoint and the
// matching client-side preflight UI. Handles:
//   - Quoted fields (preserve internal commas, newlines).
//   - Escaped quotes inside quoted fields (`""` → `"`).
//   - CRLF and bare-CR line endings (normalized to LF).
//   - Trailing newline producing an empty final row (dropped).
// Does NOT handle: alternative delimiters, BOM stripping (callers should
// strip BOM if needed), embedded NUL bytes.
//
// Returns rows as string arrays. Higher-level parsing (header → record) lives
// at the call site so the helper stays small.

export function parseCsv(text: string): string[][] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < normalized.length) {
    const c = normalized[i];
    if (inQuotes) {
      if (c === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += c;
        i += 1;
      }
    } else if (c === '"' && field === "") {
      inQuotes = true;
      i += 1;
    } else if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
    } else {
      field += c;
      i += 1;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop a final empty row that comes from a trailing newline.
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === "") rows.pop();
  }
  return rows;
}

// Convert a header row + data rows to a list of records keyed by column name.
export function csvRowsToRecords(rows: string[][]): {
  records: Record<string, string>[];
  header: string[];
} {
  if (rows.length === 0) return { records: [], header: [] };
  const header = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((r) => {
    const record: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      record[header[i]] = r[i] ?? "";
    }
    return record;
  });
  return { records, header };
}
