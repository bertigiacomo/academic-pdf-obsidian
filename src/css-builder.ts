// ─────────────────────────────────────────────────────────────────────────────
// CSS generation.
//
// Turns a PDFExportSettings object into the actual CSS strings the preview
// (shadow DOM) and export (print HTML) paths both consume — plus the MathJax
// stylesheet-extraction helpers needed to make typeset formulas show up
// correctly in either path. Everything here is pure string-building; it
// doesn't touch the DOM beyond reading already-rendered MathJax stylesheets.
// ─────────────────────────────────────────────────────────────────────────────

import { App, TFile, requestUrl } from "obsidian";
import { PAGE_SIZES, PDFExportSettings } from "./settings";
import { buildAcademicCSS } from "./academic/css"; // academic-pdf hook
import { buildLatexDocCSS, latexCssInput } from "./academic/latex-css"; // academic-pdf hook

// ─── Small utilities ──────────────────────────────────────────────────────────

/** mm → px at 96 dpi, matching Electron's print pipeline. */
export const mmToPx = (mm: number) => (mm / 25.4) * 96;

/**
 * Returns the page dimensions in px for the current settings.
 * For "Custom", converts the user-entered mm values; for named sizes, looks up
 * PAGE_SIZES directly. Orientation swapping is handled by callers (doRender).
 */
export function resolvePageDims(s: PDFExportSettings): { w: number; h: number } {
  if (s.pageSize === "Custom") {
    return {
      w: Math.max(1, Math.round(mmToPx(s.customPageWidth))),
      h: Math.max(1, Math.round(mmToPx(s.customPageHeight))),
    };
  }
  return PAGE_SIZES[s.pageSize] ?? PAGE_SIZES["A4"];
}

export function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Escapes `</style` in CSS text to prevent the HTML parser from ending the
// <style> block early, regardless of where the sequence appears.
export function escapeCSSForStyle(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}

/** Keeps the image corner radius (px) in the slider's 0–100 range, so a
 *  hand-edited data.json can't produce an invalid radius. */
export function clampImageRadius(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.min(100, Math.max(0, n));
}

/** Converts a vault-relative path or bare filename to an app:// resource URL,
 *  or passes https:// / data: URLs through unchanged. Returns "" for blank input. */
export function resolveImageUrl(app: App, imagePath: string): string {
  const trimmed = imagePath.trim();
  if (!trimmed) return "";
  if (/^(https?:|data:)/i.test(trimmed)) return trimmed;
  const direct = app.vault.getAbstractFileByPath(trimmed);
  if (direct instanceof TFile) return app.vault.getResourcePath(direct);
  const resolved = app.metadataCache.getFirstLinkpathDest(trimmed, "");
  if (resolved instanceof TFile) return app.vault.getResourcePath(resolved);
  console.warn("[academic-pdf] Could not resolve image path:", trimmed);
  return trimmed;
}

/** Maps a `backgroundImageSize` setting value to its CSS `background-size`
 *  and `background-repeat` values. Centralises logic that would otherwise be
 *  duplicated across the preview and export render paths. */
export function bgImageCssProps(size: PDFExportSettings["backgroundImageSize"]): { size: string; repeat: string } {
  return {
    size:   size === "fill" ? "100% 100%" : size === "tile" ? "auto" : size, // "cover" | "contain" pass through
    repeat: size === "tile" ? "repeat" : "no-repeat",
  };
}

// ─── Doc CSS builder ──────────────────────────────────────────────────────────

/** Returns the resolved CSS font-family string for the current settings. */
export function resolveFont(s: PDFExportSettings): string {
  return s.fontFamily === "__custom__" ? (s.customFontName.trim() || "inherit") : s.fontFamily;
}

/** Returns the resolved CSS font-family string for code blocks (inline and fenced). */
export function resolveCodeFont(s: PDFExportSettings): string {
  return s.codeFontFamily === "__custom__"
    ? (s.customCodeFontName.trim() || "'Courier New', monospace")
    : s.codeFontFamily;
}

/** Builds the full `.mpdf-doc` stylesheet shared verbatim by the preview
 *  shadow DOM and the export print HTML.
 *  academic-pdf hook (D2, F7): the upstream preset styles are gone; the
 *  document is typeset by the LaTeX stylesheet, then the block styles. */
export function buildDocCSS(s: PDFExportSettings, isRTL = false): string {
  const font = resolveFont(s);
  const codeFont = resolveCodeFont(s);
  return buildLatexDocCSS(latexCssInput(s, font, codeFont, clampImageRadius(s.imageRadius), isRTL))
    + buildAcademicCSS({ bodyColor: "#000000", pageBackground: s.pageBackground, font, codeFont });
}

// ─── MathJax CSS extraction ───────────────────────────────────────────────────
// MathJax's CHTML output renders formulas via per-glyph CSS rules it writes
// incrementally at typeset time, rather than a static stylesheet — these
// helpers pull that generated CSS out so the preview shadow DOM and the
// export print HTML can both include it.

/** Collects MathJax's CSS for inclusion in shadow DOMs and the export HTML.
 *  Checked from three places — missing any one silently drops specific
 *  glyphs, with no error, while everything else renders fine:
 *    1. `style[id^='MJX-']` elements' `.textContent` — static `@font-face`
 *       rules plus whatever common characters were in the tag's original text.
 *    2. Those same elements' live `.sheet.cssRules` — MathJax's `adaptiveCSS`
 *       mode adds per-glyph rules via `insertRule()`, which updates the live
 *       sheet but never touches `.textContent`. Reading it directly makes
 *       source 1 redundant whenever `.sheet` is accessible; textContent is
 *       kept only as a fallback for the rare case a sheet can't be reached.
 *    3. `document.adoptedStyleSheets` — Constructable Stylesheets have no
 *       corresponding `<style>` DOM node, so no amount of
 *       `querySelectorAll('style')` can see them regardless of which
 *       property is read. */
