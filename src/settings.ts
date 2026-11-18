// ─────────────────────────────────────────────────────────────────────────────
// Settings schema, style presets, and defaults.
//
// This is the plugin's data model: the shape of a saved settings object, the
// seven built-in style presets, and the values a fresh install starts with.
// Pure data + types — no Obsidian imports, no rendering logic. Anything that
// *turns* these settings into CSS lives in css-builder.ts; anything that
// *edits* them lives in settings-tab.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const PAGE_SIZES: Record<string, { w: number; h: number }> = {
  A4:     { w: 794,  h: 1123 },
  A3:     { w: 1123, h: 1587 },
  Letter: { w: 816,  h: 1056 },
  Legal:  { w: 816,  h: 1344 },
  A5:     { w: 559,  h: 794  },
};

export interface DocStyle {
  name: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  headingScale: number;
  accentColor: string;
  bodyColor: string;
  boldColor: string;
  headingColor: string;
  h1BorderBottom: boolean;
  h2BorderBottom: boolean;
  centerH1: boolean;
  blockquoteBg: string;
  blockquoteBorderColor: string;
  codeBackground: string;
  codeFontSize: number;
  codeFontFamily: string;
  codeTheme: string;
  tableHeaderBg: string;
  tableBorderColor: string;
  tableStriped: boolean;
  pageBackground: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
}

export interface PDFExportSettings extends DocStyle {
  pageSize: string;
  orientation: "portrait" | "landscape";
  preset: string;
  headerText: string;
  footerText: string;
  showHeader: boolean;
  // academic-pdf hook: academic blocks (src/academic)
  numberAlgorithms: boolean;
  numberTheorems: boolean;
  /** Live preview: draw each block as a white cut-out of the PDF. */
  blockPaper: boolean;
  /** F5: title page, contents and section numbers (src/academic). */
  titlePage: boolean;
  includeTOC: boolean;
  numberHeadings: boolean;
  // academic-pdf hook (F7, src/academic): justified text, inline code frame, running head.
  /** Justified text with hyphenation in hyphenLang. */
  justify: boolean;
  hyphenLang: string;
  /** F7: a thin grey frame around inline code. */
  inlineCodeFrame: boolean;
  /** F7: what the top of each page shows (fancyhdr-like running head). */
  runningHead: "none" | "section" | "title" | "custom";
  showFooter: boolean;
  showHeaderBorder: boolean;
  showFooterBorder: boolean;
  showPageNumbers: boolean;
  pageNumberPosition: "center" | "left" | "right";
  pageNumberStart: number;
  /** Template for rendering the page number string. Supports {{current}},
   *  {{total}}, and {{title}} placeholders, e.g. "Page {{current}} of {{total}}". */
  pageNumberFormat: string;
  showHeaderOnFirstPage: boolean;
  showFooterOnFirstPage: boolean;
  headerAlignment: "left" | "center" | "right";
  footerTextAlignment: "left" | "center" | "right";
  headerFontSize: number;
  headerFontColor: string;
  footerFontSize: number;
  footerFontColor: string;
  linkUnderline: boolean;
  /** Corner radius of images in the export, in px (0 = square). */
  imageRadius: number;
  frameEnabled: boolean;
  frameColor: string;
  frameThickness: number;
  frameMargin: number;
  frameStyle: "solid" | "dashed" | "dotted" | "double" | "groove" | "ridge";
  hideFrontmatter: boolean;
  customFontName: string;
  /** Used only when codeFontFamily === "__custom__". */
  customCodeFontName: string;
  /** Typographic ligatures (e.g. -> and !=) for fonts that support them, such as Fira Code. */
  codeFontLigatures: boolean;
  autoBreakH1: boolean;
  autoBreakH2: boolean;
  includeFilenameAsTitle: boolean;
  previewScale: number;
  /** Width in mm, used only when pageSize === "Custom". */
  customPageWidth: number;
  /** Height in mm, used only when pageSize === "Custom". */
  customPageHeight: number;

  // ── Header/footer band sizing ─────────────────────────────────────────────
  /** Explicit header band height in px. 0 = auto (derived from headerFontSize). */
  headerHeight: number;
  /** Explicit footer band height in px. 0 = auto (derived from footerFontSize). */
  footerHeight: number;

  // ── Header/footer banner images ───────────────────────────────────────────
  /** Vault-relative path or https:// URL for a banner image behind the header text. */
  headerImagePath: string;
  /** Left/right gap in px between the banner image and the page edges (0 = edge-to-edge). */
  headerImageMargin: number;
  footerImagePath: string;
  /** Left/right gap in px between the banner image and the page edges. */
  footerImageMargin: number;

  // ── Page background (color OR image — mutually exclusive) ────────────────
  /** When true, backgroundImagePath is used instead of the pageBackground color. */
  backgroundImageEnabled: boolean;
  backgroundImagePath: string;
  /** How the image fills the background zone. */
  backgroundImageSize: "cover" | "contain" | "fill" | "tile";
  /** "full-page": behind header+content+footer. "content-only": text zone only. */
  backgroundImageScope: "full-page" | "content-only";
  /** 0–1 opacity for the background image layer. */
  backgroundImageOpacity: number;
  /** When true, headings H1–H6 are embedded as a bookmark tree in the exported PDF. */
  includeOutline: boolean;

