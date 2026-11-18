// ─────────────────────────────────────────────────────────────────────────────
// F5: the academic metadata of a note, from its YAML frontmatter.
//
// The YAML is parsed by Obsidian's parseYaml (passed in, so this module stays
// pure and testable): block scalars (`>`, `|`), quoted strings and lists all
// come out as YAML defines them. A note's frontmatter becomes a title header
// only when it names a title, an author or an abstract.
// ─────────────────────────────────────────────────────────────────────────────

export interface AcademicMeta {
  title?: string;
  subtitle?: string;
  authors: string[];
  affiliation?: string;
  date?: string;
  /** Markdown, rendered like the body (maths, \ref). */
  abstract?: string;
}

const FRONTMATTER = /^---[ \t]*\n([\s\S]*?)\n?---[ \t]*(?:\n|$)/;

/** The YAML text of the note's frontmatter, or null when it has none. */
export function frontmatterYaml(md: string): string | null {
  const m = md.match(FRONTMATTER);
  return m ? m[1] : null;
}

function text(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  // YAML turns an unquoted 2026-11-18 into a Date in some parsers.
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return undefined;
}

function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(text).filter((x): x is string => !!x);
  const one = text(v);
  if (!one) return [];
  // "Ada Lovelace and Alan Turing", "Ada Lovelace, Alan Turing"
  return one.split(/\s*,\s*|\s+and\s+/i).map((a) => a.trim()).filter(Boolean);
}

/** Reads the academic fields from a parsed frontmatter object. Keys are
 *  matched case-insensitively. Null when there is nothing to typeset. */
export function academicMeta(data: unknown): AcademicMeta | null {
  const meta = academicFields(data);
  if (!meta.title && meta.authors.length === 0 && !meta.abstract) return null;
  return meta;
}

/** The academic fields of a parsed frontmatter object, all optional. */
export function academicFields(data: unknown): AcademicMeta {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { authors: [] };
  const fields = new Map<string, unknown>();
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) fields.set(k.toLowerCase(), v);

  const meta: AcademicMeta = {
    title: text(fields.get("title")),
    subtitle: text(fields.get("subtitle")),
    authors: list(fields.get("author") ?? fields.get("authors")),
    affiliation: text(fields.get("affiliation")) ?? (list(fields.get("affiliations")).join("; ") || undefined),
    date: text(fields.get("date")),
    abstract: text(fields.get("abstract")),
  };
  return meta;
}

/** Parses the note's frontmatter with `parse` (Obsidian's parseYaml). A
 *  frontmatter that does not parse is no metadata, never an error. */
export function readAcademicMeta(md: string, parse: (yaml: string) => unknown): AcademicMeta | null {
  const yaml = frontmatterYaml(md);
  if (yaml === null) return null;
  try {
    return academicMeta(parse(yaml));
  } catch {
    return null;
  }
}