export function getMathJaxCSS(): string {
  const styleEls = Array.from(
    activeDocument.head.querySelectorAll<HTMLStyleElement>("style[id^='MJX-']"),
  );

  const styleTagCSS = styleEls
    .map((el) => {
      try {
        if (el.sheet?.cssRules) {
          return Array.from(el.sheet.cssRules).map((rule) => rule.cssText).join("\n");
        }
      } catch {
        // sheet inaccessible on this element; fall back to textContent below
      }
      return el.textContent ?? "";
    })
    .join("\n");

  let adoptedCSS = "";
  try {
    const sheets = activeDocument.adoptedStyleSheets ?? [];
    adoptedCSS = sheets
      .map((sheet) => {
        try {
          return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
        } catch {
          return ""; // rules inaccessible on this sheet; skip it, keep the rest
        }
      })
      .filter(Boolean)
      .join("\n");
  } catch (err) {
    // adoptedStyleSheets unsupported in this Electron/Chromium build — degrade
    // to style-tag CSS only.
    console.warn("[academic-pdf] adoptedStyleSheets read failed:", err);
  }

  return adoptedCSS ? `${styleTagCSS}\n${adoptedCSS}` : styleTagCSS;
}

/** Strips @font-face rules from CSS before injecting into shadow-DOM adoptedStyleSheets.
 *  Some Electron builds silently fail to load fonts declared there; MathJax's own
 *  document-head @font-face rules remain accessible to shadow-DOM content per spec. */
export function stripAtFontFaces(css: string): string {
  return css.replace(/@font-face\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/g, "");
}

// Matches url(...) references in CSS — used by getMathJaxCSSInlined to collect
// and replace font URLs with base64 data URIs. String.replace() and matchAll()
// both reset lastIndex to 0 on each call, so this g-flagged constant is safe to share.
const CSS_URL_RE = /url\(\s*["']?([^"')]+)["']?\s*\)/g;

/** Returns MathJax CSS with all font url() references replaced by base64 data URIs.
 *  The export BrowserWindow (loaded from a blob: URL) cannot resolve relative
 *  font paths. Read app:// resources in the source window before moving the CSS;
 *  on fetch error, retain the absolute URL and report the failed resource. */
export async function getMathJaxCSSInlined(): Promise<string> {
  const css = getMathJaxCSS();
  if (!css) return "";

  const urlSet = new Set<string>();
  for (const [, u] of css.matchAll(CSS_URL_RE)) {
    const trimmedU = u.trim();
    if (!trimmedU.startsWith("data:")) urlSet.add(trimmedU);
  }

  if (!urlSet.size) return css;

  const toDataUri = async (url: string): Promise<string> => {
    let absoluteURL = url;
    try {
      // MathJax 4 serves /lib/mathjax/... fonts from Obsidian's app:// origin.
      absoluteURL = new URL(url, activeDocument.baseURI).href;
      let buffer: ArrayBuffer;
      if (/^https?:/i.test(absoluteURL)) {
        // Keep remote fonts CORS-free; renderer fetch is needed for app:// resources.
        const res = await requestUrl(absoluteURL);
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        buffer = res.arrayBuffer;
      } else {
        const res = await activeWindow.fetch(absoluteURL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buffer = await res.arrayBuffer();
      }
      const bytes = new Uint8Array(buffer);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 8192) // chunk to avoid stack overflow
        bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length)));
      const b64  = btoa(bin);
      const low  = absoluteURL.toLowerCase();
      const mime = low.includes("woff2") ? "font/woff2"
                 : low.includes("woff")  ? "font/woff"
                 : low.includes(".ttf")  ? "font/ttf"
                 : "font/otf";
      return `data:${mime};base64,${b64}`;
    } catch (err) {
      console.warn("[academic-pdf] failed to inline math font:", absoluteURL, err);
      return absoluteURL;
    }
  };

  const entries = await Promise.all(
    Array.from(urlSet).map(async (url) => [url, await toDataUri(url)] as const),
  );
  const resolved = new Map(entries);

  return css.replace(CSS_URL_RE, (match, raw: string) => {
    const data = resolved.get(raw.trim());
    return data && data !== raw.trim() ? `url('${data}')` : match;
  });
}

/** Polls `getMathJaxCSS()`'s output size until it stops changing for two
 *  consecutive checks, confirming MathJax's `adaptiveCSS` has finished writing
 *  per-glyph rules for this render pass — DOM insertion of `mjx-container`
 *  alone doesn't guarantee that. Bounded by MAX_WAIT_MS so an already-settled
 *  stylesheet doesn't stall the export; resolves in ~2 polls in that case. */
export async function waitForMathJaxStylesheetStable(): Promise<void> {
  const POLL_MS = 60;
  const STABLE_ROUNDS = 2;
  const MAX_WAIT_MS = 2500;

  const start = Date.now();
  let lastLen = getMathJaxCSS().length;
  let stableRounds = 0;

  while (stableRounds < STABLE_ROUNDS && Date.now() - start < MAX_WAIT_MS) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, POLL_MS));
    const len = getMathJaxCSS().length;
    if (len === lastLen) {
      stableRounds++;
    } else {
      stableRounds = 0;
      lastLen = len;
    }
  }
}
