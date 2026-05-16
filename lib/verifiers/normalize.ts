// String normalization helpers used by the verifier (trim, collapse whitespace, casefold) (Phase 1.4).
// Phase 2.1 will add unit-notation- and punctuation-aware normalizations on top of these primitives.

export function trimAndCollapseWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function casefold(input: string): string {
  return input.toLocaleLowerCase("en-US");
}

export function normalizeForExactMatch(input: string): string {
  return casefold(trimAndCollapseWhitespace(input));
}

export function isExactMatch(a: string, b: string): boolean {
  return normalizeForExactMatch(a) === normalizeForExactMatch(b);
}
