// Renders the per-field verdict array returned by the API (Phase 1.6).
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VerdictRow } from "@/components/VerdictRow";
import type { FieldVerdict } from "@/lib/schema";

export function ResultsTable({ fields }: { fields: FieldVerdict[] }) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No verdicts were produced. This usually means the image quality check excluded all fields.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Field</TableHead>
          <TableHead>Expected</TableHead>
          <TableHead>Extracted</TableHead>
          <TableHead>Verdict</TableHead>
          <TableHead>Confidence</TableHead>
          <TableHead>Rationale</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fields.map((field) => (
          <VerdictRow key={field.field} verdict={field} />
        ))}
      </TableBody>
    </Table>
  );
}
