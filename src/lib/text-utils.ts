// Unicode-safe text helpers. JavaScript strings are UTF-16, so naive
// `.slice(n)` / `.length` operate on code units and can split an emoji
// (surrogate pair) in half — the broken half then shows/transmits as "�".

/** Split into grapheme clusters (so emoji, incl. ZWJ sequences, stay whole). */
export function toGraphemes(text: string): string[] {
  try {
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      return Array.from(seg.segment(text), (s) => (s as { segment: string }).segment);
    }
  } catch {
    /* fall through */
  }
  // Fallback: code points (handles surrogate pairs, not ZWJ sequences).
  return Array.from(text);
}

/** Length measured in user-perceived characters (grapheme clusters). */
export function graphemeLength(text: string): number {
  return toGraphemes(text).length;
}

/** Truncate to at most `max` grapheme clusters without ever splitting one. */
export function truncateGraphemes(
  text: string,
  max: number
): { text: string; truncated: boolean } {
  const g = toGraphemes(text);
  if (g.length <= max) return { text, truncated: false };
  return { text: g.slice(0, max).join(""), truncated: true };
}

/** Remove any unpaired UTF-16 surrogate code units (which render as "�"). */
export function stripLoneSurrogates(text: string): string {
  return text
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "") // high surrogate not followed by low
    .replace(/(^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/g, "$1"); // low surrogate not preceded by high
}
