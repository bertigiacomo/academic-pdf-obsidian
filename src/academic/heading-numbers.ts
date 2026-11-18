// ─────────────────────────────────────────────────────────────────────────────
// F5: section numbers (1, 1.1, 1.1.1), as LaTeX's article with secnumdepth 3.
//
// The top level is the highest heading level the document uses after the
// title, so a note written with ## sections gets 1, 2, 3 as well. The first
// heading is the document title, not a section, when it is an H1 equal to
// the title: it gets no number and stays out of the contents.
// ─────────────────────────────────────────────────────────────────────────────

/** Levels numbered below the top one: 3 in all (section, subsection, subsubsection). */
export const NUMBER_DEPTH = 3;

/** Marks the heading that is the document title. */
export const TITLE_HEADING_ATTR = "data-apdf-title";
/** Carries a heading's depth: 0 section, 1 subsection, 2 subsubsection, 3 paragraph. */
export const HEADING_DEPTH_ATTR = "data-apdf-depth";
/** Carries a heading's section number ("2.1"). */
export const HEADING_NUMBER_ATTR = "data-apdf-num";

export function sameTitle(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return !!a.trim() && norm(a) === norm(b);
}

/**
 * Numbers for a sequence of heading levels (1–6). `skipFirst` leaves the
 * first heading out (the title). Returns, per heading, its number or null.
 */
export function headingNumbers(levels: number[], skipFirst: boolean): (string | null)[] {
  const from = skipFirst ? 1 : 0;
  const rest = levels.slice(from);
  if (rest.length === 0) return levels.map(() => null);
  const top = Math.min(...rest);
  const counters = new Array<number>(NUMBER_DEPTH).fill(0);
  const out: (string | null)[] = skipFirst ? [null] : [];
  for (const level of rest) {
    const depth = level - top; // 0 = section
    if (depth >= NUMBER_DEPTH) { out.push(null); continue; }
    counters[depth]++;
    for (let d = depth + 1; d < NUMBER_DEPTH; d++) counters[d] = 0;
    // A subsection before any section counts from 0, as LaTeX does ("0.1").
    out.push(counters.slice(0, depth + 1).join("."));
  }
  return out;
}

/** Depth of each heading below the top level used after the title (null for
 *  the title itself); depths past 3 are paragraphs too. */
export function headingDepths(levels: number[], skipFirst: boolean): (number | null)[] {
  const rest = levels.slice(skipFirst ? 1 : 0);
  if (rest.length === 0) return levels.map(() => null);
  const top = Math.min(...rest);
  return levels.map((l, i) => (skipFirst && i === 0 ? null : Math.min(3, l - top)));
}

/** "1. Introduction", "4.1 - Boxes" → the title without the hand-written number. */
export function stripManualNumber(text: string): string {
  // At least one dot: "2024 results" keeps its year.
  return text.replace(/^\s*(?:\d+\.)+\d*\s*[-–—:]?\s+(?=\S)/, "");
}

/**
 * Marks the title heading and, when `number` is on, writes the section
 * numbers into the headings of the rendered sections, in document order.
 * Works on the pipeline's per-pass clones, never on the cached render.
 */
export function applyHeadingNumbers(roots: HTMLElement[], title: string, number: boolean): void {
  const headings: HTMLElement[] = [];
  for (const r of roots) headings.push(...Array.from(r.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")));
  if (headings.length === 0) return;
  const first = headings[0];
  const skipFirst = first.tagName === "H1" && sameTitle(first.textContent ?? "", title);
  if (skipFirst) first.setAttribute(TITLE_HEADING_ATTR, "");
  // F7: the LaTeX sizes follow the depth, not the tag (## sections are \section).
  const depths = headingDepths(headings.map((h) => Number(h.tagName[1])), skipFirst);
  headings.forEach((h, i) => { if (depths[i] !== null) h.setAttribute(HEADING_DEPTH_ATTR, String(depths[i])); });
  if (!number) return;

  const nums = headingNumbers(headings.map((h) => Number(h.tagName[1])), skipFirst);
  headings.forEach((h, i) => {
    const n = nums[i];
    if (n === null) return;
    // Drop a hand-written number from the first text node.
    const walker = h.ownerDocument.createTreeWalker(h, NodeFilter.SHOW_TEXT);
    const firstText = walker.nextNode() as Text | null;
    if (firstText?.data) firstText.data = stripManualNumber(firstText.data);
    h.setAttribute(HEADING_NUMBER_ATTR, n);
    const span = createSpan({ cls: "apdf-secnum", text: n });
    // A real space after the number, so that text taken from the heading
    // (PDF bookmarks) reads "1.2 Title"; the CSS margin does the rest.
    h.insertBefore(h.ownerDocument.createTextNode(" "), h.firstChild);
    h.insertBefore(span, h.firstChild);
  });
}
