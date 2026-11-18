// ─────────────────────────────────────────────────────────────────────────────
// Plugin entry point.
//
// Thin bootstrap: owns the loaded settings object and hands off to
// src/academic/ui (preview pane, export modal, entry points) and
// PDFExportSettingTab (settings-tab.ts) for everything UI-related.
// ─────────────────────────────────────────────────────────────────────────────

import { Plugin, TFile, getLanguage } from "obsidian";
import {
  DocStyle, PDFExportSettings, PRESETS, DEFAULT_SETTINGS, extractDocStyle, PRESET_COLOR_KEYS,
} from "./settings";
import { ExportModal } from "./academic/ui/export-modal"; // academic-pdf hook
import { clearSettingsListeners, notifySettingsChanged } from "./academic/ui/settings-bus"; // academic-pdf hook
import { PDFExportSettingTab } from "./settings-tab";
import { warmUpMathJax } from "./markdown";
import { removeBundledFonts } from "./academic/font-loader"; // academic-pdf hook
import type { RowContext } from "./academic/ui/settings-model"; // academic-pdf hook
import { registerUi } from "./academic/ui/entry-points"; // academic-pdf hook
import { activeMarkdownFile } from "./academic/ui/note-source"; // academic-pdf hook
import { refreshAcademicStyles, registerAcademic } from "./academic/register"; // academic-pdf hook
import { DEFAULT_PRESET, initialHyphenLang, migratedFurniture } from "./academic/presets"; // academic-pdf hook

export default class MarkdownPDFPlugin extends Plugin {
  declare settings: PDFExportSettings;
  activeModal: ExportModal | null = null;
  presetSnapshots: Record<string, DocStyle> = {};

  async onload() {
    await this.loadSettings();
    // Fire-and-forget: pay MathJax's one-time cold-start cost now, in the
    // background, so it's already done by the time the user opens the export
    // modal instead of adding several seconds to their first real render.
    void warmUpMathJax(this.app);
    registerUi(this); // academic-pdf hook: preview pane, menus, commands, ribbon
    this.addSettingTab(new PDFExportSettingTab(this.app, this));
    registerAcademic(this); // academic-pdf hook
  }

  onunload() {
    this.activeModal?.close();
    removeBundledFonts(); // academic-pdf hook
    clearSettingsListeners(); // academic-pdf hook
  }

  openModal(file?: TFile) {
    if (this.activeModal) this.activeModal.close();
    // academic-pdf hook: our export modal replaces the upstream one.
    const target = file ?? activeMarkdownFile(this.app);
    new ExportModal(this.app, this, target).open();
  }

  async loadSettings() {
    const data = (await this.loadData() ?? {}) as Partial<PDFExportSettings> & {
      presetSnapshots?: Record<string, DocStyle>;
      lastSeenVersion?: string;
    };
    // academic-pdf hook (D5): release notes are gone; drop their stamp.
    delete data.lastSeenVersion;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

    // Migration: codeTheme was added per-preset; absent value adopts the active preset's default.
    if (data.codeTheme === undefined) {
      this.settings.codeTheme = PRESETS[this.settings.preset]?.codeTheme ?? DEFAULT_SETTINGS.codeTheme;
    }

    // Migration: boldColor was added per-preset; absent value keeps current body text color.
    if (data.boldColor === undefined) {
      this.settings.boldColor = this.settings.bodyColor;
    }

    // Migration: tableBorderColor was added per-preset; absent value uses accent
    // (matching the previous hardcoded th/td border: accentColor + 33 alpha).
    if (data.tableBorderColor === undefined) {
      this.settings.tableBorderColor = this.settings.accentColor;
    }

    this.presetSnapshots = data.presetSnapshots ?? {};
    if (data.hyphenLang === undefined) this.settings.hyphenLang = initialHyphenLang(getLanguage()); // academic-pdf hook
    this.validateSettings();
  }

  /** Clamps critical numeric settings to safe ranges and repairs invalid
   *  enum values. Called after load so corrupt or manually-edited JSON
   *  cannot produce invisible text, zero-size pages, or bad layout. */
  private validateSettings(): void {
    const s = this.settings;

    // academic-pdf hook (D2): a preset that no longer exists (the upstream
    // ones) takes our default preset's whole look, and its page furniture.
    if (!(s.preset in PRESETS)) {
      Object.assign(s, PRESETS[DEFAULT_PRESET], migratedFurniture());
      s.preset = DEFAULT_PRESET;
      this.presetSnapshots = {};
    }

    // Font sizes must be positive to produce visible text.
    s.fontSize         = Math.max(1,  s.fontSize);
    s.headerFontSize   = Math.max(1,  s.headerFontSize);
    s.footerFontSize   = Math.max(1,  s.footerFontSize);

    // Margins must be non-negative; zero is allowed (full-bleed layouts).
    s.marginTop        = Math.max(0,  s.marginTop);
    s.marginBottom     = Math.max(0,  s.marginBottom);
    s.marginLeft       = Math.max(0,  s.marginLeft);
    s.marginRight      = Math.max(0,  s.marginRight);

    // Custom page dimensions need a printable minimum.
    s.customPageWidth  = Math.max(10, s.customPageWidth);
    s.customPageHeight = Math.max(10, s.customPageHeight);

    // Preview scale must be a usable positive fraction.
    s.previewScale     = Math.max(0.1, Math.min(3, s.previewScale));

    // Page-number start must be at least 1.
    s.pageNumberStart  = Math.max(1,  s.pageNumberStart);

    // Page-number format: fall back to default when cleared.
    if (!s.pageNumberFormat || !s.pageNumberFormat.trim()) {
      s.pageNumberFormat = DEFAULT_SETTINGS.pageNumberFormat;
    }
  }

  async saveSettings() {
    await this.saveData({
      ...this.settings,
      presetSnapshots: this.presetSnapshots,
    });
    refreshAcademicStyles(this); // academic-pdf hook
    notifySettingsChanged(); // academic-pdf hook: open previews re-render
  }

  /** academic-pdf hook: what the settings rows (settings-model.ts) can reach. */
  rowContext(): RowContext {
    return {
      settings: this.settings,
      applyPreset: (key, reset) => this.applyPreset(key, reset),
      openUrl: (url) => window.open(url),
      version: this.manifest.version,
    };
  }

  async saveSettingsAndRender() {
    await this.saveSettings();
  }

  applyPreset(key: string, reset = false) {
    const p = PRESETS[key];
    if (!p) return;
    if (reset) {
      delete this.presetSnapshots[key];
    } else {
      this.presetSnapshots[this.settings.preset] = extractDocStyle(this.settings);
    }
    this.settings.preset = key;
    Object.assign(this.settings, p, reset ? {} : (this.presetSnapshots[key] ?? {}));
  }

  /** Restores the Colors-group pickers of the active preset to PRESETS defaults.
   *  Other presets' snapshots and non-color settings are left untouched. */
  resetPresetColors(): void {
    const key = this.settings.preset;
    const p = PRESETS[key];
    if (!p) return;
    for (const k of PRESET_COLOR_KEYS) {
      this.settings[k] = p[k];
    }
    const snap = this.presetSnapshots[key];
    if (snap) {
      for (const k of PRESET_COLOR_KEYS) {
        snap[k] = p[k];
      }
    }
  }
}
