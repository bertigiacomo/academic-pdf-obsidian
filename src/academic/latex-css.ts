// ─────────────────────────────────────────────────────────────────────────────
// F7: the document stylesheet of the LaTeX look. It replaces the upstream
// buildDocCSS entirely (D2: nothing of the upstream presets is kept).
//
// Reference: the standard `article` class at 11pt (size11.clo), booktabs for
// tables, listings for code, quote for block quotes, hyperref with hidelinks.
// Lengths are in em of the body size, so 10pt or 12pt scale with it.
// ─────────────────────────────────────────────────────────────────────────────

import type { PDFExportSettings } from "../settings";

export interface LatexCssInput {
  font: string;
  codeFont: string;
  fontSize: number;
  lineHeight: number;
  justify: boolean;
  inlineCodeFrame: boolean;
  codeLigatures: boolean;
  imageRadius: number;
  isRTL: boolean;
}

export function latexCssInput(s: PDFExportSettings, font: string, codeFont: string, imageRadius: number, isRTL: boolean): LatexCssInput {
  return {
    font, codeFont, fontSize: s.fontSize, lineHeight: s.lineHeight,
    justify: s.justify, inlineCodeFrame: s.inlineCodeFrame, codeLigatures: s.codeFontLigatures,
    imageRadius, isRTL,
  };
}

/** \parindent at 11pt: 17pt. */
const PARINDENT = "1.5em";

/** Heading sizes and spaces by depth (article: \section, \subsection,
 *  \subsubsection, \paragraph). Spaces are in the heading's own em:
 *  3.5ex/2.3ex for sections, 3.25ex/1.5ex below. */
const HEADINGS = [
  { size: "1.309em", before: "1.15em", after: "0.76em", lh: 1.25 },  // \Large 14.4pt
  { size: "1.091em", before: "1.28em", after: "0.59em", lh: 1.22 },  // \large 12pt
  { size: "1em",     before: "1.4em",  after: "0.65em", lh: 1.24 },  // \normalsize
  { size: "1em",     before: "1.4em",  after: "0.3em",  lh: 1.24 },  // \paragraph
];

function headingRules(): string {
  const byDepth = HEADINGS.map((h, d) => `
  .mpdf-doc [data-apdf-depth="${d}"] {
    font-size: ${h.size}; line-height: ${h.lh}; margin: ${h.before} 0 ${h.after};
  }`).join("");
  // Headings the pipeline did not tag (none today): by tag, h1 as a section.
  return `
  .mpdf-doc h1, .mpdf-doc h2, .mpdf-doc h3, .mpdf-doc h4, .mpdf-doc h5, .mpdf-doc h6 {
    font-weight: 700; font-style: normal; color: inherit; text-align: start;
    hyphens: manual; border: 0; padding: 0; letter-spacing: 0; opacity: 1;
    break-after: avoid;
  }
  .mpdf-doc h1 { font-size: ${HEADINGS[0].size}; line-height: ${HEADINGS[0].lh}; margin: ${HEADINGS[0].before} 0 ${HEADINGS[0].after}; }
  .mpdf-doc h2 { font-size: ${HEADINGS[1].size}; line-height: ${HEADINGS[1].lh}; margin: ${HEADINGS[1].before} 0 ${HEADINGS[1].after}; }
  .mpdf-doc h3, .mpdf-doc h4, .mpdf-doc h5, .mpdf-doc h6 { font-size: 1em; margin: 1.4em 0 0.65em; }
  ${byDepth}
  /* The note's title, when the document shows it as a heading: \\maketitle. */
  .mpdf-doc [data-apdf-title] {
    font-size: 1.571em; font-weight: 400; line-height: 1.25; text-align: center; margin: 0 0 1.4em;
  }`;
}

