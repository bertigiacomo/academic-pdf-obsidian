// ─────────────────────────────────────────────────────────────────────────────
// F7: column widths of wide tables, proportional to their content.
//
// A browser's automatic layout gives each column its widest line, so a short
// column with one long label takes room from the description next to it and
// that description becomes a narrow tower. A table that fits the line keeps
// its natural width (centred, as booktabs tables are); a wider one gets fixed
// shares: every column at least its longest word, measured in its real font,
// and the rest of the line split by the average length of its cells raised
// to 0.75 (long descriptions get the room, not long labels).
// ─────────────────────────────────────────────────────────────────────────────

export interface ColumnStats {
  /** Widest unbreakable word, in px. */
  minPx: number;
  /** Widest word of the header cell, in px: headers are never hyphenated. */
  headPx: number;
  /** Widest cell on one line, in px. */
  natPx: number;
  /** Average text length of the cells, in characters. */
  avgChars: number;
}

/** Share of a word's width a column needs when its cells may hyphenate. */
export const HYPHENATED = 0.6;

/** True when whole words do not fit: the body cells must hyphenate. */
export function needsHyphenation(cols: ColumnStats[], lineWidth: number, padPx: number): boolean {
  return cols.reduce((a, c) => a + (Math.min(Math.max(c.minPx, c.headPx), lineWidth * 0.4) + padPx + 3) / lineWidth, 0) >= 1;
}

/** Fractions of the line width per column, or null when the table fits at
 *  its natural width. `padPx` is the horizontal padding of one cell. */
export function columnShares(cols: ColumnStats[], lineWidth: number, padPx: number): number[] | null {
  const n = cols.length;
  if (n < 2 || lineWidth <= 0) return null;
  const natural = cols.reduce((a, c) => a + c.natPx + padPx, 0);
  if (natural <= lineWidth) return null;
  // A URL or a long identifier may not claim more than 40% of the line.
  // 3 px of slack: a word exactly as wide as its column would still wrap.
  const floorOf = (px: number) => (Math.min(px, lineWidth * 0.4) + padPx + 3) / lineWidth;
  let floors = cols.map((c) => floorOf(Math.max(c.minPx, c.headPx)));
  let floorSum = floors.reduce((a, b) => a + b, 0);
  if (floorSum >= 1) {
    // Too many columns for whole words: body cells hyphenate (the table gets
    // .apdf-hyphenate), so a column needs about 60% of its longest word.
    floors = cols.map((c) => floorOf(Math.max(c.headPx, c.minPx * HYPHENATED)));
    floorSum = floors.reduce((a, b) => a + b, 0);
    if (floorSum >= 1) return floors.map((f) => f / floorSum);
  }
  const weights = cols.map((c) => Math.pow(Math.max(1, c.avgChars), 0.75));
  // No column grows past its natural width while another still wants room.
  const caps = cols.map((c) => (c.natPx + padPx) / lineWidth);
  const shares = [...floors];
  let free = 1 - floorSum;
  let open = shares.map((_, i) => i).filter((i) => shares[i] < caps[i]);
  while (free > 1e-9 && open.length > 0) {
    const wSum = open.reduce((a, i) => a + weights[i], 0);
    let used = 0;
    for (const i of open) {
      const add = Math.min(free * weights[i] / wSum, caps[i] - shares[i]);
      shares[i] += add;
      used += add;
    }
    free -= used;
    open = open.filter((i) => shares[i] < caps[i] - 1e-9);
    if (used < 1e-9) break;
  }
  // Natural widths are smaller than the line (checked above), so whatever is
  // left goes to the columns by weight.
  if (free > 1e-9) {
    const wSum = weights.reduce((a, b) => a + b, 0);
    weights.forEach((w, i) => { shares[i] += free * w / wSum; });
  }
  return shares;
}

// ── DOM: measuring cells with the real fonts ────────────────────────────────

type Measure = (text: string, font: string) => number;

