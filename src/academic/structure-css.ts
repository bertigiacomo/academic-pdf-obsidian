// ─────────────────────────────────────────────────────────────────────────────
// F5 styles for the export and the preview: title page, title header,
// abstract, contents, section numbers, figures. Proportions follow LaTeX's
// article class; the detailed typography is F7.
// ─────────────────────────────────────────────────────────────────────────────

export const STRUCTURE_CSS = `
  .mpdf-doc .apdf-titlepage,
  .mpdf-doc .apdf-maketitle { text-align: center; }
  .mpdf-doc .apdf-maketitle { margin: 0 0 1.6em; }
  .mpdf-doc .apdf-doc-title { font-size: 1.75em; line-height: 1.25; font-weight: normal; }
  .mpdf-doc .apdf-titlepage .apdf-doc-title { font-size: 2.1em; }
  .mpdf-doc .apdf-doc-subtitle { font-size: 1.2em; margin-top: 0.5em; }
  .mpdf-doc .apdf-doc-authors {
    display: flex; flex-wrap: wrap; justify-content: center; gap: 0 2.5em;
    font-size: 1.15em; margin-top: 1.4em;
  }
  .mpdf-doc .apdf-titlepage .apdf-doc-authors { margin-top: 2.6em; }
  .mpdf-doc .apdf-doc-affiliation { margin-top: 0.4em; font-style: italic; }
  .mpdf-doc .apdf-doc-date { font-size: 1.1em; margin-top: 1em; }
  .mpdf-doc .apdf-titlepage .apdf-doc-date { margin-top: 1.8em; }
  .mpdf-doc .apdf-titlepage + .apdf-abstract { margin-top: 4em; }

  .mpdf-doc .apdf-abstract { margin: 0 2.5em 1.8em; font-size: 0.92em; }
  .mpdf-doc .apdf-abstract-title { text-align: center; font-weight: bold; margin-bottom: 0.5em; }
  .mpdf-doc .apdf-abstract-body > :first-child { margin-top: 0; }
  .mpdf-doc .apdf-abstract-body > :last-child { margin-bottom: 0; }

  .mpdf-doc .apdf-toc-title { font-size: 1.45em; font-weight: bold; margin: 0 0 1em; }
  .mpdf-doc .apdf-toc-entry { line-height: 1.5; }
  .mpdf-doc .apdf-toc-link {
    display: flex; align-items: baseline; color: inherit; text-decoration: none;
  }
  .mpdf-doc .apdf-toc-num { flex: none; min-width: 1.5em; padding-right: 0.5em; }
  .mpdf-doc .apdf-toc-text { flex: 0 1 auto; }
  .mpdf-doc .apdf-toc-dots {
    flex: 1 1 auto; min-width: 1em; margin: 0 0.4em; align-self: baseline;
    border-bottom: 1px dotted currentColor; opacity: 0.55; transform: translateY(-0.25em);
  }
  .mpdf-doc .apdf-toc-page { flex: none; min-width: 1.5em; text-align: right; }
  .mpdf-doc .apdf-toc-l1 { margin-top: 0.7em; font-weight: bold; }
  .mpdf-doc .apdf-toc-l1 .apdf-toc-dots { visibility: hidden; }
  .mpdf-doc .apdf-toc-l2 { padding-left: 1.5em; }
  .mpdf-doc .apdf-toc-l2 .apdf-toc-num { min-width: 2.3em; }
  .mpdf-doc .apdf-toc-l3 { padding-left: 3.8em; }
  .mpdf-doc .apdf-toc-l3 .apdf-toc-num { min-width: 3.2em; }

  .mpdf-doc .apdf-secnum { margin-right: 0.55em; }
  .mpdf-doc .apdf-title-dup { display: none; }

  .mpdf-doc figure.apdf-figure { margin: 1.2em 0; text-align: center; }
  .mpdf-doc figure.apdf-figure img { display: block; margin: 0 auto; max-width: 100%; }
  .mpdf-doc .apdf-figure-caption { margin-top: 0.6em; font-size: 0.92em; text-align: center; }

  /* Fragments made by the paginator. They were inline styles, so they must
     win over every rule above, and they travel with the page HTML. */
  .mpdf-doc .apdf-li-cont { list-style: none !important; }
  .mpdf-doc .apdf-table-fixed { table-layout: fixed !important; }
  .mpdf-doc img.apdf-img-fit { width: auto !important; object-fit: contain !important; }
`;
