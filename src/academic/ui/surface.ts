// ─────────────────────────────────────────────────────────────────────────────
// A print-preview surface: pipeline + page canvas + the six states (first
// render, updating, content cut off, error, empty note, no note). The preview
// pane and the export modal each own one and add their own toolbar around it.
// ─────────────────────────────────────────────────────────────────────────────

import { App, ButtonComponent, Menu, Notice, TFile, setIcon } from "obsidian";
import type { PDFExportSettings } from "../../settings";
import { readNote } from "./note-source";
import { PageCanvas, ZOOM_STEPS, ZoomMode, zoomLabel } from "./page-view";
import { DocumentLayout, RenderPhase, RenderPipeline, RenderSuperseded } from "./pipeline";

export type SurfaceStatus = "none" | "empty" | "first" | "updating" | "ready" | "error";

export interface SurfaceState {
  status: SurfaceStatus;
  pageCount: number;
  overflowPages: number[];
  /** True when a valid layout exists (Export and Print work). */
  canExport: boolean;
  /** Whole percent done, once a render has run long enough to show it; null otherwise. */
  progress: number | null;
  /** What a long render is doing: rendering the note, or laying out its pages. */
  phase: RenderPhase;
}

/** A render shows real progress only after running this long: below it the
 *  indeterminate line is enough, and a number that flashes by is noise. */
const DETERMINATE_AFTER_MS = 1000;

/** The page-count label of a toolbar: "Rendering… 42%", "Updating…", "12 pages".
 *  Laying out a section cannot report as it goes, so that phase is named
 *  instead of showing a number that stands still. */
export function statusLabel(st: SurfaceState): string {
  const busy = st.status === "first" || st.status === "updating";
  if (busy && st.progress !== null && st.phase === "layout") return "Laying out pages…";
  const pct = st.progress !== null ? ` ${st.progress}%` : "";
  if (st.status === "first") return `Rendering…${pct}`;
  if (st.status === "updating") return `Updating…${pct}`;
  return st.canExport ? `${st.pageCount} page${st.pageCount === 1 ? "" : "s"}` : "—";
}

export interface SurfaceOptions {
  zoom: ZoomMode;
  zoomModes: ZoomMode[];
  cls: string;
  onState: (state: SurfaceState) => void;
}

export class PreviewSurface {
  readonly pipeline: RenderPipeline;
  readonly canvas: PageCanvas;
  private progressEl: HTMLElement;
  private noticeEl: HTMLElement;
  private stateEl: HTMLElement;
  private file: TFile | null = null;
  private timer: number | null = null;
  private status: SurfaceStatus = "none";
  private lastError = "";
  layout: DocumentLayout | null = null;
  private renderedFor: TFile | null = null;
  private disposed = false;
  private progress: number | null = null;
  private phase: RenderPhase = "render";

  constructor(
    private app: App, parent: HTMLElement, private getSettings: () => PDFExportSettings,
    private opts: SurfaceOptions,
  ) {
    this.pipeline = new RenderPipeline(app, getSettings);
    this.progressEl = parent.createDiv({ cls: "apdf-progress" });
    this.progressEl.createEl("i");
    this.noticeEl = parent.createDiv({ cls: "apdf-notice" });
    const body = parent.createDiv({ cls: "apdf-body" });
    this.canvas = new PageCanvas(body, app, getSettings, opts.zoom, opts.cls);
    this.stateEl = body.createDiv({ cls: "apdf-state" });
    this.setStatus("none");
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.pipeline.dispose();
    this.canvas.destroy();
  }

  getFile(): TFile | null {
    return this.file;
  }

  /** Follows a note. Rendering starts at once for a different note. */
  setFile(file: TFile | null): void {
    if (file === this.file && (file !== null || this.status === "none")) return;
    this.file = file;
    if (!file) {
      this.pipeline.cancel();
      this.layout = null;
      this.renderedFor = null;
      this.canvas.clear();
      this.setStatus("none");
      return;
    }
    this.schedule(0);
  }

