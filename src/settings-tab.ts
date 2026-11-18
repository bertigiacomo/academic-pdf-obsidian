// ─────────────────────────────────────────────────────────────────────────────
// Plugin settings tab (Settings → Academic PDF).
//
// academic-pdf hook: the rows come from src/academic/ui/settings-model.ts,
// the same definitions the export modal shows. Control keys are row ids,
// mapped back to settings by getControlValue / setControlValue below.
// ─────────────────────────────────────────────────────────────────────────────

import { App, PluginSettingTab, SettingDefinitionItem } from "obsidian";
import type MarkdownPDFPlugin from "./main";
import { RowContext, rowsById, settingGroups } from "./academic/ui/settings-model";
import { getRowValue, isStructural, setRowValue, toDefinitions } from "./academic/ui/settings-render";

export class PDFExportSettingTab extends PluginSettingTab {
  plugin: MarkdownPDFPlugin;

  constructor(app: App, plugin: MarkdownPDFPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.icon = "file-output";
  }

  private groups() {
    return settingGroups(this.plugin.manifest.version);
  }

  private ctx = (): RowContext => this.plugin.rowContext();

  getControlValue(key: string): unknown {
    const row = rowsById(this.groups()).get(key);
    return row ? getRowValue(row, this.plugin.settings) : undefined;
  }

  setControlValue(key: string, value: unknown): void {
    const row = rowsById(this.groups()).get(key);
    if (!row) return;
    setRowValue(row, this.plugin.settings, value);
    void this.plugin.saveSettings();
    // A structural change (page size, font, margins) changes other rows'
    // options: rebuild. Otherwise re-evaluating visibility is enough.
    if (isStructural(row)) this.update();
    else this.refreshDomState();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return toDefinitions(this.groups(), {
      ctx: this.ctx,
      afterAction: () => { void this.plugin.saveSettings(); this.update(); },
    });
  }
}
