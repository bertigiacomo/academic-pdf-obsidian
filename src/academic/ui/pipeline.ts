// ─────────────────────────────────────────────────────────────────────────────
// Rendering pipeline shared by the preview pane, the export modal and the
// export itself: note text → sections → rendered HTML (cached per section) →
// pages → page layouts. Extracted from the upstream modal's doRender; the
// preview and the PDF are both drawn from the DocumentLayout it returns, so
// what you see is what you export.
// ─────────────────────────────────────────────────────────────────────────────

import { applyTypography, markContinuedParagraphs, noteLang, setLang } from "../typography";
import { applyRunningHead } from "../running-head";
import { fitTables } from "../tables";
import { App, Component, parseYaml } from "obsidian";
import type { PDFExportSettings } from "../../settings";
import {
  buildDocCSS, getMathJaxCSS, mmToPx, resolveCodeFont, resolveFont, resolvePageDims,
  stripAtFontFaces, waitForMathJaxStylesheetStable,
} from "../../css-builder";
import {
  FastRender, frontmatterAsCodeBlock, isRTLContent, normalizeMarkdown, renderMarkdownToEl,
  stripCommentLines, stripFrontmatter,
} from "../../markdown";
import { PageLayout, buildPageLayouts, paginateEl, resolvePageNumberFormat } from "../../paginator";
import { ensureBundledFonts } from "../font-loader";
import { prepareExport } from "../export";
import { PreparedSection, prepareSections } from "./page-breaks";
import { splitRenderChunks } from "./render-chunks";
import { blockSignature, firstChange, resumePoint, suffixStart } from "./resume";
import { BlockLocator, blockStarts } from "./block-map";
import { AcademicMeta, readAcademicMeta } from "../frontmatter";
import { applyHeadingNumbers, sameTitle, TITLE_HEADING_ATTR } from "../heading-numbers";
import { applyFigures } from "../figures";
import { FrontInput, FrontPages, buildFrontPages, buildTitleHeader, collectTocEntries, frontKey } from "../frontpages";
import { PageLabelRange, frontMatterNumbering, pageLabelRanges } from "../page-numbers";
import { ACADEMIC_PAGINATION } from "../pagination-hooks";

/** Rendering a section in chunks restarts heading-id numbering in each
 *  chunk: give an id already used in the section the next free -1, -2 …
 *  suffix, as a whole render would. */
function dedupeHeadingIds(root: HTMLElement): void {
  const used = new Set<string>();
  root.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => {
    if (!h.id) return;
    let id = h.id;
    for (let n = 1; used.has(id); n++) id = `${h.id}-${n}`;
    used.add(id);
    h.id = id;
  });
}

/** Waits (at most 3 s) until the images of a rendered chunk have loaded, so
 *  that pagination measures their real height. */
async function imagesLoaded(el: HTMLElement): Promise<void> {
  const pending = Array.from(el.querySelectorAll("img")).filter((img) => !img.complete);
  if (pending.length === 0) return;
  let timer = 0;
  await Promise.race([
    Promise.all(pending.map((img) => img.decode().catch(() => undefined))),
    new Promise<void>((resolve) => { timer = window.setTimeout(resolve, 3000); }),
  ]);
  window.clearTimeout(timer);
}

/** Everything the preview and the export need to draw the pages. */
export interface DocumentLayout {
  layouts: PageLayout[];
  pw: number;
  ph: number;
  mTop: number;
  mLeft: number;
  mRight: number;
  footerH: number;
  headerH: number;
  contentW: number;
  contentH: number;
  /** MathJax CSS (without @font-face) + document CSS. */
  docCSS: string;
  fontFamily: string;
  accentColor: string;
  pageBackground: string;
  isRTL: boolean;
  /** 0-based indices of pages whose content is cut off. */
  overflowPages: number[];
  /** Per section: the index of its first page and how it was started. */
  sections: { firstPage: number; start: PreparedSection["start"] }[];
  /** The note text this layout was rendered from. */
  sourceText: string;
  /** For each block tagged `data-apdf-block="g"`: its line in the note, or
   *  null when no page break can go before it. */
  blockLines: (number | null)[];
  /** Pages before the body (title page, contents). */
  frontPages: number;
  /** /PageLabels ranges for the PDF; empty without front matter. */
  pageLabels: PageLabelRange[];
}

const FRONTMATTER = /^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/;

