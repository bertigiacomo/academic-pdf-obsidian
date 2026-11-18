// ─────────────────────────────────────────────────────────────────────────────
// F7: typographic details LaTeX gives for free, applied to the pipeline's
// per-pass clones (never to the cached render, never in live preview):
// - curly quotes and apostrophes (l'uno → l’uno, "x" → “x”);
// - an inline formula glued to the punctuation or word attached to it, so a
//   line never starts with ", " after $x$;
// - break points after / . - _ ? & = in URLs shown as text, like url.sty;
// - the note's language on every block, for hyphenation.
// Code, preformatted text and maths are left alone.
// ─────────────────────────────────────────────────────────────────────────────

// Algorithm statements are pseudo-code (and code in mono mode): left as
// written. Their comments and captions are prose and do get the quotes.
const SKIP = "code, pre, kbd, samp, script, style, .math, mjx-container, .apdf-nobr, .frontmatter, "
  + ".apdf-algo .apdf-s, .apdf-algo--mono .apdf-sig, .apdf-algo--mono .apdf-algo-io dd, .apdf-algo--mono .apdf-c";

const OPENERS = new Set(["", " ", " ", "\n", "\t", "(", "[", "{", "—", "–", "-", "/", "“", "‘"]);

/** Curly quotes in `text`; `prev` is the character before it ("" at the start
 *  of a block). Returns the new text. Idempotent. */
export function smartQuotes(text: string, prev = ""): string {
  if (!text.includes("'") && !text.includes('"')) return text;
  let out = "";
  let before = prev;
  for (const ch of text) {
    let c = ch;
    if (ch === "'") c = OPENERS.has(before) ? "‘" : "’";
    else if (ch === '"') c = OPENERS.has(before) ? "“" : "”";
    out += c;
    before = ch;
  }
  return out;
}

/** How many characters before and after an inline formula belong to it:
 *  the non-space run touching it on each side ("(", ",", "-esimo"). */
export function attachedRuns(before: string, after: string): { lead: number; trail: number } {
  const lead = /[^\s]{0,24}$/.exec(before)?.[0].length ?? 0;
  const trail = /^[^\s]{0,24}/.exec(after)?.[0].length ?? 0;
  return { lead, trail };
}

/** Indexes after which a URL may break: after / . - _ ? & = # : (not at the end). */
export function urlBreaks(url: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < url.length - 1; i++) {
    if ("/.-_?&=#:".includes(url[i]) && !"/.".includes(url[i + 1] ?? "")) out.push(i + 1);
  }
  return out;
}

export function looksLikeUrl(text: string): boolean {
  return /^(https?:\/\/|www\.)\S+$/.test(text.trim());
}

/** The note's `lang:` (or `language:`) from the frontmatter, normalised to
 *  a BCP 47 primary tag; null when absent. */
export function noteLang(markdown: string): string | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/.exec(markdown);
  if (!fm) return null;
  const m = /^(?:lang|language)\s*:\s*["']?([A-Za-z]{2,3})(?:[-_][A-Za-z0-9]+)*["']?\s*$/mi.exec(fm[1]);
  return m ? m[1].toLowerCase() : null;
}

// ── DOM passes ───────────────────────────────────────────────────────────────

function textNodes(root: HTMLElement): Text[] {
  const out: Text[] = [];
  // Skipped subtrees are rejected whole: maths alone holds thousands of
  // glyph text nodes.
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => n.nodeType === Node.TEXT_NODE ? NodeFilter.FILTER_ACCEPT
      : (n as Element).matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP,
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

function quotesIn(block: HTMLElement): void {
  let prev = "";
  for (const t of textNodes(block)) {
    const next = smartQuotes(t.data, prev);
    if (next !== t.data) t.data = next;
    if (t.data) prev = t.data[t.data.length - 1];
  }
}

/** Wraps each inline formula with the text runs touching it in a nowrap span. */
function glueMath(block: HTMLElement): void {
  for (const math of Array.from(block.querySelectorAll<HTMLElement>(".math-inline"))) {
    if (math.parentElement?.closest(".apdf-nobr, code, pre")) continue;
    const prevNode = math.previousSibling;
    const nextNode = math.nextSibling;
    const before = prevNode?.instanceOf(Text) ? prevNode.data : "";
    const after = nextNode?.instanceOf(Text) ? nextNode.data : "";
    const { lead, trail } = attachedRuns(before, after);
    if (lead === 0 && trail === 0) continue;
    const doc = math.ownerDocument;
    const wrap = doc.createElement("span");
    wrap.className = "apdf-nobr";
    math.parentNode?.insertBefore(wrap, math);
    if (lead > 0 && prevNode?.instanceOf(Text)) {
      const tail = prevNode.splitText(prevNode.data.length - lead);
      wrap.appendChild(tail);
    }
    wrap.appendChild(math);
    if (trail > 0 && nextNode?.instanceOf(Text)) {
      const rest = nextNode.splitText(trail);
      wrap.appendChild(nextNode);
      void rest;
    }
  }
}

/** Break opportunities (<wbr>) inside links whose text is a URL. */
function breakUrls(block: HTMLElement): void {
  for (const a of Array.from(block.querySelectorAll<HTMLAnchorElement>("a"))) {
    if (a.childNodes.length !== 1 || !a.firstChild?.instanceOf(Text)) continue;
    const url = a.firstChild.data;
    if (!looksLikeUrl(url)) continue;
    const cuts = urlBreaks(url);
    if (cuts.length === 0) continue;
    const doc = a.ownerDocument;
    while (a.firstChild) a.removeChild(a.firstChild);
    let from = 0;
    for (const at of [...cuts, url.length]) {
      a.appendChild(doc.createTextNode(url.slice(from, at)));
      if (at < url.length) a.appendChild(doc.createElement("wbr"));
      from = at;
    }
  }
}

/**
 * Applies the typographic passes to the rendered blocks: the direct children
 * of each root, or the root itself for the title header pieces. Idempotent.
 */
export function applyTypography(roots: HTMLElement[]): void {
  for (const root of roots) {
    const blocks = root.matches(".apdf-maketitle, .apdf-abstract, .apdf-titlepage") ? [root] : Array.from(root.children) as HTMLElement[];
    for (const block of blocks) {
      if (block.matches("pre, .frontmatter")) continue;
      quotesIn(block);
      glueMath(block);
      breakUrls(block);
    }
  }
}

/** Tags each block (direct child of a root, or a title piece) with `lang`,
 *  which drives hyphenation. */
export function setLang(roots: HTMLElement[], lang: string): void {
  if (!lang) return;
  for (const root of roots) {
    const blocks = root.matches(".apdf-maketitle, .apdf-abstract, .apdf-titlepage") ? [root] : Array.from(root.children);
    for (const block of blocks) if (block.getAttribute("lang") !== lang) block.setAttribute("lang", lang);
  }
}

/** A paragraph split across pages: its second part starts the next page and
 *  takes no \parindent. Same block tag on both sides, or no tags at all. */
export function markContinuedParagraphs(pages: HTMLElement[][]): void {
  for (let i = 1; i < pages.length; i++) {
    const prev = pages[i - 1][pages[i - 1].length - 1];
    const first = pages[i][0];
    if (!first) continue;
    const continued = !!prev && prev.tagName === "P" && first.tagName === "P"
      && prev.getAttribute("data-apdf-block") === first.getAttribute("data-apdf-block");
    first.classList.toggle("apdf-cont", continued);
  }
}
