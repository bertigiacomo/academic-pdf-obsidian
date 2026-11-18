// ─────────────────────────────────────────────────────────────────────────────
// F5 / D6: page numbering with front matter, as in a LaTeX book.
//   - front matter (title page, contents) counts in lower-case roman
//     numerals from i; the title page counts but shows no number;
//   - the body counts in arabic numerals from the "first page number"
//     setting, so the contents' page numbers never depend on its own length.
// Without front matter the upstream numbering is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n <= 0) return String(n);
  const table: [number, string][] = [
    [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
    [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ];
  let out = "";
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
}

export type FrontKind = "title" | "toc";

/** What the footer and header of one page show. */
export interface PageNumbering {
  /** The page number text for the footer, or null for none. */
  numStr: string | null;
  showHeader: boolean;
  showFooter: boolean;
}

/** Fills {{current}}, {{total}} and {{title}} like the upstream format. */
export type FormatNumber = (current: number, total: number) => string;

/**
 * Per-page numbering when the document has front matter. `front` lists the
 * kind of each front page; `bodyPages` is the number of body pages.
 */
export function frontMatterNumbering(
  front: FrontKind[], bodyPages: number, firstBodyNumber: number, format: FormatNumber,
): PageNumbering[] {
  const out: PageNumbering[] = front.map((kind, i) => kind === "title"
    ? { numStr: null, showHeader: false, showFooter: false }
    // Front matter shows the bare roman number: "ii / 12" would mix two counts.
    : { numStr: toRoman(i + 1), showHeader: false, showFooter: true });
  const total = firstBodyNumber + bodyPages - 1;
  for (let i = 0; i < bodyPages; i++) {
    out.push({ numStr: format(firstBodyNumber + i, total), showHeader: true, showFooter: true });
  }
  return out;
}

/** One range of the PDF's /PageLabels number tree. */
export interface PageLabelRange {
  /** 0-based index of the range's first page. */
  startPage: number;
  style: "r" | "D";
  /** The number of the range's first page. */
  first: number;
}

/** Page labels for PDF readers, matching the printed numbers. */
export function pageLabelRanges(frontPages: number, firstBodyNumber: number): PageLabelRange[] {
  if (frontPages === 0) return [];
  return [
    { startPage: 0, style: "r", first: 1 },
    { startPage: frontPages, style: "D", first: Math.max(1, firstBodyNumber) },
  ];
}
