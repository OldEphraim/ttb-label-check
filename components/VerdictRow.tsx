// Single verdict row: audit thumbnail, field, extracted vs expected, verdict badge, rationale (Phase 1.6 / 2.3).
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";

import { AuditThumbnail } from "@/components/AuditThumbnail";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  FieldVerdict,
  NormalizedImageDimensions,
  VerdictTier,
  VerifiableField,
} from "@/lib/schema";

const FIELD_LABELS: Record<VerifiableField, string> = {
  brandName: "Brand name",
  classType: "Class / type",
  alcoholContent: "Alcohol content",
  netContents: "Net contents",
  bottlerNameAddress: "Bottler name and address",
  countryOfOrigin: "Country of origin",
  governmentWarning: "Government warning",
};

type VerdictStyle = {
  Icon: React.ComponentType<{ className?: string }>;
  text: string;
  containerClass: string;
};

const VERDICT_STYLES: Record<VerdictTier, VerdictStyle> = {
  PASS: {
    Icon: CircleCheck,
    text: "PASS",
    containerClass: "text-emerald-700 dark:text-emerald-400",
  },
  FAIL: {
    Icon: CircleX,
    text: "FAIL",
    containerClass: "text-destructive",
  },
  NEEDS_REVIEW: {
    Icon: TriangleAlert,
    text: "NEEDS REVIEW",
    containerClass: "text-amber-700 dark:text-amber-400",
  },
};

export type VerdictRowProps = {
  verdict: FieldVerdict;
  imageDataUrl: string;
  imageDimensions: NormalizedImageDimensions;
};

export function VerdictRow({ verdict, imageDataUrl, imageDimensions }: VerdictRowProps) {
  const style = VERDICT_STYLES[verdict.verdict];
  const Icon = style.Icon;
  const fieldLabel = FIELD_LABELS[verdict.field];
  return (
    <TableRow>
      <TableCell>
        <AuditThumbnail
          imageDataUrl={imageDataUrl}
          imageDimensions={imageDimensions}
          boundingBox={verdict.boundingBox}
          altText={`Full label, ${fieldLabel} region highlighted`}
        />
      </TableCell>
      <TableCell className="font-medium whitespace-normal">{fieldLabel}</TableCell>
      <TableCell className="whitespace-normal break-words">{verdict.expected}</TableCell>
      <TableCell className="whitespace-normal break-words">{verdict.extracted}</TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-current/30 px-2 py-0.5 text-sm font-semibold",
            style.containerClass,
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          <span>{style.text}</span>
        </span>
      </TableCell>
      <TableCell className="tabular-nums">{verdict.confidence.toFixed(2)}</TableCell>
      <TableCell className="whitespace-normal break-words text-muted-foreground">
        {verdict.rationale}
      </TableCell>
    </TableRow>
  );
}
