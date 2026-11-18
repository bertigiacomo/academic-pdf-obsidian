// ─────────────────────────────────────────────────────────────────────────────
// F5: the pages before the body and the title header.
//   - title page ("Title page" on): title, subtitle, authors, affiliation,
//     date and abstract, on pages of their own;
//   - title header (off, with title metadata): the same block at the top of
//     the first page, as LaTeX's \maketitle;
//   - contents ("Table of contents" on): built from the paginated body, so
//     its page numbers are the real ones, and paginated over as many pages as
//     it needs.
// DOM only, no innerHTML; styled by structure-css.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { paginateEl } from "../paginator";
import type { AcademicMeta } from "./frontmatter";
import { HEADING_NUMBER_ATTR, NUMBER_DEPTH, TITLE_HEADING_ATTR } from "./heading-numbers";
import type { FrontKind } from "./page-numbers";

export const CONTENTS_TITLE = "Contents";

/** The title block: title, subtitle, authors, affiliation, date. */
function titleBlock(meta: AcademicMeta, title: string, cls: string): HTMLElement {
  const el = createDiv({ cls });
  if (title) el.createDiv({ cls: "apdf-doc-title", text: title });
  if (meta.subtitle) el.createDiv({ cls: "apdf-doc-subtitle", text: meta.subtitle });
  if (meta.authors.length) {
    const authors = el.createDiv({ cls: "apdf-doc-authors" });
    for (const a of meta.authors) authors.createSpan({ cls: "apdf-doc-author", text: a });
  }
  if (meta.affiliation) el.createDiv({ cls: "apdf-doc-affiliation", text: meta.affiliation });
  if (meta.date) el.createDiv({ cls: "apdf-doc-date", text: meta.date });
  return el;
}

/** The abstract: a centred "Abstract" and the rendered Markdown. */
function abstractBlock(rendered: HTMLElement): HTMLElement {
  const el = createDiv({ cls: "apdf-abstract" });
  el.createDiv({ cls: "apdf-abstract-title", text: "Abstract" });
  const body = el.createDiv({ cls: "apdf-abstract-body" });
  for (const n of Array.from(rendered.childNodes)) body.appendChild(n.cloneNode(true));
  return el;
}

/** The title header for the top of the first page (no title page). */
export function buildTitleHeader(meta: AcademicMeta, title: string, abstract: HTMLElement | null): HTMLElement[] {
  const out = [titleBlock(meta, meta.title ?? title, "apdf-maketitle")];
  if (abstract) out.push(abstractBlock(abstract));
  return out;
}

export interface TocEntry {
  level: number;
  num: string | null;
  /** The heading's content, without its number. */
  content: Node[];
  id: string;
  page: string;
}

/** The contents entries of the paginated body. `pageLabel(i)` is the number
 *  printed on body page i. Without section numbers the depth is that of the
 *  numbering: three levels from the highest one used. */
