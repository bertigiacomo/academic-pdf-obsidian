// ─────────────────────────────────────────────────────────────────────────────
// Academic blocks: parsing of the fenced-block source. Pure (no DOM, no
// Obsidian), so it is unit-tested. Rendering lives in render.ts.
// ─────────────────────────────────────────────────────────────────────────────

export type TheoremKind = "theorem" | "lemma" | "corollary" | "definition" | "remark" | "proof";
export type BoxColor = "blue" | "teal" | "green" | "purple" | "amber" | "red";
export type BlockKind = "algorithm" | TheoremKind | `box-${BoxColor}`;

export const BOX_COLORS: readonly BoxColor[] = ["blue", "teal", "green", "purple", "amber", "red"];
export const THEOREM_KINDS: readonly TheoremKind[] = [
  "theorem", "lemma", "corollary", "definition", "remark", "proof",
];
export const BOX_KINDS: readonly BlockKind[] = BOX_COLORS.map((c) => `box-${c}` as BlockKind);
export const ALL_BLOCK_KINDS: readonly BlockKind[] = [
  "algorithm", ...THEOREM_KINDS, ...BOX_KINDS,
];

/** Kinds that get a number ("Theorem 2"); remark and proof never do. */
const NUMBERED: ReadonlySet<string> = new Set([
  "algorithm", "theorem", "lemma", "corollary", "definition",
]);

export function isBlockKind(s: string): s is BlockKind {
  return (ALL_BLOCK_KINDS as readonly string[]).includes(s);
}
export function isNumberedKind(kind: string): boolean { return NUMBERED.has(kind); }
export function isTheoremKind(kind: string): kind is TheoremKind {
  return (THEOREM_KINDS as readonly string[]).includes(kind);
}
/** Kinds whose body is Markdown that may itself hold academic blocks. */
export function hasMarkdownBody(kind: BlockKind): boolean { return kind !== "algorithm"; }

/** Display name: "Theorem", "Algorithm", … */
export function kindLabel(kind: BlockKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

// ─── Header directives ──────────────────────────────────────────────────────

export interface BlockHeader {
  title: string;
  label: string;
  /** Injected by the export pre-scan: the block's number, decided from the
   *  whole document. `null` when the directive is absent. */
  number: number | null;
  font: "math" | "mono" | null;
  /** Index of the first line after the directives. */
  bodyStart: number;
}

const DIRECTIVE_RE = /^(?:\/\/|%|#)?\s*(title|label|font|apdf-n)\s*:\s*(.*)$/i;

/** Reads the leading `title:` / `label:` / `font:` lines, in any order. For
 *  algorithms the title is the first non-directive line, handled by the
 *  caller; `title:` is accepted anyway. */
export function parseHeader(lines: string[]): BlockHeader {
  const h: BlockHeader = { title: "", label: "", number: null, font: null, bodyStart: 0 };
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].trim().match(DIRECTIVE_RE);
    if (!m) break;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "title") h.title = value;
    else if (key === "label") h.label = value.split(/\s+/)[0] ?? "";
    else if (key === "apdf-n") { const n = parseInt(value, 10); h.number = Number.isFinite(n) ? n : null; }
    else if (key === "font") {
      if (/^mono/i.test(value)) h.font = "mono";
      else if (/^math/i.test(value)) h.font = "math";
      else break;
    }
    i++;
  }
  h.bodyStart = i;
  return h;
}

/** Extracts the label of a block from its raw body (used by the pre-scan). */
export function readLabel(bodyLines: string[]): string {
  return parseHeader(bodyLines).label;
}

// ─── Algorithm ──────────────────────────────────────────────────────────────

export interface AlgoLine {
  /** Indent level (0 = flush with the block). */
  depth: number;
  /** Statement without the trailing comment; may hold `$…$`. */
  text: string;
  comment: string;
}

export interface AlgorithmSpec {
  label: string;
  number: number | null;
  font: "math" | "mono";
  name: string;
  /** Argument list without the parentheses, or "" when there is none. */
  args: string;
  io: Array<{ label: "Input" | "Output"; text: string }>;
  body: AlgoLine[];
}

const IO_RE = /^\\?(require|input|ensure|output)\s*:\s*(.*)$/i;

function splitSignature(title: string): { name: string; args: string } {
  const m = title.match(/^([^(]*?)\s*\((.*)\)\s*$/);
  if (!m) return { name: title.trim(), args: "" };
  return { name: m[1].trim(), args: m[2].trim() };
}

/** Splits `text // comment` outside of `$…$`, so `//` inside maths survives. */
export function splitComment(raw: string): { text: string; comment: string } {
  let inMath = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "\\") { i++; continue; }
    if (c === "$") inMath = !inMath;
    else if (!inMath && c === "/" && raw[i + 1] === "/") {
      return { text: raw.slice(0, i).trimEnd(), comment: raw.slice(i + 2).trim() };
    }
  }
  return { text: raw.trimEnd(), comment: "" };
}

