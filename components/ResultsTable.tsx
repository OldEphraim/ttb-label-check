// Renders the per-field verdict array returned by the API (Phase 1.6 / 2.3).
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VerdictRow } from "@/components/VerdictRow";
import type { FieldVerdict, NormalizedImageDimensions } from "@/lib/schema";

export type ResultsTableProps = {
  fields: FieldVerdict[];
  imageDataUrl: string;
  imageDimensions: NormalizedImageDimensions;
};

export function ResultsTable({ fields, imageDataUrl, imageDimensions }: ResultsTableProps) {
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
          <TableHead>Region</TableHead>
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
          <VerdictRow
            key={field.field}
            verdict={field}
            imageDataUrl={imageDataUrl}
            imageDimensions={imageDimensions}
          />
        ))}
      </TableBody>
    </Table>
  );
}
