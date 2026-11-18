// ─────────────────────────────────────────────────────────────────────────────
// F6: rules added to the upstream paginator (paginator.ts paginateEl) through
// its hooks, instead of a rewrite:
//   - algorithms split by line, the caption repeated with "(continued)";
//   - figures and lone images never split; an image taller than a page is
//     scaled down to fit instead of being cut;
//   - a heading (or a run of headings) never ends a page: it moves to the
//     next one when nothing of the following block fits after it;
//   - a code block that fits a page moves whole when splitting it would
//     leave little room unused, and a split leaves at least 3 lines on each
//     side.
// Every rule looks only at the block being placed and the ones after it,
// never back: the resumed pagination in pipeline.ts relies on that.
// ─────────────────────────────────────────────────────────────────────────────

import { splitPreElement } from "../paginator";

type Fits = (node: HTMLElement) => boolean;
type Split = [HTMLElement, HTMLElement] | null;

/** What a rule can measure on the page being filled. */
export interface PageContext {
  /** Nothing placed on the page yet. */
  empty: boolean;
  contentH: number;
  /** Height of the page's content followed by `nodes`. */
  heightWith(nodes: HTMLElement[]): number;
  /** Whether the page's content followed by `nodes` fits. */
  fitsWith(nodes: HTMLElement[]): boolean;
  /** The splitter chain (these rules included), never forced. */
  split(el: HTMLElement, fits: Fits): Split;
}

export interface PaginationHooks {
  /** A split of `el`; null when it must not split; undefined to leave it to
   *  the upstream splitters. */
  split?(el: HTMLElement, fits: Fits, forceSplit: boolean): Split | undefined;
  /** Before placing children[idx], which fits: true ends the page there. */
  breakBefore?(children: HTMLElement[], idx: number, page: PageContext): boolean;
  /** children that does not fit a page with content: true moves it whole. */
  moveWhole?(el: HTMLElement, page: PageContext): boolean;
  /** `el` does not fit the page: a version of it that does, or null. */
  fitInstead?(el: HTMLElement, page: PageContext): HTMLElement | null;
  /** At a new page about to start with `next`: true stops the pagination. */
  stopAt?(next: HTMLElement, pages: HTMLElement[][]): boolean;
}

/** Fewest lines on either side of a code block split. */
export const MIN_CODE_LINES = 3;
/** Fewest lines on either side of an algorithm split. */
export const MIN_ALGO_LINES = 2;
/** A code block that fits a page moves whole when the space it would leave
 *  empty is at most this share of the page. */
export const KEEP_TOGETHER_GAP = 0.25;

const HEADING = /^H[1-6]$/;

// ─── Line-based splits ──────────────────────────────────────────────────────

/**
 * Where to cut a block of `total` lines when the first `fit` lines fit.
 * Returns the number of lines that go first, or null for no split.
 * Pure: the rule shared by code and algorithms.
 */
export function chooseLineSplit(total: number, fit: number, min: number, force: boolean): number | null {
  if (total < 2) return null;
  let n = Math.min(fit, total - 1);
  if (!force) {
    if (n < min) return null;
    if (total - n < min) n = total - min;
    if (n < min) return null;
    return n;
  }
  // Forced (block taller than a page, alone on it): always progress.
  if (total - n < min && total - min >= 1) n = Math.min(n, total - min);
  return Math.max(1, n);
}

/** Largest n in [lo, hi] with ok(n), assuming ok is monotone; lo - 1 if none. */
function largest(lo: number, hi: number, ok: (n: number) => boolean): number {
  let best = lo - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ok(mid)) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}

