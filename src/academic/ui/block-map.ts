// ─────────────────────────────────────────────────────────────────────────────
// Which line of the note does each rendered block come from? Pure: no DOM.
//
// Used by the page-break affordance, which writes `%% page break %%` before a
// block. Two steps:
//  1. blockStarts(md): the top-level blocks of the text that was actually
//     rendered (one section), as the first line of each — a simplified
//     CommonMark block scan (paragraphs, headings, fences, math, lists,
//     quotes and callouts, rules, tables; footnote and link definitions and
//     comments make no block).
//  2. locateBlocks(note, …): finds those first lines in the note, in order,
//     outside fenced code and the frontmatter.
// The caller compares the count with the rendered elements: when they differ
// the section gets no affordance at all. Better no button than a page break
// in the wrong place.
// ─────────────────────────────────────────────────────────────────────────────

/** First line of each top-level block; null for a block that has no line of
 *  its own in the note (the footnotes list at the end). */
export function blockStarts(md: string): (string | null)[] {
  const lines = md.split("\n");
  const out: (string | null)[] = [];
  let mode: "none" | "para" | "table" | "list" | "quote" | "skip" = "none";
  let paraLines = 0;
  let listKind = "";
  let prevBlank = true;
  let footnotes = false;
  let i = 0;

  const isBlank = (l: string) => !l.trim();
  const fenceOpen = (l: string) => {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(l);
    return m && !(m[1][0] === "`" && m[2].includes("`")) ? m[1] : null;
  };
  const listMarker = (l: string): string | null => {
    const m = /^ {0,3}([-*+]|\d{1,9}[.)])[ \t]+\S/.exec(l) ?? /^ {0,3}([-*+]|\d{1,9}[.)])\s*$/.exec(l);
    if (!m) return null;
    const mk = m[1];
    return /\d/.test(mk) ? "o" + mk.slice(-1) : "b" + mk;
  };
  const isHeading = (l: string) => /^ {0,3}#{1,6}(\s|$)/.test(l);
  const isRule = (l: string) => /^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(l);
  const isQuote = (l: string) => /^ {0,3}>/.test(l);
  const oddCount = (l: string, tok: string) => (l.split(tok).length - 1) % 2 === 1;

  const start = (first: string) => { out.push(first); };

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      if (mode === "para" || mode === "table" || mode === "quote" || mode === "skip") mode = "none";
      prevBlank = true;
      i++;
      continue;
    }

    // Lines that may continue the open block.
    if (mode === "list") {
      const mk = listMarker(line);
      const indented = /^( {2,}|\t)/.test(line);
      if (mk === listKind || indented || (!prevBlank && !mk && !isHeading(line) && !fenceOpen(line))) {
        if (fenceOpen(line) && indented) i = skipFence(lines, i);
        prevBlank = false;
        i++;
        continue;
      }
      mode = "none";
    } else if (mode === "quote") {
      if (isQuote(line) || (!isHeading(line) && !fenceOpen(line) && !listMarker(line))) { i++; continue; }
      mode = "none";
    } else if (mode === "skip") {
      if (/^( {2,}|\t)/.test(line)) { i++; continue; }
      mode = "none";
    } else if (mode === "table") {
      // A table ends at the first line without a pipe: that line starts a
      // paragraph of its own (as Obsidian renders it).
      if (line.includes("|")) { i++; continue; }
      mode = "none";
    } else if (mode === "para") {
      // A delimiter row as the second line turns the paragraph into a table.
      if (paraLines === 1 && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && lines[i - 1].includes("|")) {
        mode = "table";
        i++;
        continue;
      }
      // A setext underline (---) stays in the paragraph; an ordered list
      // interrupts a paragraph only when it starts at 1.
      const interrupts = isHeading(line) || fenceOpen(line) || isQuote(line)
        || (isRule(line) && !/^ {0,3}-+\s*$/.test(line))
        || /^ {0,3}([-*+]|1[.)])[ \t]+\S/.test(line);
      if (!interrupts) { paraLines++; i++; continue; }
      mode = "none";
    }

    prevBlank = false;

    // A new block starts here.
    const fence = fenceOpen(line);
    if (fence) {
      start(line);
      i = skipFence(lines, i) + 1;
      mode = "none";
      continue;
    }
    if (/^ {0,3}%%/.test(line) && oddCount(line, "%%")) {
      // Multi-line comment: renders nothing.
      i++;
      while (i < lines.length && !oddCount(lines[i], "%%")) i++;
      i++;
      continue;
    }
    if (/^ {0,3}<!--/.test(line)) { mode = "skip"; i++; continue; }
    if (/^ {0,3}\[\^[^\]]+\]:/.test(line)) { footnotes = true; mode = "skip"; i++; continue; }
    if (/^ {0,3}\[[^\]]+\]:\s*\S/.test(line)) { i++; continue; }
    if (/^\s*\$\$/.test(line)) {
      start(line);
      const closesHere = (line.trim().length > 2 && line.trim().endsWith("$$")) || line.split("$$").length - 1 >= 2;
      i++;
      if (!closesHere) {
        while (i < lines.length && !lines[i].includes("$$")) i++;
        i++;
      }
      mode = "none";
      continue;
    }
    if (isHeading(line) || isRule(line)) { start(line); i++; mode = "none"; continue; }
    if (isQuote(line)) { start(line); mode = "quote"; i++; continue; }
    const mk = listMarker(line);
    if (mk) { start(line); mode = "list"; listKind = mk; i++; continue; }
    start(line);
    mode = "para";
    paraLines = 1;
    i++;
  }
  if (footnotes) out.push(null);
  return out;
}

