// ─────────────────────────────────────────────────────────────────────────────
// Page breaks, text side. Pure: no DOM, no Obsidian.
//
// In the note a manual break is the Obsidian comment `%% page break %%` on a
// line of its own: invisible in live preview and reading view. Before
// rendering it becomes an internal marker line built around a private-use
// character, which nobody types by hand; that character is removed from the
// note text first, so the marker cannot be forged. The upstream `///` is no
// longer read: it stays text.
//
// "New page for each section" inserts the same marker (kind "auto") before
// level-1 headings. Sections are split on the marker after numbering.
// ─────────────────────────────────────────────────────────────────────────────

export const PAGE_BREAK_LINE = "%% page break %%";

const PRIVATE = "";
const MARKER_RE = /^apdf-page-break:(auto|\d+)$/;
const BREAK_RE = /^ {0,3}%%\s*page break\s*%%\s*$/i;

function marker(kind: number | "auto"): string {
  return `${PRIVATE}apdf-page-break:${kind}${PRIVATE}`;
}

/** Tracks fenced code (``` or ~~~, CommonMark open/close rules) line by line. */
class FenceTracker {
  private open = "";
  /** Feeds one line; returns true when the line is fence or fence content. */
  step(line: string): boolean {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!this.open) {
      if (m && !(m[1][0] === "`" && m[2].includes("`"))) { this.open = m[1]; return true; }
      return false;
    }
    if (m && m[1][0] === this.open[0] && m[1].length >= this.open.length && !m[2].trim()) {
      this.open = "";
    }
    return true;
  }
}

/** Line count of an opening YAML frontmatter block, 0 when there is none. */
function frontmatterLines(lines: string[]): number {
  if (!/^---[ \t]*$/.test(lines[0] ?? "")) return 0;
  for (let i = 1; i < lines.length; i++) if (/^---[ \t]*$/.test(lines[i])) return i + 1;
  return 0;
}

/** 0-based line numbers of the `%% page break %%` lines of a note, in order,
 *  skipping fenced code and the frontmatter. */
export function findPageBreakLines(note: string): number[] {
  const lines = note.replace(/\r\n?/g, "\n").split("\n");
  const fence = new FenceTracker();
  const out: number[] = [];
  for (let i = frontmatterLines(lines); i < lines.length; i++) {
    if (fence.step(lines[i])) continue;
    if (BREAK_RE.test(lines[i])) out.push(i);
  }
  return out;
}

export interface PreparedSection {
  md: string;
  /** How the section's first page was started: by the k-th manual break of
   *  the note (0-based), by "New page for each section", or not at all. */
  start: { kind: "manual"; index: number } | { kind: "auto" } | null;
}

export interface SectionOptions {
  autoBreakH1: boolean;
  autoBreakH2: boolean;
  /** Text steps that must see the markers already in place (comment strip,
   *  title). Must keep marker lines as they are. */
  transform?: (md: string) => string;
}

/**
 * Turns page-break comments into markers, applies `transform`, adds the
 * automatic breaks. Returns the marked text (for numbering, which must see the
 * whole document) and the function that splits a marked text into sections.
 * Input must be LF-normalised, with the frontmatter already handled.
 */
export function prepareSections(md: string, opts: SectionOptions): {
  md: string;
  split: (marked: string) => PreparedSection[];
} {
  const fence = new FenceTracker();
  let manual = 0;
  const lines = md.split(PRIVATE).join("").split("\n").map((line) => {
    if (fence.step(line)) return line;
    return BREAK_RE.test(line) ? marker(manual++) : line;
  });
  let out = lines.join("\n");
  if (opts.transform) out = opts.transform(out);
  out = insertAutoBreaks(out, opts.autoBreakH1, opts.autoBreakH2);
  return { md: out, split: splitSections };
}

/** Adds an automatic marker before H1 (and H2) headings outside fenced code,
 *  except before the first line of the document. */
export function insertAutoBreaks(md: string, h1: boolean, h2: boolean): string {
  if (!h1 && !h2) return md;
  const fence = new FenceTracker();
  const out: string[] = [];
  for (const line of md.split("\n")) {
    if (!fence.step(line) && out.length > 0) {
      if ((h1 && /^# /.test(line)) || (h2 && /^## /.test(line))) out.push(marker("auto"));
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Splits a marked text into sections, dropping empty ones. A section started
 *  by several markers in a row counts as manual if any of them is (the last
 *  manual one). */
export function splitSections(marked: string): PreparedSection[] {
  const sections: PreparedSection[] = [];
  let buf: string[] = [];
  let run: PreparedSection["start"] = null;
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) {
      sections.push({ md: text, start: run });
      run = null;
    }
    buf = [];
  };
  for (const line of marked.split("\n")) {
    const m = MARKER_RE.exec(line);
    if (!m) { buf.push(line); continue; }
    flush();
    if (m[1] !== "auto") run = { kind: "manual", index: Number(m[1]) };
    else if (run?.kind !== "manual") run = { kind: "auto" };
  }
  flush();
  return sections;
}

/** Removes the `index`-th page-break line, and one blank line around it when
 *  that leaves two blank lines in a row. Returns null when it is not there. */
export function removePageBreak(note: string, index: number): { from: number; to: number } | null {
  const lines = note.split("\n");
  const at = findPageBreakLines(note)[index];
  if (at === undefined) return null;
  let first = at;
  let last = at;
  const blank = (i: number) => i >= 0 && i < lines.length && !lines[i].trim();
  if (blank(at - 1) && blank(at + 1)) last = at + 1;
  else if (at === lines.length - 1 && blank(at - 1)) first = at - 1;
  return { from: first, to: last }; // inclusive line range
}
