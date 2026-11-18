// ─────────────────────────────────────────────────────────────────────────────
// Our presets (D2). Only these exist: the upstream presets are gone. "LaTeX"
// reproduces the standard `article` class at 11pt on the chosen paper:
// Computer Modern, black ink, the class's own margins and baselineskip.
// More presets will be designed later, each with its own visual review.
// ─────────────────────────────────────────────────────────────────────────────

import type { DocStyle, PDFExportSettings } from "../settings";
import { CMU_SERIF_STACK, CMU_TYPEWRITER_STACK } from "./fonts";

/** 11pt in CSS px (1pt = 4/3 px). */
export const PT11 = 14.667;

/** article, 11pt, A4: \textwidth 360pt (127 mm) centred, 43 lines of text.
 *  The footer band (page number) sits inside the bottom margin, as \footskip. */
export const ARTICLE_MARGINS = { top: 37, bottom: 35, left: 42, right: 42 } as const;

/** article's \baselineskip at 11pt is 13.6pt. */
export const ARTICLE_LINE_HEIGHT = 1.24;

const LATEX: DocStyle = {
  name: "LaTeX",
  fontFamily: CMU_SERIF_STACK,
  fontSize: PT11,
  lineHeight: ARTICLE_LINE_HEIGHT,
  paragraphSpacing: 0,
  headingScale: 1,
  // The upstream colour keys stay in the data model but the LaTeX stylesheet
  // draws everything in black; they are set so nothing reads as a colour.
  accentColor: "#000000",
  bodyColor: "#000000",
  boldColor: "#000000",
  headingColor: "#000000",
  h1BorderBottom: false,
  h2BorderBottom: false,
  centerH1: false,
  blockquoteBg: "transparent",
  blockquoteBorderColor: "#000000",
  codeBackground: "transparent",
  codeFontSize: 1,
  codeFontFamily: CMU_TYPEWRITER_STACK,
  codeTheme: "latex",
  tableHeaderBg: "transparent",
  tableBorderColor: "#000000",
  tableStriped: false,
  pageBackground: "#ffffff",
  marginTop: ARTICLE_MARGINS.top,
  marginBottom: ARTICLE_MARGINS.bottom,
  marginLeft: ARTICLE_MARGINS.left,
  marginRight: ARTICLE_MARGINS.right,
};

export const ACADEMIC_PRESETS: Record<string, DocStyle> = { latex: LATEX };
export const DEFAULT_PRESET = "latex";

/** Hyphenation languages offered when the text is justified. */
export const HYPHEN_LANGUAGES: Record<string, string> = {
  en: "English", it: "Italian", fr: "French", de: "German", es: "Spanish", pt: "Portuguese", nl: "Dutch",
};

/** The first value of "Hyphenation language": Obsidian's own language when
 *  we offer it, English otherwise. */
export function initialHyphenLang(uiLang: string | null | undefined): string {
  const base = (uiLang ?? "").toLowerCase().split(/[-_]/)[0];
  return base in HYPHEN_LANGUAGES ? base : "en";
}

/** Page furniture of the LaTeX look, given to settings saved under an
 *  upstream preset: only the page number, centred, in the body size. */
export function migratedFurniture(): Partial<PDFExportSettings> {
  return {
    headerText: "", footerText: "", runningHead: "none",
    showPageNumbers: true, showFooter: true, pageNumberFormat: "{{current}}", pageNumberPosition: "center",
    showHeaderBorder: false, showFooterBorder: false,
    headerFontSize: PT11, footerFontSize: PT11, headerFontColor: "#000000", footerFontColor: "#000000",
    linkUnderline: false,
  };
}
