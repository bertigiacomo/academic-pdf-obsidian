// ─────────────────────────────────────────────────────────────────────────────
// "Export to PDF": a full-window print preview of the note, without Markdown.
// Document settings on the left, pages side by side in the middle, Print… and
// Export PDF at the bottom. Replaces the upstream export modal.
// ─────────────────────────────────────────────────────────────────────────────

import { App, ButtonComponent, Modal, TFile, setIcon } from "obsidian";
import type MarkdownPDFPlugin from "../../main";
import { exportPdf, printPdf } from "./export-pdf";
import { PageBreakAffordance } from "./page-break-ui";
import { onSettingsChanged } from "./settings-bus";
import { settingGroups } from "./settings-model";
import { ModalSettings } from "./settings-render";
import { PreviewSurface, SurfaceState, statusLabel } from "./surface";
import { TitlePageModal } from "./title-page-modal";

interface AppWithSettings {
  setting?: { open?: () => void; openTabById?: (id: string) => void };
}

export function openPluginSettings(app: App, id: string): void {
  const setting = (app as App & AppWithSettings).setting;
  setting?.open?.();
  setting?.openTabById?.(id);
}

export class ExportModal extends Modal {
  private surface!: PreviewSurface;
  private subEl!: HTMLElement;
  private countEl!: HTMLElement;
  private printBtn!: ButtonComponent;
  private exportBtn!: ButtonComponent;
  private busy = false;
  private unsubscribe: (() => void) | null = null;
  private groupsEl!: HTMLElement;
  private settings: ModalSettings | null = null;

  constructor(app: App, private plugin: MarkdownPDFPlugin, private file: TFile | null) {
    super(app);
  }

  onOpen(): void {
    this.plugin.activeModal = this;
    this.modalEl.addClass("apdf-export-modal");
    const root = this.contentEl.createDiv({ cls: "apdf-xm" });

    const side = root.createDiv({ cls: "apdf-xm-side" });
    const head = side.createDiv({ cls: "apdf-xm-head" });
    head.createDiv({ cls: "apdf-xm-title", text: "Export to PDF" });
    this.subEl = head.createDiv({ cls: "apdf-xm-sub" });
    this.groupsEl = side.createDiv({ cls: "apdf-xm-groups" });
    this.buildSettings();
    const foot = side.createDiv({ cls: "apdf-xm-foot" });
    const link = foot.createEl("a", { href: "#" });
    setIcon(link.createSpan(), "settings");
    link.appendText("All settings");
    link.addEventListener("click", (e) => {
      e.preventDefault();
      this.close();
      openPluginSettings(this.app, this.plugin.manifest.id);
    });

    const main = root.createDiv({ cls: "apdf-xm-main" });
    const toolbar = main.createDiv({ cls: "apdf-toolbar" });
    const hint = toolbar.createSpan({ cls: "apdf-hint" });
    setIcon(hint.createSpan(), "mouse-pointer-click");
    hint.appendText("Click between two blocks to start a new page there.");
    toolbar.createSpan({ cls: "apdf-grow" });
    this.countEl = toolbar.createSpan({ cls: "apdf-count" });
    toolbar.createSpan({ cls: "apdf-sep" });

    this.surface = new PreviewSurface(this.app, main, () => this.plugin.settings, {
      zoom: "fit-2",
      zoomModes: ["fit-2", "fit-page", "fit-width"],
      cls: "mod-modal",
      onState: (st) => this.onState(st),
    });
    this.surface.buildZoomControl(toolbar);
    new PageBreakAffordance(
      this.app, () => this.file, () => this.surface.layout, () => void this.surface.renderNow(),
    ).attach(this.surface.canvas);

    const buttons = main.createDiv({ cls: "modal-button-container apdf-xm-buttons" });
    buttons.createSpan({ cls: "apdf-xm-saved", text: "Settings are saved as your defaults." });
    this.printBtn = new ButtonComponent(buttons).setButtonText("Print…").onClick(() => void this.run("print"));
    this.exportBtn = new ButtonComponent(buttons).setButtonText("Export PDF").setCta()
      .onClick(() => void this.run("export"));

    const offSettings = onSettingsChanged(() => {
      this.refreshSettings();
      this.surface.schedule(150);
    });
    // The note can change while the modal is open: "Edit title page" writes
    // its properties, and sync or another plugin may write too.
    const ref = this.app.vault.on("modify", (file) => {
      if (file === this.file) this.surface.schedule(150);
    });
    this.unsubscribe = () => { offSettings(); this.app.vault.offref(ref); };
    this.surface.setFile(this.file);
    this.onState(this.surface.getState());
  }

  onClose(): void {
    if (this.plugin.activeModal === this) this.plugin.activeModal = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.surface.dispose();
    this.contentEl.empty();
  }

  /** The document settings, from the same definitions as the settings page. */
  private buildSettings(): void {
    this.settings = new ModalSettings(
      this.groupsEl, settingGroups(this.plugin.manifest.version),
      () => {
        const file = this.file;
        return {
          ...this.plugin.rowContext(),
          editTitlePage: file ? () => new TitlePageModal(this.app, file).open() : undefined,
        };
      },
      () => void this.plugin.saveSettings(),
    );
    this.settings.render();
  }

  private refreshSettings(): void {
    this.settings?.render();
  }

  private onState(st: SurfaceState): void {
    const name = this.file?.basename ?? "No note";
    const pages = statusLabel(st);
    this.subEl.setText(st.canExport ? `${name} · ${pages}` : name);
    this.countEl.empty();
    this.countEl.toggleClass("mod-warning", st.overflowPages.length > 0 && st.status === "ready");
    if (st.overflowPages.length > 0 && st.status === "ready") setIcon(this.countEl.createSpan(), "alert-triangle");
    this.countEl.appendText(pages);
    const disabled = this.busy || !st.canExport;
    this.printBtn?.setDisabled(disabled);
    this.exportBtn?.setDisabled(disabled);
  }

  /** Export and print re-render from the note's current text first, so
   *  the PDF never lags behind a pending update. */
  private async run(kind: "export" | "print"): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.onState(this.surface.getState());
    try {
      const layout = await this.surface.renderNow();
      if (!layout) return;
      const s = this.plugin.settings;
      if (kind === "export") await exportPdf(this.app, layout, s, this.file);
      else await printPdf(this.app, layout, s, this.file?.basename ?? "");
    } finally {
      this.busy = false;
      if (this.surface) this.onState(this.surface.getState());
    }
  }
}
