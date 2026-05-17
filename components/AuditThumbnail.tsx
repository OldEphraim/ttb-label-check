// Cropped audit-trail thumbnail of the region the model attended to (Phase 2.3).
//
// Renders a small, fixed-size crop using CSS positioning (no canvas required):
// the full normalized image is absolutely positioned inside a clipped container
// such that the bounding box lands centered in the thumbnail viewport. Click /
// keyboard-activate the <details> summary to disclose the full image with the
// box overlaid as a red highlight.
//
// Model spatial localization is best-effort — a null boundingBox renders a
// "Region not localized" placeholder instead of failing.
import type {
  BoundingBox,
  NormalizedImageDimensions,
} from "@/lib/schema";

export type AuditThumbnailProps = {
  imageDataUrl: string;
  imageDimensions: NormalizedImageDimensions;
  boundingBox: BoundingBox | null;
  altText?: string;
};

const THUMB_WIDTH_PX = 96;
const THUMB_HEIGHT_PX = 64;

export function AuditThumbnail({
  imageDataUrl,
  imageDimensions,
  boundingBox,
  altText,
}: AuditThumbnailProps) {
  return (
    <details className="group/audit inline-block align-middle">
      <summary
        className="list-none cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
        aria-label={
          boundingBox
            ? "Show full label with attended region highlighted"
            : "Show full label (region was not localized)"
        }
      >
        {boundingBox ? (
          <ThumbnailCrop
            imageDataUrl={imageDataUrl}
            imageDimensions={imageDimensions}
            boundingBox={boundingBox}
          />
        ) : (
          <NullPlaceholder />
        )}
      </summary>
      <div className="mt-2">
        <ExpandedView
          imageDataUrl={imageDataUrl}
          boundingBox={boundingBox}
          altText={altText}
        />
      </div>
    </details>
  );
}

function ThumbnailCrop({
  imageDataUrl,
  imageDimensions,
  boundingBox,
}: {
  imageDataUrl: string;
  imageDimensions: NormalizedImageDimensions;
  boundingBox: BoundingBox;
}) {
  const { width: imgW, height: imgH } = imageDimensions;
  const bx = boundingBox.x * imgW;
  const by = boundingBox.y * imgH;
  const bw = Math.max(boundingBox.width * imgW, 1);
  const bh = Math.max(boundingBox.height * imgH, 1);
  // Fit the box inside the thumbnail with letterboxing as needed.
  const scale = Math.min(THUMB_WIDTH_PX / bw, THUMB_HEIGHT_PX / bh);
  const scaledImgW = imgW * scale;
  const scaledImgH = imgH * scale;
  const scaledBoxW = bw * scale;
  const scaledBoxH = bh * scale;
  const padX = (THUMB_WIDTH_PX - scaledBoxW) / 2;
  const padY = (THUMB_HEIGHT_PX - scaledBoxH) / 2;
  const left = padX - bx * scale;
  const top = padY - by * scale;
  return (
    <div
      style={{ width: THUMB_WIDTH_PX, height: THUMB_HEIGHT_PX }}
      className="relative overflow-hidden rounded-md border border-input bg-muted"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL crop; next/image can't optimize blobs. */}
      <img
        src={imageDataUrl}
        alt=""
        aria-hidden="true"
        style={{
          position: "absolute",
          left: `${left}px`,
          top: `${top}px`,
          width: `${scaledImgW}px`,
          height: `${scaledImgH}px`,
          maxWidth: "none",
        }}
      />
    </div>
  );
}

function NullPlaceholder() {
  return (
    <div
      style={{ width: THUMB_WIDTH_PX, height: THUMB_HEIGHT_PX }}
      className="grid place-items-center rounded-md border border-dashed border-input bg-muted px-1 text-center text-[10px] leading-tight text-muted-foreground"
    >
      Region not localized
    </div>
  );
}

function ExpandedView({
  imageDataUrl,
  boundingBox,
  altText,
}: {
  imageDataUrl: string;
  boundingBox: BoundingBox | null;
  altText?: string;
}) {
  return (
    <div className="relative inline-block max-w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview; next/image can't optimize blobs. */}
      <img
        src={imageDataUrl}
        alt={altText ?? "Full label"}
        className="block h-auto max-h-96 max-w-md rounded-md border border-input"
      />
      {boundingBox ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-sm"
          style={{
            left: `${boundingBox.x * 100}%`,
            top: `${boundingBox.y * 100}%`,
            width: `${boundingBox.width * 100}%`,
            height: `${boundingBox.height * 100}%`,
            outline: "2px solid #ef4444",
            boxShadow: "0 0 0 2px rgba(255,255,255,0.8)",
          }}
        />
      ) : null}
    </div>
  );
}