export interface RenderInput {
  text: string;
  title: string;
  sourcePath: string;
  /** Called with the share of the work done (0–1) while rendering, and the
   *  phase: chunks being rendered, then pages laid out. Only for showing progress. */
  onProgress?: (done: number, phase: RenderPhase) => void;
}

export type RenderPhase = "render" | "layout";

/** Share of the progress bar given to rendering chunks; laying out pages gets
 *  the rest. Measured on a first render of a 107-page note: about 70 / 30. */
const RENDER_SHARE = 0.7;
/** After this long, pagination yields between sections so progress can paint. */
const YIELD_AFTER_MS = 1000;

/** Resolves after the next paint: a single frame callback runs before paint,
 *  and work resumed from it would block that paint. */
const afterPaint = () => new Promise<void>((r) =>
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => r())));

/** The text-level steps, in order. Pure: no DOM, no Obsidian. */
export interface PreparedMarkdown {
  sections: PreparedSection[];
  resolve: (roots: ParentNode[]) => number;
  /** Title metadata from the frontmatter, which it then replaces. */
  meta: AcademicMeta | null;
  /** Blocks at the top of section 0 that the note has no line for. */
  leadBlocks: number;
  /** The document title: the frontmatter's, or the note name. */
  docTitle: string;
}

export function prepareMarkdown(
  raw: string, s: PDFExportSettings, title: string,
  parse: (yaml: string) => unknown = parseYaml,
): PreparedMarkdown {
  let md = normalizeMarkdown(raw);
  const meta = readAcademicMeta(md, parse);
  const showFrontmatter = !s.hideFrontmatter && !meta && FRONTMATTER.test(md);
  md = s.hideFrontmatter || meta ? stripFrontmatter(md) : frontmatterAsCodeBlock(md);
  // The file name as a heading only when nothing else gives the title.
  const fileTitle = s.includeFilenameAsTitle && !!title && !meta && !s.titlePage;
  // Page-break comments become the internal marker before comment lines are
  // dropped, or they would vanish with them.
  const prepared = prepareSections(md, {
    autoBreakH1: s.autoBreakH1,
    autoBreakH2: s.autoBreakH2,
    transform: (text) => {
      // Drop comment-only lines before rendering: inside a paragraph Obsidian
      // leaves a <br> behind for each one, which removeEmptyBlocks cannot see.
      let out = stripCommentLines(text);
      if (fileTitle) out = `# ${title}\n\n${out}`;
      return out;
    },
  });
  const academic = prepareExport(prepared.md, s); // pass one of \ref, numbers
  return {
    sections: prepared.split(academic.md), resolve: (roots) => academic.resolve(roots), meta,
    leadBlocks: (fileTitle ? 1 : 0) + (showFrontmatter ? 1 : 0),
    docTitle: meta?.title ?? title,
  };
}

interface CacheEntry {
  el: HTMLElement;
  component: Component;
}

interface SectionPagination {
  geometry: string;
  /** blockSignature of each top-level block. */
  sigs: string[];
  pages: HTMLElement[][];
  overflow: number[];
  /** Per page: index of the block it starts with, null for a continuation. */
  pageStarts: (number | null)[];
  /** Pages taken over from the previous pagination (before and after the edit). */
  reused: number;
}

/** The child index a page node was cut from (data-apdf-child). */
function childOf(n: HTMLElement | undefined): number | null {
  return n?.dataset.apdfChild === undefined ? null : Number(n.dataset.apdfChild);
}

/** Where each page starts: the child index of its first node, or null when
 *  that node continues a block split from the page before. */
function pageStartsOf(pages: HTMLElement[][]): (number | null)[] {
  return pages.map((page, p) => {
    const first = childOf(page[0]);
    if (first === null) return null;
    const prevLast = p > 0 ? childOf(pages[p - 1][pages[p - 1].length - 1]) : null;
    return prevLast === first ? null : first;
  });
}

/** Re-tags reused page nodes with their block's new position: `shift` added
 *  to the child index, the page-break tag copied from the new block. */
function retag(pages: HTMLElement[][], shift: number, children: HTMLElement[]): void {
  for (const page of pages) for (const node of page) {
    const old = childOf(node);
    if (old === null) continue;
    const k = old + shift;
    node.dataset.apdfChild = String(k);
    const block = children[k]?.dataset.apdfBlock;
    if (block === undefined) delete node.dataset.apdfBlock;
    else node.dataset.apdfBlock = block;
  }
}

