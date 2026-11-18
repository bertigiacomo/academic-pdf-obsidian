// ─────────────────────────────────────────────────────────────────────────────
// The two renderers of settings-model.ts:
//  - toDefinitions(): declarative definitions for the settings page;
//  - ModalSettings: compact `Setting` rows in the export modal's column.
// ─────────────────────────────────────────────────────────────────────────────

import {
  DropdownComponent, Setting, SettingDefinitionItem, SettingGroupItem, setIcon,
} from "obsidian";
import { ActionRow, Group, Row, RowContext, Settings } from "./settings-model";

/** Adds the group's icon before its heading. The declarative API takes text
 *  only, so the icon is placed from the group's extra-button hook, whose
 *  element sits in the heading; the button itself is removed. */
function headingIcon(icon: string, heading: string) {
  return (extra: { extraSettingsEl: HTMLElement }) => {
    const place = () => {
      let scope: HTMLElement | null = extra.extraSettingsEl.parentElement;
      for (let depth = 0; scope && depth < 4; depth++, scope = scope.parentElement) {
        const label = Array.from(scope.querySelectorAll<HTMLElement>("*"))
          .find((el) => el.childElementCount === 0 && el.textContent?.trim() === heading);
        if (label) {
          if (!label.querySelector(".apdf-heading-icon")) {
            const span = createSpan({ cls: "apdf-heading-icon" });
            setIcon(span, icon);
            label.prepend(span);
            label.addClass("apdf-heading-label");
          }
          return true;
        }
      }
      return false;
    };
    extra.extraSettingsEl.addClass("apdf-is-hidden");
    if (!place()) window.requestAnimationFrame(() => { place(); });
  };
}

function renderAction(setting: Setting, row: ActionRow, ctx: () => RowContext, after: () => void): void {
  if (row.dropdown) {
    const dd = row.dropdown;
    setting.addDropdown((d) => d.addOptions(dd.options(ctx().settings)).setValue(dd.get(ctx().settings))
      .onChange((v) => {
        if (row.id === "preset") ctx().applyPreset(v);
        else dd.set(ctx().settings, v);
        after();
      }));
  }
  for (const b of row.buttons) {
    setting.addButton((btn) => {
      btn.setButtonText(b.text).onClick(() => { b.run(ctx()); after(); });
      if (b.cta) btn.setCta();
    });
  }
}

export interface DefinitionHost {
  ctx: () => RowContext;
  /** Called after an action row changed settings: save and redraw. */
  afterAction: () => void;
}

/** Declarative definitions for the settings page. Control keys are row ids;
 *  the tab maps them back with getControlValue / setControlValue. */
export function toDefinitions(groups: Group[], host: DefinitionHost): SettingDefinitionItem[] {
  const s = () => host.ctx().settings;
  return groups.map((g) => ({
    type: "group" as const,
    heading: g.heading,
    extraButtons: [headingIcon(g.icon, g.heading)],
    items: g.rows.map((row): SettingGroupItem => {
      const base = {
        name: row.name, desc: row.desc,
        visible: row.visible ? () => row.visible?.(s()) ?? true : undefined,
      };
      switch (row.kind) {
        case "toggle": return { ...base, control: { type: "toggle", key: row.id } };
        case "dropdown": return { ...base, control: { type: "dropdown", key: row.id, options: row.options(s()) } };
        case "text": return { ...base, control: { type: "text", key: row.id, placeholder: row.placeholder } };
        case "number": return { ...base, control: { type: "number", key: row.id, min: row.min } };
        case "action": return { ...base, render: (setting) => renderAction(setting, row, host.ctx, host.afterAction) };
      }
    }),
  }));
}

export function getRowValue(row: Row, s: Settings): unknown {
  switch (row.kind) {
    case "action": return undefined;
    default: return row.get(s);
  }
}

export function setRowValue(row: Row, s: Settings, value: unknown): void {
  switch (row.kind) {
    case "toggle": row.set(s, Boolean(value)); break;
    case "dropdown": row.set(s, String(value)); break;
    case "text": row.set(s, typeof value === "string" ? value : ""); break;
    case "number": {
      const n = typeof value === "number" ? value : parseFloat(String(value));
      if (Number.isFinite(n)) row.set(s, n);
      break;
    }
    case "action": break;
  }
}

/** True when a change to this row can change other rows' options or
 *  visibility, so the whole list must be redrawn. */
export function isStructural(row: Row): boolean {
  return row.kind === "action" || (row.kind === "dropdown" && !!row.structural);
}

/**
 * The export modal's settings column: the document groups, with their icon,
 * as compact Setting rows. Every change saves the settings (they are the
 * user's defaults) and the save re-renders the pages.
 */
export class ModalSettings {
  private rows: { row: Row; el: HTMLElement }[] = [];

  constructor(
    private el: HTMLElement,
    private groups: Group[],
    private ctx: () => RowContext,
    private save: () => void,
  ) {}

  render(): void {
    // Keep focus in a field the user is typing in or choosing from.
    const focused = this.el.doc.activeElement;
    if (focused && this.el.contains(focused)
      && (focused.instanceOf(HTMLInputElement) || focused.instanceOf(HTMLTextAreaElement) || focused.instanceOf(HTMLSelectElement))) {
      this.refreshVisibility();
      return;
    }
    const scroll = this.el.scrollTop;
    this.el.empty();
    this.rows = [];
    const s = this.ctx().settings;
    for (const g of this.groups.filter((gr) => gr.modal)) {
      const groupEl = this.el.createDiv({ cls: "apdf-xm-group" });
      const head = groupEl.createDiv({ cls: "apdf-xm-group-head" });
      setIcon(head.createSpan({ cls: "apdf-heading-icon" }), g.icon);
      head.createSpan({ text: g.heading });
      for (const row of g.rows.filter((r) => r.modal)) {
        const setting = new Setting(groupEl).setName(row.modalName ?? row.name);
        this.rows.push({ row, el: setting.settingEl });
        const changed = () => {
          this.save();
          if (isStructural(row)) this.render();
          else this.refreshVisibility();
        };
        switch (row.kind) {
          case "toggle": {
            const action = row.button?.run(this.ctx());
            if (row.button && action) setting.addButton((b) => b.setButtonText(row.button?.text ?? "").onClick(action));
            setting.addToggle((t) => t.setValue(row.get(s)).onChange((v) => { row.set(this.ctx().settings, v); changed(); }));
            break;
          }
          case "dropdown":
            setting.addDropdown((d: DropdownComponent) => d.addOptions(row.options(s)).setValue(row.get(s))
              .onChange((v) => { row.set(this.ctx().settings, v); changed(); }));
            break;
          case "text":
            setting.addText((t) => t.setPlaceholder(row.placeholder ?? "").setValue(row.get(s))
              .onChange((v) => { row.set(this.ctx().settings, v); this.save(); }));
            break;
          case "number":
            setting.addText((t) => {
              t.inputEl.type = "number";
              if (row.min !== undefined) t.inputEl.min = String(row.min);
              t.setValue(String(row.get(s))).onChange((v) => {
                const n = parseFloat(v);
                if (Number.isFinite(n)) { row.set(this.ctx().settings, n); this.save(); }
              });
            });
            break;
          case "action":
            renderAction(setting, row, this.ctx, () => { this.save(); this.render(); });
            break;
        }
      }
    }
    this.refreshVisibility();
    this.el.scrollTop = scroll;
  }

  refreshVisibility(): void {
    const s = this.ctx().settings;
    for (const { row, el } of this.rows) el.toggleClass("apdf-is-hidden", row.visible ? !row.visible(s) : false);
  }
}

