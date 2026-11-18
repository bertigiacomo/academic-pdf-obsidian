// ─────────────────────────────────────────────────────────────────────────────
// The settings, defined once and shown in two places: the plugin's settings
// page (declarative definitions, settings-tab.ts) and the column of the export
// modal (settings-render.ts). Eight groups, 24 rows.
//
// Keys that left the interface (colours, background, frame, header and
// footer details, …) stay in the settings model: the presets set them.
// ─────────────────────────────────────────────────────────────────────────────

import { PAGE_SIZES, PRESETS, PDFExportSettings } from "../../settings";
import { ARTICLE_LINE_HEIGHT, ARTICLE_MARGINS, HYPHEN_LANGUAGES } from "../presets";
import { isRunningHead } from "../running-head";
import { ACADEMIC_CODE_FONT_OPTIONS, ACADEMIC_FONT_OPTIONS } from "../fonts";

export type Settings = PDFExportSettings;

interface RowBase {
  /** Stable id; also the control key of the declarative settings page. */
  id: string;
  name: string;
  /** Shorter name in the modal ("Size" instead of "Font size"). */
  modalName?: string;
  desc?: string;
  /** Shown in the export modal too, not only on the settings page. */
  modal?: boolean;
  visible?: (s: Settings) => boolean;
}

export interface ToggleRow extends RowBase {
  kind: "toggle";
  get: (s: Settings) => boolean;
  set: (s: Settings, v: boolean) => void;
  /** A button before the toggle in the export modal, when `run` can act there. */
  button?: { text: string; run: (ctx: RowContext) => (() => void) | undefined };
}

export interface DropdownRow extends RowBase {
  kind: "dropdown";
  /** Options for the current settings (may include the current value when
   *  it is not one of the standard choices, e.g. a preset's 9.75 pt). */
  options: (s: Settings) => Record<string, string>;
  get: (s: Settings) => string;
  set: (s: Settings, v: string) => void;
  /** Changing this row changes other rows: redraw them. */
  structural?: boolean;
}

export interface TextRow extends RowBase {
  kind: "text";
  placeholder?: string;
  get: (s: Settings) => string;
  set: (s: Settings, v: string) => void;
}

export interface NumberRow extends RowBase {
  kind: "number";
  min?: number;
  get: (s: Settings) => number;
  set: (s: Settings, v: number) => void;
}

/** Rows that need their own controls (Preset + Reset, About). */
export interface ActionRow extends RowBase {
  kind: "action";
  buttons: { text: string; cta?: boolean; run: (ctx: RowContext) => void }[];
  /** Dropdown before the buttons, when there is one. */
  dropdown?: Omit<DropdownRow, "kind" | "id" | "name">;
}

export type Row = ToggleRow | DropdownRow | TextRow | NumberRow | ActionRow;

export interface Group {
  id: string;
  heading: string;
  /** Lucide icon id for setIcon. */
  icon: string;
  /** Shown in the export modal (the document groups). */
  modal: boolean;
  rows: Row[];
}

/** What a row's custom action can reach. */
export interface RowContext {
  settings: Settings;
  applyPreset: (key: string, reset?: boolean) => void;
  openUrl: (url: string) => void;
  version: string;
  /** Opens "Edit title page" for the note being exported; absent without one. */
  editTitlePage?: () => void;
}

// ─── Value mappings ───────────────────────────────────────────────────────────

const PX_PER_PT = 96 / 72;
const FONT_SIZES_PT = [10, 10.5, 11, 12];

/** "11 pt" for 14.666… px; values within 0.05 px count as equal. */
export function ptLabel(px: number): string {
  const pt = Math.round((px / PX_PER_PT) * 100) / 100;
  return `${pt} pt`;
}

// Option keys are never integer-like ("10pt", "lh:2"): JavaScript lists
// integer keys of an object first, which would scramble the menus.

function fontSizeKey(px: number): string {
  for (const pt of FONT_SIZES_PT) if (Math.abs(pt * PX_PER_PT - px) < 0.05) return `${pt}pt`;
  return `${px}px`;
}

function fontSizeOptions(s: Settings): Record<string, string> {
  const entries: [number, string, string][] = FONT_SIZES_PT.map((pt) => [pt * PX_PER_PT, `${pt}pt`, `${pt} pt`]);
  const current = fontSizeKey(s.fontSize);
  if (current.endsWith("px")) entries.push([s.fontSize, current, ptLabel(s.fontSize)]);
  entries.sort((a, b) => a[0] - b[0]);
  return Object.fromEntries(entries.map(([, k, label]) => [k, label]));
}