/** Chunks rendered at once. Most of a chunk's time is spent waiting on
 *  MathJax's timers (finishRenderMath, about 100 ms), not on the CPU, so a
 *  small pool serialised those waits: on a 250-chunk note, 8 at a time took
 *  7 s, all at once 0.8 s (measured). The original plugin also
 *  renders all its sections at once. */
const RENDER_CONCURRENCY = Infinity;

/** Runs `task` over `items`, at most `limit` at a time. */
async function runPool<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Thrown when a newer render superseded this one. */
export class RenderSuperseded extends Error {
  constructor() { super("superseded"); }
}

/**
 * One pipeline per surface. Keeps a cache of rendered chunks (pieces of a
 * section cut before headings, render-chunks.ts) keyed by their text after
 * numbering, so typing in one place re-renders only that piece. The cache
 * holds the pristine render; every pass works on a clone, because \ref
 * resolution rewrites the DOM with numbers from the whole document. Each entry owns its Component: blocks attach children to it, and
 * dropping an entry unloads them.
 */
export class RenderPipeline {
  private cache = new Map<string, CacheEntry>();
  private token = 0;
  /** Timings of the last complete render, for measuring in DevTools. */
  lastTimings: {
    renderMs: number; paginateMs: number; frontMs: number; chunks: number; rendered: number; reusedPages: number; pages: number;
  } | null = null;
  /** Last pagination of each section, to resume after an edit. */
  private paginations: SectionPagination[] = [];
  /** Last front pages and what they were drawn from. */
  private front: { key: string; pages: FrontPages } | null = null;

  constructor(private app: App, private getSettings: () => PDFExportSettings) {}

  /** Invalidates any render in flight. */
  cancel(): void {
    this.token++;
  }

  /**
   * Paginates a section, reusing the previous pagination where the edit
   * cannot have changed it: the pages before the edit (resumePoint) and the
   * pages after it from the point where the new pages start on the same
   * blocks as the old ones (suffixStart, stopAt). See resume.ts.
   */
  private paginateSection(
    el: HTMLElement, contentW: number, contentH: number, css: string, geometry: string,
    prev: SectionPagination | undefined,
  ): SectionPagination {
    const children = Array.from(el.children) as HTMLElement[];
    const sigs = children.map((c) => blockSignature(c.outerHTML));
    children.forEach((c, k) => { c.dataset.apdfChild = String(k); });
    const usable = prev && prev.geometry === geometry ? prev : undefined;

    let startPage = 0;
    let startChild = 0;
    if (usable) {
      const k = firstChange(sigs, usable.sigs);
      if (k === sigs.length && k === usable.sigs.length) {
        // Nothing changed in this section: every page stays.
        retag(usable.pages, 0, children);
        return { ...usable, reused: usable.pages.length };
      }
      ({ page: startPage, child: startChild } = resumePoint(
        k, (i) => /^H[1-6]$/.test(children[i].tagName), usable.pageStarts, sigs.length,
      ));
    }

    const pages = usable && startPage > 0 ? usable.pages.slice(0, startPage) : [];
    if (usable && startPage > 0) retag(pages, 0, children);
    const overflow = usable && startPage > 0 ? usable.overflow.filter((p) => p < startPage) : [];
    let source = el;
    if (startChild > 0) {
      source = createDiv();
      for (const c of children.slice(startChild)) source.appendChild(c);
    }

    // Stop where a new page starts cleanly on a block of the unchanged tail
    // that also started a page last time: the rest is the old pages.
    let rejoin: { page: number; delta: number } | null = null;
    let stopAt: ((next: HTMLElement, done: HTMLElement[][]) => boolean) | undefined;
    if (usable) {
      const { start, delta } = suffixStart(sigs, usable.sigs);
      const oldStart = new Map<number, number>();
      usable.pageStarts.forEach((c, p) => { if (c !== null) oldStart.set(c, p); });
      stopAt = (next, done) => {
        const k = childOf(next);
        if (k === null || k < start) return false;
        const last = done[done.length - 1];
        if (childOf(last[last.length - 1]) === k) return false; // continuation
        const p = oldStart.get(k - delta);
        if (p === undefined || p === 0) return false;
        rejoin = { page: p, delta };
        return true;
      };
    }

    const result = paginateEl(source, contentW, contentH, css, { ...ACADEMIC_PAGINATION, stopAt });
    for (const p of result.overflowedPages) overflow.push(pages.length + p);
    pages.push(...result.pages);
    let reused = startPage;
    const joined = rejoin as { page: number; delta: number } | null;
    if (usable && result.stoppedAt !== undefined && joined) {
      const tail = usable.pages.slice(joined.page);
      retag(tail, joined.delta, children);
      for (const p of usable.overflow) if (p >= joined.page) overflow.push(pages.length + p - joined.page);
      pages.push(...tail);
      reused += tail.length;
    }
    return { geometry, sigs, pages, overflow, pageStarts: pageStartsOf(pages), reused };
  }