export function buildLatexDocCSS(i: LatexCssInput): string {
  const justify = i.justify
    ? `text-align: justify; hyphens: auto; hyphenate-limit-chars: 6 2 3;`
    : `text-align: start; hyphens: manual;`;
  const codeFrame = i.inlineCodeFrame
    ? `border: 0.5px solid #9a9a9a; border-radius: 2px; padding: 0 0.18em;`
    : `border: 0; padding: 0;`;
  const ligatures = i.codeLigatures ? "normal" : "none";

  return `
  .mpdf-doc {
    font-family: ${i.font};
    font-size: ${i.fontSize}px;
    line-height: ${i.lineHeight};
    color: #000;
    box-sizing: border-box;
    font-kerning: normal;
    font-variant-ligatures: common-ligatures;
    ${i.isRTL ? "direction: rtl;" : ""}
  }
  .mpdf-doc *, .mpdf-doc *::before, .mpdf-doc *::after { box-sizing: border-box; }
  .mpdf-doc strong, .mpdf-doc b { font-weight: 700; color: inherit; }
  .mpdf-doc em, .mpdf-doc i { font-style: italic; }
  .mpdf-doc em em, .mpdf-doc i i { font-style: normal; }
  .mpdf-doc mark { background: #fff1a8; color: inherit; padding: 0; }
  .mpdf-doc del, .mpdf-doc s { text-decoration: line-through; }
  .mpdf-doc sup, .mpdf-doc sub { line-height: 0; }
  ${headingRules()}

  /* ── Paragraphs: \\parindent, no \\parskip ─────────────────────────────── */
  .mpdf-doc p { margin: 0; }
  .mpdf-doc > p, .mpdf-doc li, .mpdf-doc blockquote p, .mpdf-doc .callout-content p,
  .mpdf-doc .footnotes li, .mpdf-doc .apdf-abstract-body p,
  .mpdf-doc .apdf-thm > p, .mpdf-doc .apdf-box > p { ${justify} }
  .mpdf-doc > p { text-indent: ${PARINDENT}; }
  .mpdf-doc > p.apdf-cont,
  .mpdf-doc > :is(h1, h2, h3, h4, h5, h6, hr, .apdf-maketitle, .apdf-abstract) + p,
  .mpdf-doc > p:has(> .math-block:only-child) { text-indent: 0; }
  /* A display formula is its own centred line, whatever the paragraph does. */
  .mpdf-doc .math-block { display: block; text-indent: 0; text-align: center; margin: 0.55em 0; }
  .mpdf-doc mjx-container[display="true"] { text-indent: 0; text-align: center; margin: 0; }
  .mpdf-doc > p:has(> .math-block:only-child) .math-block { margin: 0.75em 0; }
  /* Formula glued to its punctuation: never broken at the line end. */
  .mpdf-doc .apdf-nobr { white-space: nowrap; }

  /* ── Lists: between itemize and \\tightlist ────────────────────────────── */
  .mpdf-doc ul, .mpdf-doc ol { margin: 0.45em 0; padding-inline-start: 1.6em; }
  .mpdf-doc li { margin: 0.15em 0; text-indent: 0; }
  .mpdf-doc li > ul, .mpdf-doc li > ol { margin: 0.15em 0; }
  .mpdf-doc li > p { margin: 0; }
  .mpdf-doc ul { list-style-type: disc; }
  .mpdf-doc ul ul { list-style-type: "\\2013\\2002"; }
  .mpdf-doc ul ul ul { list-style-type: "\\2217\\2002"; }
  .mpdf-doc ol ol { list-style-type: lower-alpha; }
  .mpdf-doc ol ol ol { list-style-type: lower-roman; }
  .mpdf-doc li.task-list-item { list-style: none; }
  .mpdf-doc li.task-list-item > input { margin: 0 0.4em 0 -1.3em; vertical-align: baseline; }

  /* ── quote environment ─────────────────────────────────────────────────── */
  .mpdf-doc blockquote {
    margin: 0.6em 2.5em; padding: 0; border: 0; background: none; font-style: normal; color: inherit;
  }
  .mpdf-doc blockquote > p + p { text-indent: ${PARINDENT}; }

  /* ── Inline code and listings ──────────────────────────────────────────── */
  .mpdf-doc code {
    font-family: ${i.codeFont};
    font-variant-ligatures: ${ligatures};
    font-size: 1em;
    color: inherit;
    background: none;
    ${codeFrame}
    hyphens: manual;
  }
  .mpdf-doc pre {
    margin: 0.7em 0; padding: 0; background: none; border: 0; border-radius: 0; overflow: hidden;
    text-align: start; text-indent: 0;
  }
  .mpdf-doc pre code {
    display: block; border: 0; padding: 0;
    font-size: 0.91em; line-height: 1.24; white-space: pre-wrap; overflow-wrap: break-word;
  }
  /* listings with a sober style: keywords bold, comments italic grey. */
  .mpdf-doc pre code .token { color: inherit; font-style: normal; background: none; }
  .mpdf-doc pre code .token.keyword, .mpdf-doc pre code .token.builtin,
  .mpdf-doc pre code .token.important, .mpdf-doc pre code .token.selector,
  .mpdf-doc pre code .token.tag { font-weight: 700; }
  .mpdf-doc pre code .token.comment, .mpdf-doc pre code .token.prolog,
  .mpdf-doc pre code .token.doctype, .mpdf-doc pre code .token.cdata { color: #5c5c5c; font-style: italic; }
  .mpdf-doc pre code .token.string, .mpdf-doc pre code .token.char,
  .mpdf-doc pre code .token.attr-value, .mpdf-doc pre code .token.regex { color: #3a3a3a; }

  /* ── Tables: booktabs ──────────────────────────────────────────────────── */
  .mpdf-doc table {
    width: auto; max-width: 100%; margin: 0.9em auto; border-collapse: collapse;
    border-top: 0.08em solid #000; border-bottom: 0.08em solid #000;
    font-size: 1em; line-height: 1.24; background: none;
  }
  /* A wide table takes the line, with its column shares pinned (tables.ts). */
  .mpdf-doc table.apdf-wide { width: 100%; table-layout: fixed; }
  .mpdf-doc table.apdf-wide th, .mpdf-doc table.apdf-wide td { overflow-wrap: break-word; }
  .mpdf-doc table.apdf-hyphenate td { hyphens: auto; hyphenate-limit-chars: 6 3 3; }
  .mpdf-doc thead { border-bottom: 0.05em solid #000; }
  .mpdf-doc th, .mpdf-doc td {
    border: 0; background: none; color: inherit; vertical-align: top;
    padding: 0.2em 0.55em; text-align: start; text-indent: 0; hyphens: manual;
  }
  .mpdf-doc th { font-weight: 700; font-size: 1em; padding-top: 0.3em; padding-bottom: 0.3em; }
  .mpdf-doc tbody tr:first-child td { padding-top: 0.35em; }
  .mpdf-doc tbody tr:last-child td { padding-bottom: 0.35em; }
  .mpdf-doc th:first-child, .mpdf-doc td:first-child { padding-inline-start: 0; }
  .mpdf-doc th:last-child, .mpdf-doc td:last-child { padding-inline-end: 0; }
  .mpdf-doc tbody tr { background: none; }
  /* Markdown column alignment (:--:) arrives as an align attribute on th/td: a
     presentational hint the th rule above outranks. start/end mirror it in RTL. */
  .mpdf-doc th[align="left"], .mpdf-doc td[align="left"] { text-align: start; }
  .mpdf-doc th[align="center"], .mpdf-doc td[align="center"] { text-align: center; }
  .mpdf-doc th[align="right"], .mpdf-doc td[align="right"] { text-align: end; }

  /* ── Rules, images, links ──────────────────────────────────────────────── */
  .mpdf-doc hr { border: 0; border-top: 0.4pt solid #000; margin: 1em 0; height: 0; }
  .mpdf-doc img {
    max-width: 100%; height: auto; display: block; margin: 0.9em auto;
    border-radius: ${i.imageRadius}px;
  }
  /* hyperref hidelinks; a URL breaks only where url.sty would (<wbr>). */
  .mpdf-doc a { color: inherit; text-decoration: none; hyphens: manual; }
  .mpdf-doc a.external-link::after { display: none !important; content: none !important; }
  .mpdf-doc .copy-code-button { display: none !important; }

  /* ── Footnotes: \\footnotesize under a short rule ─────────────────────── */
  .mpdf-doc .footnotes { font-size: 0.82em; margin-top: 1.2em; }
  .mpdf-doc .footnotes hr { width: 40%; margin: 0 0 0.5em; border-top-width: 0.4pt; }
  .mpdf-doc .footnotes ol { padding-inline-start: 1.4em; margin: 0; }
  .mpdf-doc .footnote-backref { display: none; }

  /* ── Callouts: a plain framed box, title in bold ───────────────────────── */
  .mpdf-doc .callout {
    border: 0.4pt solid #000 !important; border-radius: 0 !important; background: none !important;
    box-shadow: none !important; margin: 0.9em 0 !important; padding: 0.5em 0.8em !important;
    font-style: normal !important; color: inherit !important;
  }
  .mpdf-doc .callout-title {
    display: block !important; padding: 0 !important; margin: 0 0 0.25em !important;
    background: none !important; border: 0 !important; color: inherit !important;
    font: inherit !important; font-weight: 700 !important; text-transform: none !important; letter-spacing: 0 !important;
  }
  .mpdf-doc .callout-icon, .mpdf-doc .callout-fold { display: none !important; }
  .mpdf-doc .callout-title-inner { display: inline !important; }
  .mpdf-doc .callout-content { padding: 0 !important; background: none !important; color: inherit !important; }
  .mpdf-doc .callout-content > p + p { text-indent: ${PARINDENT}; }

  /* ── Mermaid ───────────────────────────────────────────────────────────── */
  .mpdf-doc .mermaid { display: flex; justify-content: center; margin: 0.9em 0; overflow: hidden; }
  .mpdf-doc .mermaid svg { max-width: 100%; height: auto; display: block; }

  /* ── Running head (fancyhdr): slanted, under a 0.4pt rule ──────────────── */
  .apdf-runhead { font-style: italic; }
  `.trim();
}
