// ─────────────────────────────────────────────────────────────────────────────
// "PDF preview": a pane beside the note that shows its print preview and
// updates as you type. Follows the active Markdown note, like Outline; when
// the active tab is not Markdown (graph, canvas, PDF) it keeps the last note.
// Only looks: no settings, no page breaks. "Export…" opens the export modal.
// ─────────────────────────────────────────────────────────────────────────────

import { ButtonComponent, ItemView, MarkdownView, TAbstractFile, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type MarkdownPDFPlugin from "../../main";
import { activeMarkdownFile } from "./note-source";
import { printPdf } from "./export-pdf";
import { onSettingsChanged } from "./settings-bus";
import { PreviewSurface, SurfaceState, statusLabel } from "./surface";

export const PREVIEW_VIEW_TYPE = "academic-pdf-preview";

/** Pause in typing before the preview updates. */
const TYPING_DEBOUNCE_MS = 400;

export class PdfPreviewView extends ItemView {
  private surface!: PreviewSurface;
  private countEl!: HTMLElement;
  private printEl!: HTMLElement;
  private exportBtn!: ButtonComponent;
  private printing = false;

  constructor(leaf: WorkspaceLeaf, private plugin: MarkdownPDFPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return PREVIEW_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "PDF preview";
  }

  getIcon(): string {
    return "file-output";
  }

  /** The note being previewed. */
  get file(): TFile | null {
    return this.surface?.getFile() ?? null;
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("apdf-pane");

    const toolbar = root.createDiv({ cls: "apdf-toolbar" });
    this.countEl = toolbar.createSpan({ cls: "apdf-count" });
    toolbar.createSpan({ cls: "apdf-grow" });

    this.surface = new PreviewSurface(this.app, root, () => this.plugin.settings, {
      zoom: "fit-width",
      zoomModes: ["fit-width", "fit-page"],
      cls: "mod-pane",
      onState: (st) => this.onState(st),
    });
    this.surface.buildZoomControl(toolbar);
    toolbar.createSpan({ cls: "apdf-sep" });
    this.printEl = toolbar.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Print" } });
    setIcon(this.printEl, "printer");
    this.printEl.addEventListener("click", () => void this.print());
    // Icon + label; in a narrow sidebar only the icon shows (styles.css).
    this.exportBtn = new ButtonComponent(toolbar).setCta()
      .setTooltip("Export to PDF…")
      .onClick(() => this.plugin.openModal(this.file ?? undefined));
    const btn = this.exportBtn.buttonEl;
    btn.addClass("apdf-export-btn");
    setIcon(btn.createSpan({ cls: "apdf-export-icon" }), "file-output");
    btn.createSpan({ cls: "apdf-export-label", text: "Export…" });

    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      if (leaf?.view instanceof MarkdownView && leaf.view.file) this.follow(leaf.view.file);
    }));
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      if (file?.extension === "md" && this.app.workspace.getActiveViewOfType(MarkdownView)?.file === file) {
        this.follow(file);
      }
    }));
    // Every open editor reports here: only the followed note counts.
    this.registerEvent(this.app.workspace.on("editor-change", (_editor, info) => {
      if (info.file && info.file === this.file) this.surface.schedule(TYPING_DEBOUNCE_MS);
    }));
    // Changes from outside an editor (sync, another plugin, a page break
    // written with vault.process while the note is closed).
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file === this.file) this.surface.schedule(TYPING_DEBOUNCE_MS);
    }));
    this.registerEvent(this.app.vault.on("rename", (file: TAbstractFile) => {
      if (file === this.file) { this.updateTitle(); this.surface.schedule(0); }
    }));
    this.registerEvent(this.app.vault.on("delete", (file: TAbstractFile) => {
      if (file === this.file) { this.surface.setFile(null); this.updateTitle(); }
    }));
    this.register(onSettingsChanged(() => this.surface.schedule(150)));

    this.follow(activeMarkdownFile(this.app));
  }

  async onClose(): Promise<void> {
    this.surface?.dispose();
  }

  /** Shows `file` (from a file menu), whatever the active note. */
  show(file: TFile): void {
    this.follow(file);
  }

  private follow(file: TFile | null): void {
    if (!file && this.file) return; // keep the last note
    this.surface.setFile(file);
    this.updateTitle();
  }

  /** The tab says "PDF preview"; the view header names the note. */
  private updateTitle(): void {
    const title = this.containerEl.querySelector(".view-header-title");
    if (!title) return;
    title.empty();
    if (this.file) {
      title.createSpan({ cls: "apdf-crumb", text: "PDF · " });
      title.appendText(this.file.basename);
    } else {
      title.setText(this.getDisplayText());
    }
  }

  private onState(st: SurfaceState): void {
    const cut = st.status === "ready" && st.overflowPages.length > 0;
    this.countEl.empty();
    this.countEl.toggleClass("mod-warning", cut);
    if (cut) setIcon(this.countEl.createSpan(), "alert-triangle");
    this.countEl.appendText(statusLabel(st));
    const canPrint = st.canExport && !this.printing;
    this.printEl?.toggleClass("is-disabled", !canPrint);
    this.printEl?.setAttr("aria-disabled", String(!canPrint));
    this.exportBtn?.setDisabled(!this.file);
  }

  private async print(): Promise<void> {
    if (this.printing || !this.surface.getState().canExport) return;
    this.printing = true;
    this.onState(this.surface.getState());
    try {
      const layout = await this.surface.renderNow();
      if (layout) await printPdf(this.app, layout, this.plugin.settings, this.file?.basename ?? "");
    } finally {
      this.printing = false;
      this.onState(this.surface.getState());
    }
  }
}

/** Opens the preview pane in the right split, or reveals it if already open. */
export async function activatePreview(plugin: MarkdownPDFPlugin, file?: TFile): Promise<void> {
  const { workspace } = plugin.app;
  let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(PREVIEW_VIEW_TYPE)[0] ?? null;
  if (!leaf) {
    leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: PREVIEW_VIEW_TYPE, active: false });
  }
  await workspace.revealLeaf(leaf);
  if (file && leaf.view instanceof PdfPreviewView) leaf.view.show(file);
}
