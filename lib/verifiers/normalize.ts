// String normalization helpers and NEEDS_REVIEW trigger predicates (Phase 1.4 / 2.1).
//
// Phase 2.1 deferred: unit-notation differences (e.g. "Alc./Vol." vs "ABV",
// "% by Vol" vs "ABV") are not handled by the predicates below — the four
// triggers cover case / whitespace / punctuation / containment, which catch
// the most common cosmetic mismatches but stop short of unit semantics.
// A unit-aware normalizer would need a domain-specific vocabulary map and is
// intentionally deferred; it's unlikely to pay back inside the prototype
// budget. (Pure-casing unit differences like "750 mL" vs "750 ML" still hit
// isCaseOnlyDifference and round-trip as NEEDS_REVIEW.)

export function trimAndCollapseWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function casefold(input: string): string {
  return input.toLocaleLowerCase("en-US");
}

export function normalizeForExactMatch(input: string): string {
  return casefold(trimAndCollapseWhitespace(input));
}

/**
 * Phase 2 PASS bar: equal after trimming leading/trailing whitespace only.
 * Internal whitespace, casing, and punctuation differences fall through to
 * the NEEDS_REVIEW trigger chain rather than being absorbed into PASS.
 */
export function isStrictMatch(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

/**
 * True if stripping all whitespace makes the strings equal, but the raw
 * strings differ. Catches "750 mL" vs "750mL", "Foo Bar" vs "Foo  Bar".
 */
export function isWhitespaceOnlyDifference(a: string, b: string): boolean {
  if (a === b) return false;
  return a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
}

// Per the Phase 2.1 spec: .,;:!?'"`()[]{}/- as the punctuation alphabet.
const PUNCTUATION_RE = /[.,;:!?'"`()[\]{}/-]/g;

/**
 * True if removing common punctuation, then trimming and collapsing
 * whitespace, makes the strings equal, but the originals (with punctuation)
 * differ. Catches "750 mL." vs "750 mL", "Foo, Bar" vs "Foo Bar".
 */
export function isPunctuationOnlyDifference(a: string, b: string): boolean {
  if (a === b) return false;
  const strip = (s: string) => trimAndCollapseWhitespace(s.replace(PUNCTUATION_RE, ""));
  return strip(a) === strip(b);
}

/**
 * True if casefolding makes the trim+collapsed strings equal, but they differ
 * at the trim+collapsed (pre-casefold) level. Catches "STONE'S THROW" vs
 * "Stone's Throw".
 */
export function isCaseOnlyDifference(a: string, b: string): boolean {
  if (a === b) return false;
  const aTC = trimAndCollapseWhitespace(a);
  const bTC = trimAndCollapseWhitespace(b);
  if (aTC === bTC) return false;
  return casefold(aTC) === casefold(bTC);
}

/**
 * True if one string contains the other (after trim + collapse + casefold)
 * as a substring, but the two are not equal at that level. Catches
 * "Bottled by Foo Distillery, City, ST" vs "Foo Distillery, City, ST", or
 * "45% Alc./Vol.\n(90 Proof)" vs "45% Alc./Vol.".
 */
export function containsAfterNormalize(a: string, b: string): boolean {
  const aN = normalizeForExactMatch(a);
  const bN = normalizeForExactMatch(b);
  if (!aN || !bN) return false;
  if (aN === bN) return false;
  return aN.includes(bN) || bN.includes(aN);
}