export function collectTocEntries(bodyPages: HTMLElement[][], pageLabel: (i: number) => string): TocEntry[] {
  const found: { h: HTMLElement; page: number }[] = [];
  const seen = new Set<string>();
  bodyPages.forEach((nodes, page) => {
    for (const node of nodes) {
      const hs = /^H[1-6]$/.test(node.tagName) ? [node] : Array.from(node.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6"));
      for (const h of hs) {
        if (h.hasAttribute(TITLE_HEADING_ATTR)) continue;
        // A heading inside a block split across pages is cloned into both parts.
        const key = h.id || `${page}:${h.textContent}`;
        if (h.id && seen.has(key)) continue;
        seen.add(key);
        if ((h.textContent ?? "").trim()) found.push({ h, page });
      }
    }
  });
  if (found.length === 0) return [];
  const top = Math.min(...found.map(({ h }) => Number(h.tagName[1])));
  const out: TocEntry[] = [];
  for (const { h, page } of found) {
    const level = Number(h.tagName[1]) - top + 1;
    if (level > NUMBER_DEPTH) continue;
    const content: Node[] = [];
    let numbered = !!h.querySelector(".apdf-secnum");
    for (const n of Array.from(h.childNodes)) {
      // The space written after the section number.
      if (numbered && n.nodeType === Node.TEXT_NODE && !(n.textContent ?? "").trim()) { numbered = false; continue; }
      if (n.instanceOf(HTMLElement) && (n.classList.contains("apdf-secnum") || n.classList.contains("heading-collapse-indicator"))) continue;
      const c = n.cloneNode(true);
      if (c.instanceOf(HTMLElement)) { c.removeAttribute("id"); c.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id")); }
      content.push(c);
    }
    out.push({ level, num: h.getAttribute(HEADING_NUMBER_ATTR), content, id: h.id, page: pageLabel(page) });
  }
  return out;
}

function tocEntryEl(e: TocEntry): HTMLElement {
  const row = createDiv({ cls: `apdf-toc-entry apdf-toc-l${e.level}` });
  const link = row.createEl("a", { cls: "apdf-toc-link" });
  if (e.id) link.setAttribute("href", `#${e.id}`);
  if (e.num) link.createSpan({ cls: "apdf-toc-num", text: e.num });
  const text = link.createSpan({ cls: "apdf-toc-text" });
  for (const n of e.content) text.appendChild(n);
  link.createSpan({ cls: "apdf-toc-dots" });
  link.createSpan({ cls: "apdf-toc-page", text: e.page });
  return row;
}

export interface FrontInput {
  meta: AcademicMeta | null;
  /** Title for the title page when the metadata has none. */
  title: string;
  /** Rendered abstract, when the metadata has one. */
  abstract: HTMLElement | null;
  titlePage: boolean;
  toc: boolean;
  /** Title header to put above the contents (no title page). */
  header: HTMLElement[];
  bodyPages: HTMLElement[][];
  pageLabel: (bodyPage: number) => string;
  contentW: number;
  contentH: number;
  css: string;
}

export interface FrontPages {
  pages: HTMLElement[][];
  kinds: FrontKind[];
  /** 0-based indices (into `pages`) of the pages that overflow. */
  overflow: number[];
}

/** Everything the front pages are drawn from, as one string: equal keys
 *  give identical front pages, so the pipeline can keep the last ones. */
export function frontKey(i: FrontInput, entries: TocEntry[], geometry: string): string {
  const html = (n: Node) => (n.instanceOf(Element) ? n.outerHTML : n.textContent ?? "");
  return JSON.stringify([
    geometry, i.titlePage, i.toc, i.title, i.meta, i.abstract ? html(i.abstract) : null,
    i.header.map(html), entries.map((e) => [e.level, e.num, e.id, e.page, e.content.map(html)]),
  ]);
}

/** Paginates the pages before the body. `entries` are the contents' entries
 *  (collectTocEntries), when there are contents. */
export function buildFrontPages(i: FrontInput, entries: TocEntry[] = []): FrontPages {
  const out: FrontPages = { pages: [], kinds: [], overflow: [] };
  const add = (nodes: HTMLElement[], kind: FrontKind) => {
    if (nodes.length === 0) return;
    const src = createDiv();
    for (const n of nodes) src.appendChild(n);
    const r = paginateEl(src, i.contentW, i.contentH, i.css);
    for (const p of r.overflowedPages) out.overflow.push(out.pages.length + p);
    for (const p of r.pages) { out.pages.push(p); out.kinds.push(kind); }
  };

  if (i.titlePage) {
    const meta = i.meta ?? { authors: [] };
    const block = titleBlock(meta, meta.title ?? i.title, "apdf-titlepage");
    // The title sits a third of the way down the page, as LaTeX's titlepage.
    block.setCssStyles({ paddingTop: `${Math.round(i.contentH * 0.22)}px` });
    const nodes = [block];
    if (i.abstract) nodes.push(abstractBlock(i.abstract));
    add(nodes, "title");
  }
  if (i.toc) {
    const nodes = [...i.header, createDiv({ cls: "apdf-toc-title", text: CONTENTS_TITLE })];
    for (const e of entries) nodes.push(tocEntryEl(e));
    add(nodes, "toc");
  }
  return out;
}