  dispose(): void {
    this.paginations = [];
    this.front = null;
    this.token++;
    for (const e of this.cache.values()) e.component.unload();
    this.cache.clear();
  }

  /** Renders `chunks` (key → Markdown) that are not cached yet, several at a
   *  time: most of a chunk's render time is waiting (MathJax queue, fonts).
   *  Returns how many were rendered and whether the MathJax stylesheet still
   *  needs the polling wait (some chunk's maths was not confirmed settled). */
  private async renderMissing(
    chunks: Map<string, string>, sourcePath: string, onDone?: (done: number, total: number) => void,
  ): Promise<{ rendered: number; math: boolean }> {
    const missing = Array.from(chunks).filter(([key]) => !this.cache.has(key));
    let math = false;
    let done = 0;
    await runPool(missing, RENDER_CONCURRENCY, async ([key, chunk]) => {
      const component = new Component();
      component.load();
      try {
        // Measured (F8): MathJax's CSS is final once finishRenderMath has
        // resolved, and a chunk without maths needs no math flush at all.
        const opts: FastRender = { fast: true };
        const el = await renderMarkdownToEl(this.app, chunk, sourcePath, component, opts);
        if (opts.mathUnsettled) math = true;
        await imagesLoaded(el);
        // A newer pass may have rendered the same chunk meanwhile.
        if (this.cache.has(key)) component.unload();
        else {
          // F7: quotes, glued formulas and URL breaks, once per chunk: they
          // depend on nothing but the text, and every pass clones the result.
          applyTypography([el]);
          this.cache.set(key, { el, component });
        }
        onDone?.(++done, missing.length);
      } catch (err) {
        component.unload();
        throw err;
      }
    });
    return { rendered: missing.length, math };
  }

