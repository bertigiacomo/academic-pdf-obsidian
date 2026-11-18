// ─────────────────────────────────────────────────────────────────────────────
// F5: the title-page fields as the "Edit title page" modal shows them, and how
// they are written back to a note's frontmatter. Pure: the frontmatter object
// is the one Obsidian's processFrontMatter hands over, edited in place, so
// every other property of the note stays as it was.
// ─────────────────────────────────────────────────────────────────────────────

import { academicFields } from "./frontmatter";

export interface TitleFields {
  title: string;
  subtitle: string;
  /** One per line in the modal. */
  authors: string[];
  affiliation: string;
  date: string;
  abstract: string;
}

/** The fields to show, read from a note's parsed frontmatter. */
export function readTitleFields(fm: unknown): TitleFields {
  const m = academicFields(fm);
  return {
    title: m.title ?? "", subtitle: m.subtitle ?? "", authors: m.authors,
    affiliation: m.affiliation ?? "", date: m.date ?? "", abstract: m.abstract ?? "",
  };
}

/** The key the note already uses for a field (any case, any of `names`). */
function keyOf(fm: Record<string, unknown>, names: string[]): string | undefined {
  return Object.keys(fm).find((k) => names.includes(k.toLowerCase()));
}

/** Sets (or, when empty, removes) one field, keeping the note's own key. */
function put(fm: Record<string, unknown>, names: string[], value: unknown, empty: boolean): void {
  const keys = Object.keys(fm).filter((k) => names.includes(k.toLowerCase()));
  const key = keys[0] ?? names[0];
  for (const k of keys.slice(1)) delete fm[k];
  if (empty) delete fm[key];
  else fm[key] = value;
}

/** Writes the fields into `fm` (edited in place). An empty field is removed;
 *  one author is a plain value, several a list; "affiliations" (a list) is
 *  replaced by "affiliation". */
export function writeTitleFields(fm: Record<string, unknown>, f: TitleFields): void {
  const clean = (s: string) => s.trim();
  put(fm, ["title"], clean(f.title), !clean(f.title));
  put(fm, ["subtitle"], clean(f.subtitle), !clean(f.subtitle));
  const authors = f.authors.map(clean).filter(Boolean);
  const authorKey = keyOf(fm, ["author", "authors"]) ?? "author";
  put(fm, [authorKey.toLowerCase(), "author", "authors"], authors.length === 1 ? authors[0] : authors, authors.length === 0);
  const plural = keyOf(fm, ["affiliations"]);
  if (plural) delete fm[plural];
  put(fm, ["affiliation"], clean(f.affiliation), !clean(f.affiliation));
  put(fm, ["date"], clean(f.date), !clean(f.date));
  // Keep the abstract's line breaks: it is Markdown.
  const abstract = f.abstract.replace(/\s+$/, "");
  put(fm, ["abstract"], abstract, !abstract.trim());
}