function codeLines(el: HTMLElement): number {
  const lines = (el.textContent ?? "").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

function splitCode(pre: HTMLElement, fits: Fits, force: boolean): Split {
  const total = codeLines(pre);
  if (total < 2) return null;
  const first = splitPreElement(pre, fits, force);
  const fit = first ? codeLines(first[0]) : 0;
  const n = chooseLineSplit(total, fit, MIN_CODE_LINES, force);
  if (n === null) return null;
  if (first && n === fit) return first;
  // Cut earlier: the upstream splitter takes as many lines as fit.
  return splitPreElement(pre, (node) => codeLines(node) <= n && fits(node), force);
}

// ─── Algorithms ─────────────────────────────────────────────────────────────

/** The element chain from `top` down to the algorithm figure, or null. */
function algoPath(top: HTMLElement): HTMLElement[] | null {
  const algo = top.matches(".apdf-algo") ? top : top.querySelector<HTMLElement>(".apdf-algo");
  if (!algo) return null;
  const path: HTMLElement[] = [];
  for (let n: HTMLElement | null = algo; n; n = n === top ? null : n.parentElement) path.unshift(n);
  if (path[0] !== top) return null;
  // Only a block that is the algorithm and nothing else.
  for (let k = 0; k + 1 < path.length; k++) if (path[k].children.length !== 1) return null;
  return path;
}

/** The algorithm with only `lines` of its body, rebuilt down the path. */
function algoWithLines(path: HTMLElement[], lines: HTMLElement[], firstLine: number, continued: boolean): HTMLElement {
  const algo = path[path.length - 1];
  const fig = algo.cloneNode(false) as HTMLElement;
  for (const child of Array.from(algo.children) as HTMLElement[]) {
    if (child.classList.contains("apdf-algo-body")) {
      const body = child.cloneNode(false) as HTMLElement;
      // Line numbers continue from the previous part (CSS counter).
      if (firstLine > 0) body.setCssStyles({ counterReset: `apdf-line ${firstLine}` });
      for (const l of lines) body.appendChild(l.cloneNode(true));
      fig.appendChild(body);
    } else if (child.classList.contains("apdf-algo-caption")) {
      const cap = child.cloneNode(true) as HTMLElement;
      if (continued && !cap.querySelector(".apdf-algo-cont")) cap.createSpan({ cls: "apdf-algo-cont", text: " (continued)" });
      fig.appendChild(cap);
    } else if (!continued) {
      // Input and Output stay with the first part only.
      fig.appendChild(child.cloneNode(true));
    }
  }
  let out = fig;
  for (let k = path.length - 2; k >= 0; k--) {
    const wrap = path[k].cloneNode(false) as HTMLElement;
    wrap.appendChild(out);
    out = wrap;
  }
  return out;
}

export function splitAlgorithm(top: HTMLElement, fits: Fits, force: boolean): Split | undefined {
  const path = algoPath(top);
  if (!path) return undefined;
  const algo = path[path.length - 1];
  const body = algo.querySelector<HTMLElement>(":scope > .apdf-algo-body");
  if (!body) return null;
  const lines = Array.from(body.children) as HTMLElement[];
  const continued = algo.querySelector(".apdf-algo-cont") !== null;
  // Numbering offset already carried by this part (a part of a part).
  const offset = Number(/apdf-line\s+(\d+)/.exec(body.getAttribute("style") ?? "")?.[1] ?? 0);
  const part = (from: number, to: number, cont: boolean) => algoWithLines(path, lines.slice(from, to), offset + from, cont);

  const fit = largest(1, lines.length - 1, (n) => fits(part(0, n, continued)));
  const n = chooseLineSplit(lines.length, Math.max(0, fit), MIN_ALGO_LINES, force);
  if (n === null) return null;
  return [part(0, n, continued), part(n, lines.length, true)];
}

// ─── Images ─────────────────────────────────────────────────────────────────

function isImageBlock(el: HTMLElement): boolean {
  if (el.tagName === "IMG" || el.tagName === "FIGURE") return el.querySelector(".apdf-algo") === null;
  return el.tagName === "P" && el.querySelector("img") !== null && !(el.textContent ?? "").trim();
}

/** Shrink an image taller than a page only where at least this share of the
 *  page is free; otherwise it moves to the next page and shrinks there. */
export const MIN_SHRINK_ROOM = 0.5;

/** An image block taller than a whole page, with its images capped so that
 *  it fits what is left of this one; null to leave it to the paginator. */
export function shrinkImages(el: HTMLElement, page: PageContext): HTMLElement | null {
  if (!isImageBlock(el)) return null;
  const used = page.empty ? 0 : page.heightWith([]);
  const limit = page.contentH - 2;
  // An image that fits a page of its own moves there unchanged.
  if (page.heightWith([el]) - used <= limit) return null;
  if (!page.empty && (page.contentH - used) / page.contentH < MIN_SHRINK_ROOM) return null;
  const clone = el.cloneNode(true) as HTMLElement;
  const imgs = clone.tagName === "IMG" ? [clone] : Array.from(clone.querySelectorAll<HTMLElement>("img"));
  if (imgs.length === 0) return null;
  let cap = limit - used;
  // The caption and margins take the rest: subtract what still overflows.
  for (let k = 0; k < 4; k++) {
    for (const img of imgs) {
      img.addClass("apdf-img-fit");
      img.setCssStyles({ maxHeight: `${Math.floor(cap)}px` });
    }
    const h = page.heightWith([clone]);
    if (h <= limit) return clone;
    cap -= h - limit + 1;
    if (cap < 40) return null;
  }
  return null;
}

// ─── The hooks ──────────────────────────────────────────────────────────────

function keepWithNext(children: HTMLElement[], idx: number, page: PageContext): boolean {
  if (!HEADING.test(children[idx].tagName)) return false;
  let j = idx;
  while (j + 1 < children.length && HEADING.test(children[j + 1].tagName)) j++;
  const next = children[j + 1];
  if (!next) return false;
  const run = children.slice(idx, j + 1);
  if (page.fitsWith([...run, next])) return false;
  // Some of the next block fits after the headings: they stay.
  if (page.split(next, (node) => page.fitsWith([...run, node])) !== null) return false;
  // So does an image that will be scaled into the room after them.
  const after: PageContext = {
    ...page, empty: false,
    heightWith: (nodes) => page.heightWith([...run, ...nodes]),
    fitsWith: (nodes) => page.fitsWith([...run, ...nodes]),
  };
  return shrinkImages(next, after) === null;
}

export const ACADEMIC_PAGINATION: PaginationHooks = {
  split(el, fits, force) {
    if (isImageBlock(el)) return null;
    if (el.tagName === "PRE") return splitCode(el, fits, force);
    return splitAlgorithm(el, fits, force);
  },
  breakBefore: keepWithNext,
  moveWhole(el, page) {
    if (el.tagName !== "PRE") return false;
    const used = page.heightWith([]);
    const alone = page.heightWith([el]) - used;
    if (alone > page.contentH) return false;
    return (page.contentH - used) / page.contentH <= KEEP_TOGETHER_GAP;
  },
  fitInstead: shrinkImages,
};