  // ── Save location ──────────────────────────────────────────────────────────
  /** When true, the save dialog opens in the note's own folder with the note's
   *  file name pre-filled as ".pdf". Ignored when there is no source note. */
  prefillSaveLocation: boolean;
}

// ─── Style Presets ────────────────────────────────────────────────────────────
import { ACADEMIC_PRESETS, DEFAULT_PRESET } from "./academic/presets"; // academic-pdf hook

// academic-pdf hook (D2): only our presets; the upstream seven are gone.
export const PRESETS: Record<string, DocStyle> = ACADEMIC_PRESETS;

export const DEFAULT_SETTINGS: PDFExportSettings = {
  pageSize: "A4",
  orientation: "portrait",
  preset: DEFAULT_PRESET,
  ...PRESETS[DEFAULT_PRESET],
  headerText: "",
  footerText: "",
  showHeader: true,
  numberAlgorithms: true, // academic-pdf hook
  numberTheorems: true,
  blockPaper: false,
  titlePage: false,
  includeTOC: false,
  numberHeadings: false,
  justify: true, // academic-pdf hook (F7)
  hyphenLang: "en",
  inlineCodeFrame: false,
  runningHead: "none",
  showFooter: true,
  showHeaderBorder: false,
  showFooterBorder: false,
  showPageNumbers: true,
  pageNumberPosition: "center", // academic-pdf hook (F7): LaTeX's \thepage, centred
  pageNumberStart: 1,
  pageNumberFormat: "{{current}}", // academic-pdf hook (F7)
  showHeaderOnFirstPage: true,
  showFooterOnFirstPage: true,
  headerAlignment:     "right",
  footerTextAlignment: "left",
  // academic-pdf hook: LaTeX sets head and foot in the body size, in black.
  headerFontSize: 14.667,
  headerFontColor: "#000000",
  footerFontSize: 14.667,
  footerFontColor: "#000000",
  linkUnderline: false, // academic-pdf hook (F7): hyperref hidelinks
  imageRadius: 0,
  frameEnabled: false,
  frameColor: "#000000",
  frameThickness: 4,
  frameMargin: 8,
  frameStyle: "solid",
  hideFrontmatter: false,
  customFontName: "",
  customCodeFontName: "",
  codeFontLigatures: false,
  autoBreakH1: false,
  autoBreakH2: false,
  includeFilenameAsTitle: false,
  previewScale: 0.9,
  customPageWidth: 210,   // A4 width in mm
  customPageHeight: 297,  // A4 height in mm
  // Band sizing (0 = auto from font size)
  headerHeight: 0,
  footerHeight: 0,
  // Banner images (header / footer background)
  headerImagePath: "",
  headerImageMargin: 0,
  footerImagePath: "",
  footerImageMargin: 0,
  // Page background
  backgroundImageEnabled: false,
  backgroundImagePath: "",
  backgroundImageSize: "cover",
  backgroundImageScope: "full-page",
  backgroundImageOpacity: 1,
  // Outline / bookmarks
  includeOutline: true,
  // Save location
  prefillSaveLocation: true,
};

/** Color pickers in the Colors settings group. Used to reset only those
 *  fields to the active preset's defaults without touching other DocStyle. */
export const PRESET_COLOR_KEYS = [
  "accentColor", "bodyColor", "boldColor", "headingColor",
  "blockquoteBg", "blockquoteBorderColor", "tableHeaderBg", "tableBorderColor", "codeBackground",
] as const satisfies readonly (keyof DocStyle)[];

/** Extracts only the DocStyle fields from the broader settings object.
 *  Used to snapshot the current look before switching presets, so each
 *  preset can remember per-user tweaks independently. */
export function extractDocStyle(s: PDFExportSettings): DocStyle {
  return {
    name: s.name, fontFamily: s.fontFamily, fontSize: s.fontSize,
    lineHeight: s.lineHeight, paragraphSpacing: s.paragraphSpacing,
    headingScale: s.headingScale, accentColor: s.accentColor,
    bodyColor: s.bodyColor, boldColor: s.boldColor, headingColor: s.headingColor,
    h1BorderBottom: s.h1BorderBottom, h2BorderBottom: s.h2BorderBottom,
    centerH1: s.centerH1, blockquoteBg: s.blockquoteBg,
    blockquoteBorderColor: s.blockquoteBorderColor, codeBackground: s.codeBackground,
    codeFontSize: s.codeFontSize, codeFontFamily: s.codeFontFamily, codeTheme: s.codeTheme,
    tableHeaderBg: s.tableHeaderBg, tableBorderColor: s.tableBorderColor,
    tableStriped: s.tableStriped, pageBackground: s.pageBackground,
    marginTop: s.marginTop, marginBottom: s.marginBottom,
    marginLeft: s.marginLeft, marginRight: s.marginRight,
  };
}
