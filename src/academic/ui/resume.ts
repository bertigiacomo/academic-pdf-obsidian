// ─────────────────────────────────────────────────────────────────────────────
// Incremental pagination (F8 speed): which pages of the previous pagination
// of a section can be kept after an edit. Pure: works on block signatures
// and page starts only.
//
// A page's content depends only on the block it starts with and the blocks
// after it (the F6 rules look forward, never back), so:
//   - before the edit, pages are kept up to a clean page start that no rule
//     of an earlier page looked past (resumePoint);
//   - after the edit, pagination stops at the first clean page start where
//     the remaining blocks are those of the previous pagination, also
//     starting a page there (suffixStart + the stopAt hook).
// ─────────────────────────────────────────────────────────────────────────────

/** A top-level block's signature: its HTML without the per-pass position
 *  tags, which change whenever a block is added before it. */
export function blockSignature(outerHTML: string): string {
  const end = outerHTML.indexOf(">");
  if (end < 0) return outerHTML;
  const tag = outerHTML.slice(0, end).replace(/\s+data-apdf-(?:block|child)="[^"]*"/g, "");
  return tag + outerHTML.slice(end);
}

/** Index of the first block that differs, or the shorter length. */
export function firstChange(sigs: string[], prev: string[]): number {
  let k = 0;
  while (k < sigs.length && k < prev.length && sigs[k] === prev[k]) k++;
  return k;
}

/**
 * The page to resume from: the last clean page start strictly before the run
 * of headings that ends right before the first change. Keep-with-next decides
 * where a page ends by looking at a heading run and the block after it, so a
 * page whose decision may have seen the changed block is paginated again.
 * Returns page 0 (paginate everything) when there is no such page.
 */
export function resumePoint(
  firstChanged: number, isHeading: (i: number) => boolean, pageStarts: (number | null)[], blocks: number,
): { page: number; child: number } {
  let limit = firstChanged;
  while (limit > 0 && isHeading(limit - 1)) limit--;
  for (let p = pageStarts.length - 1; p > 0; p--) {
    const start = pageStarts[p];
    if (start !== null && start < limit && start < blocks) return { page: p, child: start };
  }
  return { page: 0, child: 0 };
}

/**
 * The longest common suffix of the two block lists: blocks from `start` on
 * are those of the previous list from `start - delta` on.
 */
export function suffixStart(sigs: string[], prev: string[]): { start: number; delta: number } {
  const delta = sigs.length - prev.length;
  let i = sigs.length;
  while (i > 0 && i - 1 - delta >= 0 && sigs[i - 1] === prev[i - 1 - delta]) i--;
  return { start: i, delta };
}