  async render(input: RenderInput): Promise<DocumentLayout> {
    const token = ++this.token;
    const check = () => { if (token !== this.token) throw new RenderSuperseded(); };
    const s = this.getSettings();

    const prep = prepareMarkdown(input.text, s, input.title);
    const { sections, resolve, meta } = prep;

    const dims = resolvePageDims(s);
    const pw = s.orientation === "landscape" ? dims.h : dims.w;
    const ph = s.orientation === "landscape" ? dims.w : dims.h;
    const mTop    = mmToPx(s.marginTop);
    const mBottom = mmToPx(s.marginBottom);
    const mLeft   = mmToPx(s.marginLeft);
    const mRight  = mmToPx(s.marginRight);
    const footerH = s.showFooter && (s.showPageNumbers || !!s.footerText || s.showFooterBorder || !!s.footerImagePath)
      ? (s.footerHeight > 0 ? s.footerHeight : Math.max(28, s.footerFontSize + 14))
      : 0;
    const headerH = s.showHeader && s.runningHead !== "none"
      ? (s.headerHeight > 0 ? s.headerHeight : Math.max(20, s.headerFontSize + 10))
      : 0;
    // At least 1 px so the paginator sandbox never has zero dimensions. F7:
    // the head and the page number sit in the margins, as in LaTeX, so the
    // text block is the page minus the margins.
    const contentW = Math.max(1, pw - mLeft - mRight);
    const contentH = Math.max(1, ph - mTop - mBottom);
    const isRTL    = isRTLContent(input.text);
    const docCSS   = buildDocCSS(s, isRTL);

    const t0 = performance.now();
    const locator = new BlockLocator(input.text);
    const blockLines: (number | null)[] = [];
    const used = new Set<string>();
    const sectionEls: HTMLElement[] = [];
    // Embeds and links resolve against the note's path: same text in
    // another note (or after a rename) is another render.
    const keyOf = (chunk: string) => input.sourcePath + "\u0000" + chunk;
    const plan = sections.map((sec) => splitRenderChunks(sec.md).map((chunk) => ({ chunk, key: keyOf(chunk) })));
    const wanted = new Map<string, string>();
    for (const sec of plan) for (const c of sec) wanted.set(c.key, c.chunk);
    // The abstract is Markdown too: maths and \ref, from the same cache.
    const abstractKey = meta?.abstract ? keyOf("\u0001abstract\u0000" + meta.abstract) : null;
    if (abstractKey && meta?.abstract) wanted.set(abstractKey, meta.abstract);
    for (const key of wanted.keys()) used.add(key);
    const progress = input.onProgress;
    const { rendered, math } = await this.renderMissing(
      wanted, input.sourcePath,
      progress ? (done, total) => { if (token === this.token) progress(RENDER_SHARE * done / total, "render"); } : undefined,
    );
    check();
    progress?.(RENDER_SHARE, "layout");
    const cloneOf = (key: string): HTMLElement => {
      const entry = this.cache.get(key);
      if (!entry) throw new Error("render cache miss");
      const out = createDiv();
      for (const child of Array.from(entry.el.childNodes)) out.appendChild(child.cloneNode(true));
      return out;
    };
    for (const [i, sec] of sections.entries()) {
      const sectionEl = createDiv();
      for (const { key } of plan[i]) {
        const part = cloneOf(key);
        while (part.firstChild) sectionEl.appendChild(part.firstChild);
      }
      dedupeHeadingIds(sectionEl);
      // Tag the blocks with their line in the note, for page breaks. Lead
      // blocks the note has no line for (file-name title, frontmatter shown
      // as code) get none. A section whose count differs gets no tags.
      const starts = blockStarts(sec.md);
      if (sectionEls.length === 0) {
        for (let k = 0, lead = prep.leadBlocks; k < starts.length && lead > 0; k++, lead--) starts[k] = null;
      }
      const children = Array.from(sectionEl.children) as HTMLElement[];
      const lines = starts.map((first) => locator.next(first));
      if (children.length === starts.length) {
        children.forEach((child, k) => {
          child.dataset.apdfBlock = String(blockLines.length);
          blockLines.push(lines[k]);
        });
      }
      sectionEls.push(sectionEl);
    }
    check();
    // Only the chunks of the latest complete pass stay cached.
    for (const [key, e] of this.cache) {
      if (!used.has(key)) { e.component.unload(); this.cache.delete(key); }
    }
    const t1 = performance.now();

    // Document structure (F5), on this pass's clones.
    const hasTitle = !!meta || s.titlePage;
    applyHeadingNumbers(sectionEls, prep.docTitle, s.numberHeadings);
    if (hasTitle) {
      // The title is typeset by the header or the title page: an H1 that
      // repeats it is hidden, not removed, so the page-break tags still match.
      const dup = sectionEls[0]?.querySelector(`[${TITLE_HEADING_ATTR}]`);
      if (dup && sameTitle(dup.textContent ?? "", prep.docTitle)) dup.addClass("apdf-title-dup");
    }
    applyFigures(sectionEls);
    const abstractEl = abstractKey ? cloneOf(abstractKey) : null;
    // Without a title page, the title header heads the contents or, without
    // contents, the first page of the body.
    const header = meta && !s.titlePage ? buildTitleHeader(meta, prep.docTitle, abstractEl) : [];
    if (header.length && !s.includeTOC && sectionEls[0]) sectionEls[0].prepend(...header);

    resolve(abstractEl ? [...header, abstractEl, ...sectionEls] : sectionEls); // pass two of \ref
    // F7: the title header is built per pass; the chunks got their
    // typography when rendered. The language goes on every block.
    applyTypography(header);
    setLang(abstractEl ? [...header, abstractEl, ...sectionEls] : [...header, ...sectionEls], noteLang(input.text) ?? s.hyphenLang);

    // The bundled font must be decoded before pagination measures text.
    await ensureBundledFonts([resolveFont(s), resolveCodeFont(s)]);
    check();
    // F7: wide tables get proportional columns, measured in the real fonts.
    fitTables(sectionEls, contentW, { serif: resolveFont(s), mono: resolveCodeFont(s), size: s.fontSize });
    // MathJax writes its CSS only while typesetting: wait for it only when a
    // chunk rendered in this pass has maths not confirmed settled.
    if (rendered > 0 && math) {
      await waitForMathJaxStylesheetStable();
      check();
    }

    // @font-face stripped from the shadow copy: document.head fonts reach
    // shadow DOM, and some Electron builds fail on fonts in adopted sheets.
    const rawMathCSS    = getMathJaxCSS();
    const shadowMathCSS = rawMathCSS ? stripAtFontFaces(rawMathCSS) : "";
    const fullCSS = shadowMathCSS ? `${shadowMathCSS}\n${docCSS}` : docCSS;

    const bodyPages: HTMLElement[][] = [];
    const bodyOverflow: number[] = [];
    const bodySections: { firstPage: number; start: PreparedSection["start"] }[] = [];
    const geometry = `${contentW}x${contentH}\u0000${fullCSS}`;
    const nextPaginations: SectionPagination[] = [];
    let reusedPages = 0;
    // Reused pages are re-tagged in place (retag): if this loop fails half
    // way, no later pass may start from those pages.
    const previous = this.paginations;
    this.paginations = [];
    for (const [i, el] of sectionEls.entries()) {
      // A long render hands the thread back between sections so the progress
      // bar can paint; quick updates while typing never wait for a frame.
      if (progress && performance.now() - t0 > YIELD_AFTER_MS) {
        progress(RENDER_SHARE + (1 - RENDER_SHARE) * i / sectionEls.length, "layout");
        await afterPaint();
        check();
      }
      const result = this.paginateSection(el, contentW, contentH, fullCSS, geometry, previous[i]);
      nextPaginations.push(result);
      reusedPages += result.reused;
      bodySections.push({ firstPage: bodyPages.length, start: sections[i].start });
      for (const p of result.overflow) bodyOverflow.push(bodyPages.length + p);
      bodyPages.push(...result.pages);
    }
    this.paginations = nextPaginations;
    markContinuedParagraphs(bodyPages);
    progress?.(1, "layout");
    const t2 = performance.now();

    // Front matter (F5): built on the paginated body, for real page numbers.
    const first = s.pageNumberStart;
    let front: FrontPages = { pages: [], kinds: [], overflow: [] };
    if (s.titlePage || s.includeTOC) {
      const frontIn: FrontInput = {
        meta, title: prep.docTitle, abstract: abstractEl, titlePage: s.titlePage, toc: s.includeTOC,
        header: s.includeTOC ? header : [], bodyPages, pageLabel: (i) => String(first + i),
        contentW, contentH, css: fullCSS,
      };
      // Most edits leave the contents as they were: keep the paginated ones.
      const entries = s.includeTOC ? collectTocEntries(bodyPages, frontIn.pageLabel) : [];
      const key = frontKey(frontIn, entries, geometry);
      front = this.front?.key === key ? this.front.pages : buildFrontPages(frontIn, entries);
      this.front = { key, pages: front };
    } else {
      this.front = null;
    }
    const nFront = front.pages.length;
    const allPages = [...front.pages, ...bodyPages];
    const numbering = nFront > 0
      ? frontMatterNumbering(front.kinds, bodyPages.length, first,
        (cur, total) => resolvePageNumberFormat(s.pageNumberFormat, cur, total, input.title))
      : undefined;
    const layouts = buildPageLayouts(allPages, s, input.title, numbering);
    applyRunningHead(layouts, allPages, s, prep.docTitle || input.title, nFront);
    const t3 = performance.now();
    this.lastTimings = {
      renderMs: Math.round(t1 - t0), paginateMs: Math.round(t2 - t1), frontMs: Math.round(t3 - t2),
      chunks: used.size, rendered, reusedPages, pages: allPages.length,
    };
    return {
      layouts, pw, ph, mTop, mLeft, mRight, footerH, headerH, contentW, contentH,
      docCSS: fullCSS, fontFamily: resolveFont(s), accentColor: s.accentColor,
      pageBackground: s.pageBackground, isRTL,
      overflowPages: [...front.overflow, ...bodyOverflow.map((p) => p + nFront)],
      sections: bodySections.map((sec) => ({ ...sec, firstPage: sec.firstPage + nFront })),
      sourceText: input.text, blockLines, frontPages: nFront, pageLabels: pageLabelRanges(nFront, first),
    };
  }
}