function canvasMeasure(): Measure | null {
  const ctx = createEl("canvas").getContext("2d");
  if (!ctx) return null;
  const cache = new Map<string, number>();
  return (text, font) => {
    const key = font + "\u0000" + text;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = font;
      w = ctx.measureText(text).width;
      cache.set(key, w);
    }
    return w;
  };
}

interface Fonts { serif: string; mono: string; size: number }

function fontOf(t: Text, f: Fonts): string {
  const el = t.parentElement;
  const mono = !!el?.closest("code, kbd, samp");
  const bold = !!el?.closest("th, strong, b");
  const italic = !!el?.closest("em, i");
  return `${italic ? "italic " : ""}${bold ? "700 " : ""}${f.size}px ${mono ? f.mono : f.serif}`;
}

function cellStats(cell: HTMLElement, f: Fonts, measure: Measure): { min: number; nat: number; chars: number } {
  // (th words are measured in bold through fontOf.)
  let min = 0, nat = 0;
  const walker = cell.ownerDocument.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const font = fontOf(t, f);
    nat += measure(t.data, font);
    // A line may break at spaces and after a hyphen or a slash.
    for (const word of t.data.split(/\s+|(?<=[-/–—])/)) {
      if (word) min = Math.max(min, measure(word, font));
    }
  }
  // Formulas count at their rendered width.
  for (const m of Array.from(cell.querySelectorAll<HTMLElement>("mjx-container"))) {
    const w = m.getBoundingClientRect().width;
    min = Math.max(min, w);
    nat += w;
  }
  return { min, nat, chars: (cell.textContent ?? "").replace(/\s+/g, " ").trim().length };
}

/** Pins the column shares of every wide table under the roots. `fonts` are
 *  the CSS font stacks of the body and of code. */
export function fitTables(roots: HTMLElement[], lineWidth: number, fonts: Fonts): void {
  const measure = canvasMeasure();
  if (!measure) return;
  // Cell padding: 0.55em on each side (the outer sides have none, close enough).
  const padPx = 1.1 * fonts.size;
  for (const root of roots) {
    for (const table of Array.from(root.querySelectorAll<HTMLTableElement>("table"))) {
      table.querySelector(":scope > colgroup.apdf-cols")?.remove();
      table.classList.remove("apdf-wide", "apdf-hyphenate");
      if (table.closest(".apdf-block")) continue;
      const rows = Array.from(table.rows);
      if (rows.some((r) => Array.from(r.cells).some((c) => c.colSpan !== 1))) continue;
      const ncol = Math.max(0, ...rows.map((r) => r.cells.length));
      const stats: ColumnStats[] = Array.from({ length: ncol }, () => ({ minPx: 0, headPx: 0, natPx: 0, avgChars: 0 }));
      const counts = new Array<number>(ncol).fill(0);
      for (const row of rows) {
        Array.from(row.cells).forEach((cell, c) => {
          const s = cellStats(cell, fonts, measure);
          if (cell.tagName === "TH") stats[c].headPx = Math.max(stats[c].headPx, s.min);
          else stats[c].minPx = Math.max(stats[c].minPx, s.min);
          stats[c].natPx = Math.max(stats[c].natPx, s.nat);
          stats[c].avgChars += s.chars;
          counts[c]++;
        });
      }
      stats.forEach((s, c) => { s.avgChars = counts[c] ? s.avgChars / counts[c] : 0; });
      const shares = columnShares(stats, lineWidth, padPx);
      if (!shares) continue;
      table.classList.add("apdf-wide");
      table.classList.toggle("apdf-hyphenate", needsHyphenation(stats, lineWidth, padPx));
      const group = createEl("colgroup");
      group.className = "apdf-cols";
      for (const share of shares) {
        const col = group.createEl("col");
        col.setCssStyles({ width: `${(share * 100).toFixed(2)}%` });
      }
      table.prepend(group);
    }
  }
}