function setFontSize(s: Settings, key: string): void {
  const n = parseFloat(key);
  if (!Number.isFinite(n)) return;
  s.fontSize = key.endsWith("pt") ? Math.round(n * PX_PER_PT * 1000) / 1000 : n;
}

/** As LaTeX: \baselineskip of article, \onehalfspacing, \doublespacing. */
export const LINE_SPACING: Record<string, number> = { Single: ARTICLE_LINE_HEIGHT, "One and a half": 1.5, Double: 2 };

function lineSpacingOptions(s: Settings): Record<string, string> {
  const entries: [number, string][] = Object.entries(LINE_SPACING).map(([label, v]) => [v, label]);
  if (!entries.some(([v]) => v === s.lineHeight)) entries.push([s.lineHeight, String(s.lineHeight)]);
  entries.sort((a, b) => a[0] - b[0]);
  return Object.fromEntries(entries.map(([v, label]) => [`lh:${v}`, label]));
}

interface Sides { top: number; bottom: number; left: number; right: number }
const even = (mm: number): Sides => ({ top: mm, bottom: mm, left: mm, right: mm });
export const MARGIN_PRESETS: Record<string, Sides> = {
  article: { ...ARTICLE_MARGINS }, narrow: even(15), normal: even(25), wide: even(35),
};
const MARGIN_LABELS: Record<string, string> = {
  article: "LaTeX article", narrow: "Narrow · 15 mm", normal: "Normal · 25 mm", wide: "Wide · 35 mm", custom: "Custom",
};

/** Session-only: the user picked "Custom" while the four sides are still
 *  equal to a preset value, so the per-side fields stay open. */
let marginsCustomPicked = false;

export function marginsValue(s: Settings): string {
  if (!marginsCustomPicked) {
    for (const [k, m] of Object.entries(MARGIN_PRESETS)) {
      if (s.marginTop === m.top && s.marginBottom === m.bottom && s.marginLeft === m.left && s.marginRight === m.right) return k;
    }
  }
  return "custom";
}

function setMargins(s: Settings, v: string): void {
  marginsCustomPicked = v === "custom";
  const m = MARGIN_PRESETS[v];
  if (!m) return;
  s.marginTop = m.top; s.marginBottom = m.bottom; s.marginLeft = m.left; s.marginRight = m.right;
}

export const PAGE_NUMBER_FORMATS: Record<string, string> = {
  "{{current}}": "1",
  "{{current}} / {{total}}": "1 / 4",
  "Page {{current}} of {{total}}": "Page 1 of 4",
  "Page {{current}}": "Page 1",
};

function pageNumberFormatOptions(s: Settings): Record<string, string> {
  const out = { ...PAGE_NUMBER_FORMATS };
  if (!(s.pageNumberFormat in out)) out[s.pageNumberFormat] = s.pageNumberFormat;
  return out;
}

const FONT_OPTIONS: Record<string, string> = {
  ...ACADEMIC_FONT_OPTIONS,
  "Georgia, serif":                          "Georgia",
  "'Times New Roman', Times, serif":         "Times New Roman",
  "'Palatino Linotype', Palatino, serif":    "Palatino",
  "Arial, sans-serif":                       "Arial",
  "'Helvetica Neue', Helvetica, sans-serif": "Helvetica",
  "'Trebuchet MS', sans-serif":              "Trebuchet",
  "__custom__":                              "Custom…",
};

const CODE_FONT_OPTIONS: Record<string, string> = {
  ...ACADEMIC_CODE_FONT_OPTIONS,
  "'Courier New', monospace":     "Courier New",
  "Menlo, Consolas, monospace":   "Menlo",
  "Consolas, monospace":          "Consolas",
  "'Fira Code', monospace":       "Fira Code",
  "'JetBrains Mono', monospace":  "JetBrains Mono",
  "__custom__":                   "Custom…",
};

/** Adds the current value as an option when a preset set one that is not in
 *  the list (so the dropdown never shows a wrong choice). */
function withCurrent(options: Record<string, string>, value: string): Record<string, string> {
  return value in options ? options : { ...options, [value]: value };
}

// ─── Small row builders ─────────────────────────────────────────────────────

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];
type StrKey = { [K in keyof Settings]: Settings[K] extends string ? K : never }[keyof Settings];

function toggle(id: BoolKey, name: string, desc?: string, extra: Partial<ToggleRow> = {}): ToggleRow {
  return {
    id, name, desc, kind: "toggle",
    get: (s) => s[id],
    set: (s, v) => { (s as unknown as Record<string, unknown>)[id] = v; },
    ...extra,
  };
}

