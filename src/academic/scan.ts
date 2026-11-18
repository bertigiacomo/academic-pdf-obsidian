// ─────────────────────────────────────────────────────────────────────────────
// Pre-scan of a Markdown document: finds every academic block, in document
// order, and decides its number. Pure. This is pass one of F4: numbers come
// from the text, never from the order in which blocks happen to render.
//
// Fences of any length and both characters are understood, and academic
// blocks inside the body of another (a theorem inside a box) are found too.
// ─────────────────────────────────────────────────────────────────────────────

import {
  BlockKind, hasMarkdownBody, isBlockKind, isNumberedKind, readLabel,
} from "./blocks-parse";

export interface ScannedBlock {
  kind: BlockKind;
  /** 0-based line of the opening fence. */
  line: number;
  /** 0-based line of the closing fence (or the last line if unclosed). */
  endLine: number;
  label: string;
  /** null for unnumbered kinds, or when numbering of the kind is off. */
  number: number | null;
  depth: number;
}

export interface LabelInfo { kind: BlockKind; number: number }

export interface ScanResult {
  blocks: ScannedBlock[];
  /** label → what it points at. The first definition wins. */
  labels: Map<string, LabelInfo>;
}

export interface ScanOptions {
  numberAlgorithms: boolean;
  numberTheorems: boolean;
}

export const DEFAULT_SCAN_OPTIONS: ScanOptions = { numberAlgorithms: true, numberTheorems: true };

const OPEN_RE = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)/;

function closes(line: string, fence: string): boolean {
  const m = line.match(/^\s*(`{3,}|~{3,})\s*$/);
  return !!m && m[1][0] === fence[0] && m[1].length >= fence.length;
}

export function scanDocument(text: string, opts: ScanOptions = DEFAULT_SCAN_OPTIONS): ScanResult {
  const lines = text.split("\n");
  const result: ScanResult = { blocks: [], labels: new Map() };
  const counters = new Map<string, number>();

  const walk = (from: number, to: number, depth: number): void => {
    let i = from;
    while (i < to) {
      const open = lines[i].match(OPEN_RE);
      if (!open) { i++; continue; }
      const fence = open[2];
      const info = open[3].toLowerCase();
      let end = i + 1;
      while (end < to && !closes(lines[end], fence)) end++;
      // `end` is the closing fence, or `to` when the fence never closes.
      if (isBlockKind(info)) {
        const kind = info;
        const label = readLabel(lines.slice(i + 1, end));
        let number: number | null = null;
        const wanted = kind === "algorithm" ? opts.numberAlgorithms : opts.numberTheorems;
        if (isNumberedKind(kind) && wanted) {
          number = (counters.get(kind) ?? 0) + 1;
          counters.set(kind, number);
        }
        result.blocks.push({ kind, line: i, endLine: Math.min(end, to - 1), label, number, depth });
        if (label && number !== null && !result.labels.has(label)) {
          result.labels.set(label, { kind, number });
        }
        if (hasMarkdownBody(kind)) walk(i + 1, end, depth + 1);
      }
      i = end + 1;
    }
  };
  walk(0, lines.length, 0);
  return result;
}

/** Looks a block up by the line of its opening fence. */
export function blockAtLine(scan: ScanResult, line: number): ScannedBlock | undefined {
  return scan.blocks.find((b) => b.line === line);
}

/** The number of the block opening at `line`, or null. A null scan is a block
 *  whose note Obsidian cannot tell us (embedded note, hover preview, canvas
 *  card): it gets no number, never a wrong one. */
export function numberAt(scan: ScanResult | null, line: number): number | null {
  return (scan && blockAtLine(scan, line)?.number) ?? null;
}

/** Blocks nested inside `outer`, keyed by their line relative to the first
 *  body line of `outer`. Used to hand numbers to the blocks inside a box. */
export function blocksInside(scan: ScanResult, outer: ScannedBlock): Map<number, ScannedBlock> {
  const out = new Map<number, ScannedBlock>();
  for (const b of scan.blocks) {
    if (b !== outer && b.line > outer.line && b.endLine <= outer.endLine) {
      out.set(b.line - outer.line - 1, b);
    }
  }
  return out;
}

// ─── Annotation ─────────────────────────────────────────────────────────────

/** Inserts `apdf-n: <number>` as the first body line of every numbered block
 *  in `text`, so a block rendered in isolation (a section of the export, the
 *  body of a box) knows its number. `lineOffset` is the line of `text`'s
 *  first line in the document the scan was made on. */
export function annotateNumbers(text: string, scan: ScanResult, lineOffset = 0): string {
  const byLine = new Map<number, ScannedBlock>();
  for (const b of scan.blocks) if (b.number !== null) byLine.set(b.line - lineOffset, b);
  const out: string[] = [];
  text.split("\n").forEach((l, i) => {
    out.push(l);
    const b = byLine.get(i);
    if (b) out.push(`apdf-n: ${b.number}`);
  });
  return out.join("\n");
}

// ─── Per-document cache (live preview) ──────────────────────────────────────

const cache = new Map<string, { text: string; key: string; scan: ScanResult }>();

/** One scan per note text: the block processors of one note share it and an
 *  edit replaces it. There is no registry to reset between notes. */
export function cachedScan(path: string, text: string, opts: ScanOptions): ScanResult {
  const key = `${opts.numberAlgorithms ? 1 : 0}${opts.numberTheorems ? 1 : 0}`;
  const hit = cache.get(path);
  if (hit && hit.text === text && hit.key === key) return hit.scan;
  const scan = scanDocument(text, opts);
  cache.set(path, { text, key, scan });
  return scan;
}

export function forgetScans(): void { cache.clear(); }

// ─── Fenced lines (for the editor extension) ────────────────────────────────

/** `true` for every line that belongs to a fenced block, fences included. */
export function fencedLines(text: string): boolean[] {
  const lines = text.split("\n");
  const flags = new Array<boolean>(lines.length).fill(false);
  let i = 0;
  while (i < lines.length) {
    const open = lines[i].match(OPEN_RE);
    if (!open) { i++; continue; }
    let end = i + 1;
    while (end < lines.length && !closes(lines[end], open[2])) end++;
    for (let k = i; k <= Math.min(end, lines.length - 1); k++) flags[k] = true;
    i = end + 1;
  }
  return flags;
}