/** Index of the closing fence line of the fence opened at `i` (or the last
 *  line when it never closes). */
function skipFence(lines: string[], i: number): number {
  const open = /^\s*(`{3,}|~{3,})/.exec(lines[i])?.[1] ?? "```";
  for (let j = i + 1; j < lines.length; j++) {
    const m = /^\s*(`{3,}|~{3,})\s*$/.exec(lines[j]);
    if (m && m[1][0] === open[0] && m[1].length >= open.length) return j;
  }
  return lines.length - 1;
}

/** Lines of `note` where a block may start: outside the frontmatter and
 *  outside fenced code (a fence's opening line counts). */
function candidateLines(note: string[]): boolean[] {
  const ok = note.map(() => true);
  let i = 0;
  if (/^---[ \t]*$/.test(note[0] ?? "")) {
    const end = note.findIndex((l, j) => j > 0 && /^---[ \t]*$/.test(l));
    if (end > 0) { for (; i <= end; i++) ok[i] = false; }
  }
  for (; i < note.length; i++) {
    if (/^ {0,3}(`{3,}|~{3,})/.test(note[i])) {
      const close = skipFence(note, i);
      for (let j = i + 1; j <= close; j++) ok[j] = false;
      i = close;
    }
  }
  return ok;
}

/** Cursor over the note's lines: finds each block's first line in order. */
export class BlockLocator {
  private lines: string[];
  private ok: boolean[];
  private pos = 0;

  constructor(note: string) {
    this.lines = note.replace(/\r\n?/g, "\n").split("\n");
    this.ok = candidateLines(this.lines);
  }

  /** Line of the next block whose first line is `first`, or null (the cursor
   *  stays put) when there is none. */
  next(first: string | null): number | null {
    if (first === null) return null;
    for (let i = this.pos; i < this.lines.length; i++) {
      if (this.ok[i] && this.lines[i] === first) {
        this.pos = i + 1;
        return i;
      }
    }
    return null;
  }
}

/** Text to insert at the start of `line` so the block there starts a page. */
export function pageBreakInsertion(note: string, line: number, breakLine: string): string {
  const lines = note.split("\n");
  const prevBlank = line === 0 || !lines[line - 1]?.trim();
  return `${prevBlank ? "" : "\n"}${breakLine}\n\n`;
}

/** True when a page break already sits right above `line` (blank lines
 *  apart). */
export function hasBreakAbove(note: string, line: number, isBreak: (l: string) => boolean): boolean {
  const lines = note.split("\n");
  for (let i = line - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue;
    return isBreak(lines[i]);
  }
  return false;
}