function mm(id: "marginTop" | "marginBottom" | "marginLeft" | "marginRight", name: string): NumberRow {
  return {
    id, name, kind: "number", min: 0, modal: true,
    visible: (s) => marginsValue(s) === "custom",
    get: (s) => s[id],
    set: (s, v) => { s[id] = Math.max(0, v); },
  };
}

function strText(id: StrKey, name: string, placeholder: string, extra: Partial<TextRow> = {}): TextRow {
  return {
    id, name, kind: "text", placeholder,
    get: (s) => s[id],
    set: (s, v) => { (s as unknown as Record<string, unknown>)[id] = v; },
    ...extra,
  };
}

// ─── The groups ──────────────────────────────────────────────────────────────

export const RELEASES_URL = "https://github.com/bertigiacomo/academic-pdf-obsidian/releases";

export function settingGroups(version = ""): Group[] {
  return [
    {
      id: "style", heading: "Style", icon: "paintbrush", modal: true,
      rows: [{
        id: "preset", name: "Preset", modal: true, kind: "action",
        desc: "Sets the whole look at once: fonts, spacing, colours, tables.",
        dropdown: {
          options: () => Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.name])),
          get: (s) => s.preset,
          set: () => { /* applied through applyPreset, see settings-render */ },
          structural: true,
        },
        buttons: [{ text: "Reset", run: (ctx) => ctx.applyPreset(ctx.settings.preset, true) }],
      }],
    },
    {
      id: "page", heading: "Page", icon: "ruler", modal: true,
      rows: [
        {
          id: "pageSize", name: "Page size", modalName: "Size", kind: "dropdown", modal: true, structural: true,
          options: (s) => withCurrent(Object.fromEntries(Object.keys(PAGE_SIZES).map((k) => [k, k])), s.pageSize),
          get: (s) => s.pageSize,
          set: (s, v) => { s.pageSize = v; },
        },
        {
          id: "orientation", name: "Orientation", kind: "dropdown", modal: true,
          options: () => ({ portrait: "Portrait", landscape: "Landscape" }),
          get: (s) => s.orientation,
          set: (s, v) => { s.orientation = v === "landscape" ? "landscape" : "portrait"; },
        },
        {
          id: "margins", name: "Margins", kind: "dropdown", modal: true, structural: true,
          desc: "Custom shows one field per side, in millimetres.",
          options: () => MARGIN_LABELS,
          get: marginsValue,
          set: setMargins,
        },
        mm("marginTop", "Top (mm)"),
        mm("marginBottom", "Bottom (mm)"),
        mm("marginLeft", "Left (mm)"),
        mm("marginRight", "Right (mm)"),
      ],
    },
    {
      id: "typography", heading: "Typography", icon: "type", modal: true,
      rows: [
        {
          id: "fontFamily", name: "Font", kind: "dropdown", modal: true, structural: true,
          desc: "Custom… lets you type the name of a font installed on your computer.",
          options: (s) => withCurrent(FONT_OPTIONS, s.fontFamily),
          get: (s) => s.fontFamily,
          set: (s, v) => { s.fontFamily = v; },
        },
        strText("customFontName", "Custom font", "e.g. Inter, sans-serif", {
          modal: true, visible: (s) => s.fontFamily === "__custom__",
        }),
        {
          id: "fontSize", name: "Font size", modalName: "Size", kind: "dropdown", modal: true, structural: true,
          options: fontSizeOptions,
          get: (s) => fontSizeKey(s.fontSize),
          set: setFontSize,
        },
        {
          id: "lineHeight", name: "Line spacing", kind: "dropdown", modal: true, structural: true,
          options: lineSpacingOptions,
          get: (s) => `lh:${s.lineHeight}`,
          set: (s, v) => { const n = parseFloat(v.slice(3)); if (Number.isFinite(n)) s.lineHeight = n; },
        },
        {
          id: "codeFontFamily", name: "Code font", kind: "dropdown", structural: true,
          options: (s) => withCurrent(CODE_FONT_OPTIONS, s.codeFontFamily),
          get: (s) => s.codeFontFamily,
          set: (s, v) => { s.codeFontFamily = v; },
        },
        strText("customCodeFontName", "Custom code font", "e.g. Iosevka, monospace", {
          visible: (s) => s.codeFontFamily === "__custom__",
        }),
        toggle("justify", "Justify text", "Both edges straight, with hyphenation, as in LaTeX.", { modal: true }),
        {
          id: "hyphenLang", name: "Hyphenation language", modalName: "Language", kind: "dropdown", modal: true, structural: true,
          desc: "The language of the notes, for word breaks. A note's own `lang:` in the frontmatter wins.",
          visible: (s) => s.justify,
          options: (s) => withCurrent(HYPHEN_LANGUAGES, s.hyphenLang),
          get: (s) => s.hyphenLang,
          set: (s, v) => { s.hyphenLang = v; },
        },
        toggle("inlineCodeFrame", "Frame inline code", "A thin grey outline around `code` in the text."),
      ],
    },
    {
      id: "structure", heading: "Structure", icon: "list-tree", modal: true,
      rows: [
        toggle("titlePage", "Title page",
          "Title, authors, date and abstract from the note's properties, on a page of their own.",
          { modal: true, button: { text: "Edit", run: (ctx) => ctx.editTitlePage } }),
        toggle("includeTOC", "Table of contents",
          "Contents with page numbers after the title page; front pages are numbered i, ii, …", { modal: true }),
        toggle("numberHeadings", "Number headings", "Sections numbered 1, 1.1, 1.1.1.", { modal: true }),
        toggle("autoBreakH1", "New page for each section", "Start every level-1 heading on a new page.", { modal: true }),
      ],
    },
    {
      id: "academic", heading: "Academic", icon: "sigma", modal: true,
      rows: [
        toggle("numberTheorems", "Number theorems",
          "Theorem, lemma, corollary and definition get a number each, counted per kind.", { modal: true }),
        toggle("numberAlgorithms", "Number algorithms",
          "Algorithm 1, Algorithm 2, … in the caption and in \\ref.", { modal: true }),
        toggle("blockPaper", "Paper look in the editor",
          "Show each block in live preview as a white cut-out of the PDF, whatever the theme."),
      ],
    },
    {
      id: "header-footer", heading: "Header and footer", icon: "panel-bottom", modal: true,
      rows: [
        toggle("showPageNumbers", "Page numbers", undefined, {
          modal: true,
          // Page numbers live in the footer band.
          set: (s, v) => { s.showPageNumbers = v; if (v) s.showFooter = true; },
        }),
        {
          id: "pageNumberFormat", name: "Page number format", kind: "dropdown",
          visible: (s) => s.showPageNumbers,
          options: pageNumberFormatOptions,
          get: (s) => s.pageNumberFormat,
          set: (s, v) => { s.pageNumberFormat = v; },
        },
        {
          id: "runningHead", name: "Running head", modalName: "Header", kind: "dropdown", modal: true, structural: true,
          desc: "The line at the top of each page, under a thin rule.",
          options: () => ({ none: "None", section: "Current section", title: "Note title", custom: "Custom text" }),
          get: (s) => s.runningHead,
          set: (s, v) => { s.runningHead = isRunningHead(v) ? v : "none"; if (s.runningHead !== "none") s.showHeader = true; },
        },
        strText("headerText", "Header text", "Text, {{title}} or {{date}}", {
          visible: (s) => s.runningHead === "custom",
          set: (s, v) => { s.headerText = v; },
        }),
        strText("footerText", "Footer", "Text or {{date}}", {
          set: (s, v) => { s.footerText = v; if (v) s.showFooter = true; },
        }),
      ],
    },
    {
      id: "export", heading: "Export", icon: "download", modal: false,
      rows: [
        toggle("hideFrontmatter", "Hide frontmatter"),
        toggle("includeFilenameAsTitle", "File name as title",
          "Add the note's name as a heading when there is no title page."),
        toggle("includeOutline", "PDF bookmarks", "An outline from the headings, in the sidebar of PDF readers."),
        toggle("prefillSaveLocation", "Save next to the note",
          "Open the save dialog in the note's folder with its name filled in."),
      ],
    },
    {
      id: "about", heading: "About", icon: "info", modal: false,
      rows: [{
        id: "about", name: `Academic PDF ${version}`.trim(), kind: "action",
        desc: "Based on Advanced PDF Export by ShrekBytes, under GPL-3.0. Computer Modern fonts under the SIL Open Font License.",
        buttons: [{ text: "Release notes", run: (ctx) => ctx.openUrl(RELEASES_URL) }],
      }],
    },
  ];
}

/** Every row, by id. */
export function rowsById(groups: Group[]): Map<string, Row> {
  const out = new Map<string, Row>();
  for (const g of groups) for (const r of g.rows) out.set(r.id, r);
  return out;
}