  /** Re-renders after `delay` ms, restarting the wait on every call. */
  schedule(delay: number): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.renderNow();
    }, delay);
  }

  /** Renders now from the current note text. Resolves with the layout, or
   *  null when it failed, was superseded, or there is nothing to show. */
  async renderNow(): Promise<DocumentLayout | null> {
    if (this.timer !== null) { window.clearTimeout(this.timer); this.timer = null; }
    const file = this.file;
    if (!file) { this.setStatus("none"); return null; }
    // Rendering and pagination measure in the active window (upstream code
    // uses activeDocument), where the bundled fonts may not be registered:
    // wait until this surface's window is the active one again.
    if (activeDocument !== this.canvas.el.doc) {
      this.schedule(500);
      return null;
    }
    let text: string;
    try {
      text = await readNote(this.app, file);
    } catch (err) {
      this.fail(err);
      return null;
    }
    if (this.disposed || file !== this.file) return null;
    if (!text.trim()) {
      this.pipeline.cancel();
      this.layout = null;
      this.renderedFor = file;
      this.canvas.clear();
      this.setStatus("empty");
      return null;
    }
    const firstForNote = this.renderedFor !== file || !this.layout;
    if (firstForNote) this.canvas.clear();
    // A superseded render may have left its share on the bar: start again.
    if (this.progress !== null) this.setProgress(null);
    this.setStatus(firstForNote ? "first" : "updating");
    // Let the state paint before pagination blocks the thread.
    await new Promise<void>((r) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => r())));
    const started = performance.now();
    const onProgress = (done: number, phase: RenderPhase) => {
      if (this.disposed || file !== this.file) return;
      if (performance.now() - started < DETERMINATE_AFTER_MS) return;
      const pct = Math.min(99, Math.floor(done * 100));
      if (pct !== this.progress || phase !== this.phase) this.setProgress(pct, phase);
    };
    try {
      const layout = await this.pipeline.render({ text, title: file.basename, sourcePath: file.path, onProgress });
      if (this.disposed || file !== this.file) return null;
      this.layout = layout;
      this.renderedFor = file;
      this.canvas.draw(layout);
      this.setStatus("ready");
      return layout;
    } catch (err) {
      if (err instanceof RenderSuperseded || this.disposed) return null;
      this.fail(err);
      return null;
    }
  }

  private fail(err: unknown): void {
    console.error("[academic-pdf] render error:", err);
    this.lastError = err instanceof Error ? (err.stack ?? err.message) : String(err);
    this.layout = null;
    this.canvas.clear();
    this.setStatus("error");
  }

  getState(): SurfaceState {
    const layout = this.status === "ready" || this.status === "updating" ? this.layout : null;
    return {
      status: this.status,
      pageCount: layout?.layouts.length ?? 0,
      overflowPages: layout?.overflowPages ?? [],
      canExport: !!layout && layout.layouts.length > 0,
      progress: this.progress,
      phase: this.phase,
    };
  }

  /** Switches the line under the toolbar from indeterminate to a real share. */
  private setProgress(pct: number | null, phase: RenderPhase = "render"): void {
    this.progress = pct;
    this.phase = phase;
    this.progressEl.toggleClass("is-determinate", pct !== null);
    this.progressEl.setCssProps({ "--apdf-progress": pct === null ? "" : `${pct}%` });
    this.opts.onState(this.getState());
  }

  private setStatus(status: SurfaceStatus): void {
    this.status = status;
    const busy = status === "first" || status === "updating";
    if (!busy && this.progress !== null) {
      this.progress = null;
      this.progressEl.removeClass("is-determinate");
      this.progressEl.setCssProps({ "--apdf-progress": "" });
    }
    this.progressEl.toggleClass("is-active", busy);
    this.canvas.el.toggleClass("is-updating", status === "updating");
    this.renderNotice();
    this.renderState();
    this.opts.onState(this.getState());
  }

  private renderNotice(): void {
    this.noticeEl.empty();
    const pages = this.status === "ready" ? this.layout?.overflowPages ?? [] : [];
    this.noticeEl.toggleClass("is-active", pages.length > 0);
    if (!pages.length) return;
    const page = pages[0] + 1;
    setIcon(this.noticeEl.createSpan({ cls: "apdf-notice-icon" }), "alert-triangle");
    const msg = this.noticeEl.createDiv({ cls: "apdf-notice-msg" });
    msg.createEl("b", { text: `Content cut off on page ${page}.` });
    msg.appendText(" A block is taller than a page and can't be split. Shorten it, or use a smaller font or narrower margins.");
    new ButtonComponent(this.noticeEl).setButtonText("Show").onClick(() => this.canvas.scrollToPage(pages[0]));
  }

  private renderState(): void {
    const el = this.stateEl;
    el.empty();
    const s = this.status;
    const showCanvas = s === "ready" || s === "updating";
    this.canvas.el.toggleClass("apdf-is-hidden", !showCanvas);
    el.toggleClass("apdf-is-hidden", showCanvas);
    el.toggleClass("mod-skeleton", s === "first");
    if (showCanvas) return;

    if (s === "first") {
      for (let p = 0; p < 2; p++) {
        const sheet = el.createDiv({ cls: "apdf-skeleton" });
        sheet.createEl("i", { cls: "mod-h" });
        for (let i = 0; i < 9; i++) sheet.createEl("i", { cls: i % 3 === 2 ? "mod-s" : "" });
        sheet.createEl("i", { cls: "mod-b" });
        for (let i = 0; i < 5; i++) sheet.createEl("i", { cls: i % 3 === 2 ? "mod-s" : "" });
      }
      return;
    }

    const icon = el.createDiv({ cls: "apdf-state-icon" });
    if (s === "none") {
      setIcon(icon, "file-output");
      el.createEl("h4", { text: "No note to preview" });
      el.createEl("p", { text: "Open a Markdown note and its PDF appears here." });
    } else if (s === "empty") {
      setIcon(icon, "file");
      el.createEl("h4", { text: "This note is empty" });
      const p = el.createEl("p");
      p.appendText(`Start writing in ${this.file?.basename ?? "the note"} and the pages appear here as you type. To add a theorem or an algorithm, run `);
      p.createEl("b", { text: "Insert academic block" });
      p.appendText(".");
    } else if (s === "error") {
      icon.addClass("mod-error");
      setIcon(icon, "alert-circle");
      el.createEl("h4", { text: "Couldn't render this note" });
      el.createEl("p", { text: "Fix the problem in the note and the preview updates by itself." });
      el.createEl("pre", { text: this.lastError.split("\n").slice(0, 6).join("\n") });
      const actions = el.createDiv({ cls: "apdf-state-actions" });
      new ButtonComponent(actions).setButtonText("Try again").onClick(() => void this.renderNow());
      new ButtonComponent(actions).setButtonText("Copy details").onClick(() => {
        void navigator.clipboard.writeText(this.lastError).then(() => new Notice("Details copied."));
      });
    }
  }

  /** Builds the − / level menu / + zoom control into `parent`. */
  buildZoomControl(parent: HTMLElement): void {
    const wrap = parent.createDiv({ cls: "apdf-zoom" });
    const out = wrap.createDiv({ cls: "clickable-icon apdf-zoom-step", attr: { "aria-label": "Zoom out" } });
    setIcon(out, "minus");
    const level = wrap.createDiv({ cls: "apdf-zoom-level", attr: { "aria-label": "Zoom" } });
    const label = level.createSpan({ text: zoomLabel(this.canvas.getZoom()) });
    setIcon(level.createSpan({ cls: "apdf-zoom-chevron" }), "chevron-down");
    const inn = wrap.createDiv({ cls: "clickable-icon apdf-zoom-step", attr: { "aria-label": "Zoom in" } });
    setIcon(inn, "plus");
    const set = (z: ZoomMode) => { this.canvas.setZoom(z); label.setText(zoomLabel(this.canvas.getZoom())); };
    out.addEventListener("click", () => { this.canvas.stepZoom(-1); label.setText(zoomLabel(this.canvas.getZoom())); });
    inn.addEventListener("click", () => { this.canvas.stepZoom(1); label.setText(zoomLabel(this.canvas.getZoom())); });
    level.addEventListener("click", (e) => {
      const menu = new Menu();
      for (const z of [...this.opts.zoomModes, ...ZOOM_STEPS]) {
        menu.addItem((item) => item.setTitle(zoomLabel(z)).setChecked(this.canvas.getZoom() === z).onClick(() => set(z)));
      }
      menu.showAtMouseEvent(e);
    });
  }
}