export function parseAlgorithm(source: string, defaultFont: "math" | "mono" = "math"): AlgorithmSpec | null {
  const lines = source.split("\n");
  const header = parseHeader(lines);
  let idx = header.bodyStart;
  while (idx < lines.length && !lines[idx].trim()) idx++;
  if (idx >= lines.length) return null;

  let titleLine = lines[idx++].trim();
  let font = header.font ?? defaultFont;
  const tag = titleLine.match(/\s*\[(math|mono(?:space)?)\]\s*$/i);
  if (tag) {
    font = tag[1].toLowerCase().startsWith("mono") ? "mono" : "math";
    titleLine = titleLine.slice(0, tag.index).trim();
  }
  titleLine = titleLine.replace(/^(algorithm|algoritmo)\s*[:.]?\s+/i, "");
  const { name, args } = splitSignature(titleLine);

  const io: AlgorithmSpec["io"] = [];
  const raw: string[] = [];
  for (; idx < lines.length; idx++) {
    const m = lines[idx].trim().match(IO_RE);
    if (m) {
      const isInput = /^(require|input)$/i.test(m[1]);
      io.push({ label: isInput ? "Input" : "Output", text: m[2].trim() });
    } else {
      raw.push(lines[idx]);
    }
  }
  // Input always before Output, whatever their place in the source; a stable
  // sort keeps several of the same kind in source order.
  io.sort((a, b) => (a.label === b.label ? 0 : a.label === "Input" ? -1 : 1));

  const width = (s: string) => s.match(/^\s*/)![0].replace(/\t/g, "  ").length;
  const nonEmpty = raw.filter((l) => l.trim());
  const base = nonEmpty.length ? Math.min(...nonEmpty.map(width)) : 0;
  // Trailing and leading blank lines are not statements.
  while (raw.length && !raw[raw.length - 1].trim()) raw.pop();
  while (raw.length && !raw[0].trim()) raw.shift();
  const body: AlgoLine[] = raw.filter((l) => l.trim()).map((l) => {
    const { text, comment } = splitComment(l.trim());
    return { depth: Math.floor(Math.max(0, width(l) - base) / 2), text, comment };
  });

  return { label: header.label, number: header.number, font, name, args, io, body };
}

// ─── Algorithm inline pieces: keywords and math ─────────────────────────────

export type Piece = { kind: "text" | "keyword" | "math"; value: string };

// Longest first so "else if" wins over "else"; "end X" stays together.
const KEYWORDS = [
  "end if", "end while", "end for", "end function", "end procedure",
  "else if", "elif", "elseif", "downto", "continue", "function", "procedure",
  "return", "repeat", "until", "while", "then", "else", "loop", "begin",
  "break", "for", "each", "do", "if", "end", "to", "in", "and", "or", "not",
];
const KW_RE = new RegExp(`(?<![\\w])(${KEYWORDS.map((k) => k.replace(" ", "\\s+")).join("|")})(?![\\w])`, "gi");

/** Splits a statement into text, bold keywords and `$…$` maths. */
export function tokenizeStatement(text: string, highlight: boolean): Piece[] {
  const out: Piece[] = [];
  for (const part of text.split(/(\$[^$]+\$)/g)) {
    if (!part) continue;
    if (part.length > 2 && part.startsWith("$") && part.endsWith("$")) {
      out.push({ kind: "math", value: part.slice(1, -1) });
      continue;
    }
    if (!highlight) { out.push({ kind: "text", value: part }); continue; }
    let last = 0;
    for (const m of part.matchAll(KW_RE)) {
      if (m.index > last) out.push({ kind: "text", value: part.slice(last, m.index) });
      out.push({ kind: "keyword", value: m[1] });
      last = m.index + m[0].length;
    }
    if (last < part.length) out.push({ kind: "text", value: part.slice(last) });
  }
  return out;
}

/** Argument list for the caption in math mode: each top-level argument is
 *  set in maths (`A, \eta` becomes `$A$, $\eta$`). A list that already holds
 *  `$` is the author's own markup and is kept. */
export function mathSignatureArgs(args: string): string {
  if (!args || args.includes("$")) return args;
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of args) {
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    if (c === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += c;
  }
  parts.push(cur);
  return parts.map((p) => `$${p.trim()}$`).join(", ");
}

// ─── Theorem family and boxes ───────────────────────────────────────────────

export interface MarkdownBlockSpec {
  title: string;
  label: string;
  number: number | null;
  content: string;
}

export function parseMarkdownBlock(source: string): MarkdownBlockSpec {
  const lines = source.split("\n");
  const h = parseHeader(lines);
  return {
    title: h.title, label: h.label, number: h.number,
    content: lines.slice(h.bodyStart).join("\n"),
  };
}
