// ─────────────────────────────────────────────────────────────────────────────
// Draws the pages of a DocumentLayout into a scrolling container, each page in
// its own shadow root (isolated from the theme). Shared by the preview pane and
// the export modal. Moved from the upstream modal's drawPreview, plus:
//  - diff: a page is rebuilt only when its signature changed;
//  - zoom: fit width / fit page / fit two pages / a fixed percentage, applied
//    by rescaling the existing pages, never by redrawing them.
// The export (export-pdf.ts) builds the same page structure as HTML.
// ─────────────────────────────────────────────────────────────────────────────

import { bandTops } from "../running-head";
import { App } from "obsidian";
import type { PDFExportSettings } from "../../settings";
import { bgImageCssProps, resolveImageUrl } from "../../css-builder";
import type { DocumentLayout } from "./pipeline";

export type ZoomMode = "fit-width" | "fit-page" | "fit-2" | number;

export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5];

export function zoomLabel(z: ZoomMode): string {
  if (z === "fit-width") return "Fit width";
  if (z === "fit-page") return "Fit page";
  if (z === "fit-2") return "Fit 2 pages";
  return `${Math.round(z * 100)}%`;
}

/** Called after a page is (re)built, to add interactive overlays. */
export type PageDecorator = (pageIndex: number, content: HTMLElement, shadow: ShadowRoot, wrap: HTMLElement) => void;

interface DrawnPage {
  sig: string;
  wrap: HTMLElement;
  host: HTMLElement;
}

const PAGE_GAP = 24;

/** Small, fast string hash (FNV-1a). Collisions only cost a missed redraw
 *  check, never a wrong page: the signature also carries lengths. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + ":" + text.length;
}

function frameBorderCSS(s: PDFExportSettings): string {
  return `${s.frameThickness}px ${s.frameStyle} ${s.frameColor}`;
}

/** The fixed parts of the page chrome: background, banners, header, content
 *  box, footer and frame. Positions and sizes are set per page. Must match
 *  the inline styles of the export HTML (export-pdf.ts). Comes after the
 *  document CSS, so `.mpdf-doc` rules can't move the content box. */
const PAGE_CHROME_CSS = `
  .apdf-pg-layer { position: absolute; pointer-events: none; box-sizing: border-box; }
  .apdf-pg-fill { inset: 0; }
  .apdf-pg-bg { background-position: center; }
  .apdf-pg-banner { background-size: cover; background-position: center; background-repeat: no-repeat; }
  .apdf-pg-header {
    position: absolute; display: flex; align-items: flex-end; padding-bottom: 3px;
    border-bottom: 0.4pt solid #000; font-style: italic; white-space: nowrap;
  }
  .mpdf-doc.apdf-pg-content { position: absolute; }
  .apdf-pg-footer { position: absolute; left: 0; right: 0; display: flex; align-items: center; }
  .apdf-pg-footer-rule { border-top: 0.4pt solid #000; }
`;

function appendHFNodes(container: HTMLElement, center: string, left: string, right: string): void {
  if (!center && !left && !right) return;
  if (center) {
    container.createSpan({ cls: "mpdf-hf-center", text: center });
  } else {
    container.createSpan({ text: left });
    container.createSpan({ cls: "mpdf-hf-right", text: right });
  }
}

export class PageCanvas {
  readonly el: HTMLElement;
  private pages: DrawnPage[] = [];
  private sheet: CSSStyleSheet | null = null;
  private sheetCSS = "";
  private layout: DocumentLayout | null = null;
  private zoom: ZoomMode;
  private scale = 1;
  private resizeObserver: ResizeObserver;
  private idToPage = new Map<string, number>();
  decorate: PageDecorator | null = null;

  constructor(
    parent: HTMLElement, private app: App, private getSettings: () => PDFExportSettings,
    zoom: ZoomMode, cls: string,
  ) {
    this.el = parent.createDiv({ cls: `apdf-canvas ${cls}` });
    this.zoom = zoom;
    this.resizeObserver = new ResizeObserver(() => this.applyScale());
    this.resizeObserver.observe(this.el);
    // In-document links: resolved at click time, so pages that were not
    // redrawn still point at the right page.
    this.el.addEventListener("click", (e) => {
      const a = (e.composedPath()[0] as HTMLElement | undefined)?.closest?.("a[href^='#']");
      if (!a) return;
      const id = decodeURIComponent((a.getAttribute("href") ?? "").slice(1));
      const page = this.idToPage.get(id);
      if (page === undefined) return;
      e.preventDefault();
      this.scrollToPage(page);
    });
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    this.el.remove();
  }

  get pageCount(): number {
    return this.pages.length;
  }

  getZoom(): ZoomMode {
    return this.zoom;
  }

  setZoom(z: ZoomMode): void {
    this.zoom = z;
    this.applyScale();
  }

  /** Steps a fixed percentage up or down from the current effective scale. */
  stepZoom(dir: 1 | -1): void {
    const cur = this.scale;
    const next = dir > 0
      ? ZOOM_STEPS.find((z) => z > cur + 0.01) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
      : [...ZOOM_STEPS].reverse().find((z) => z < cur - 0.01) ?? ZOOM_STEPS[0];
    this.setZoom(next);
  }

  scrollToPage(index: number): void {
    this.pages[index]?.wrap.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  clear(): void {
    for (const p of this.pages) p.wrap.remove();
    this.pages = [];
    this.layout = null;
  }

  /** Draws `layout`, rebuilding only the pages whose content changed. */
  draw(layout: DocumentLayout): void {
    const s = this.getSettings();
    this.layout = layout;
    this.el.toggleClass("is-two-up", this.zoom === "fit-2");

    const shadowCSS = `
      :host {
        display: block;
        width: ${layout.pw}px;
        height: ${layout.ph}px;
        background: ${layout.pageBackground};
        overflow: hidden;
        position: relative;
        box-sizing: border-box;
      }
      *, *::before, *::after { box-sizing: border-box; }
      .mpdf-hf-center { flex: 1; text-align: center; }
      .mpdf-hf-right { margin-left: auto; }
      ${layout.docCSS}
      ${PAGE_CHROME_CSS}
    `;
    // Constructed sheets belong to one document: this canvas's own window,
    // not the active one (Settings opens in a window of its own).
    if (!this.sheet) this.sheet = new (this.el.win as unknown as typeof window).CSSStyleSheet();
    if (shadowCSS !== this.sheetCSS) {
      // Adopted sheets update live: unchanged pages restyle in place.
      this.sheet.replaceSync(shadowCSS);
      this.sheetCSS = shadowCSS;
    }

    // Everything outside the page content that changes how a page looks.
    const common = JSON.stringify([
      layout.pw, layout.ph, layout.mTop, layout.mLeft, layout.mRight, layout.headerH, layout.footerH,
      layout.contentW, layout.contentH, layout.isRTL, s,
    ]);

    this.idToPage.clear();
    layout.layouts.forEach((page, i) => {
      for (const node of page.pageNodes) {
        if (node.id && !this.idToPage.has(node.id)) this.idToPage.set(node.id, i);
        node.querySelectorAll("[id]").forEach((el) => {
          if (!this.idToPage.has(el.id)) this.idToPage.set(el.id, i);
        });
      }
      const sig = hash(common + "\u0001" + [
        page.pageNum, page.totalPages, page.hasHeader, page.hasFooter, page.pageShowsHeader, page.pageShowsFooter,
        page.headerLeft, page.headerCenter, page.headerRight, page.footerLeft, page.footerCenter, page.footerRight,
      ].join("\u0002") + "\u0001" + page.pageNodes.map((n) => n.outerHTML).join("\u0003"));
      const old = this.pages[i];
      if (old && old.sig === sig) return;
      const built = this.buildPage(layout, i, s);
      built.sig = sig;
      if (old) old.wrap.replaceWith(built.wrap);
      else this.el.appendChild(built.wrap);
      this.pages[i] = built;
    });
    for (const extra of this.pages.splice(layout.layouts.length)) extra.wrap.remove();
    this.applyScale();
    // Overlays depend on the whole layout (which page a break starts), so
    // they are redone on every page, rebuilt or not.
    this.redecorate();
  }

  /** Re-runs the decorator on every drawn page (e.g. after an affordance
   *  state change), without rebuilding them. */
  redecorate(): void {
    if (!this.decorate) return;
    this.pages.forEach((p, i) => {
      const shadow = p.host.shadowRoot;
      const content = shadow?.querySelector<HTMLElement>(".mpdf-doc");
      if (shadow && content) this.decorate?.(i, content, shadow, p.wrap);
    });
  }

  private applyScale(): void {
    if (!this.layout) return;
    const { pw, ph } = this.layout;
    const style = getComputedStyle(this.el);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const w = Math.max(50, this.el.clientWidth - padX);
    const h = Math.max(50, this.el.clientHeight - padY);
    let scale: number;
    if (this.zoom === "fit-width") scale = w / pw;
    else if (this.zoom === "fit-page") scale = Math.min(w / pw, h / ph);
    // 2 px of slack: the rounded page widths must not wrap the second page.
    else if (this.zoom === "fit-2") scale = Math.min((w - PAGE_GAP - 2) / (2 * pw), h / ph);
    else scale = this.zoom;
    scale = Math.max(0.1, Math.min(3, scale));
    this.scale = scale;
    this.el.toggleClass("is-two-up", this.zoom === "fit-2");
    const sw = `${Math.floor(pw * scale)}px`;
    const sh = `${Math.round(ph * scale)}px`;
    for (const p of this.pages) {
      p.wrap.setCssStyles({ width: sw, height: sh });
      p.wrap.setCssProps({ "--apdf-zoom": String(scale) });
      p.host.setCssStyles({ transform: `scale(${scale})` });
    }
  }

  private buildPage(c: DocumentLayout, index: number, s: PDFExportSettings): DrawnPage {
    // `index` names the page in the wrap's data, for tests and debugging.
    const layout = c.layouts[index];
    const { pw, ph, mTop, mLeft, mRight, footerH, headerH, contentW, contentH, fontFamily, isRTL } = c;
    const { headerTop, footerTop } = bandTops(ph, mTop, contentH, headerH, footerH);

    const wrap = createDiv({ cls: "apdf-page" });
    wrap.dataset.page = String(index);
    const host = wrap.createDiv({ cls: "mpdf-shadow-host" });
    host.setCssStyles({ width: `${pw}px`, height: `${ph}px` });
    const shadow = host.attachShadow({ mode: "open" });
    if (this.sheet) shadow.adoptedStyleSheets = [this.sheet];

    // Page background image (first, behind everything).
    if (s.backgroundImageEnabled && s.backgroundImagePath) {
      const bgUrl = resolveImageUrl(this.app, s.backgroundImagePath);
      if (bgUrl) {
        const isContentOnly = s.backgroundImageScope === "content-only";
        const bgEl = createDiv({ cls: isContentOnly ? "apdf-pg-layer apdf-pg-bg" : "apdf-pg-layer apdf-pg-bg apdf-pg-fill" });
        const bgCss = bgImageCssProps(s.backgroundImageSize);
        bgEl.setCssStyles({
          ...(isContentOnly
            ? { top: `${mTop}px`, left: `${mLeft}px`, width: `${contentW}px`, height: `${contentH}px` }
            : {}),
          backgroundImage: `url('${bgUrl}')`,
          backgroundRepeat: bgCss.repeat,
          backgroundSize: bgCss.size,
          opacity: String(s.backgroundImageOpacity),
        });
        shadow.appendChild(bgEl);
      }
    }

    // Header banner image (behind header text).
    if (layout.pageShowsHeader && s.showHeader && s.headerImagePath) {
      const imgUrl = resolveImageUrl(this.app, s.headerImagePath);
      if (imgUrl) {
        const bannerEl = createDiv({ cls: "apdf-pg-layer apdf-pg-banner" });
        bannerEl.setCssStyles({
          top: `${headerTop}px`,
          left: `${s.headerImageMargin}px`, right: `${s.headerImageMargin}px`, height: `${headerH}px`,
          backgroundImage: `url('${imgUrl}')`,
        });
        shadow.appendChild(bannerEl);
      }
    }

    if (layout.hasHeader) {
      const hdr = createDiv({ cls: "apdf-pg-header" });
      hdr.setCssStyles({
        top: `${headerTop}px`, left: `${mLeft}px`, right: `${mRight}px`, height: `${headerH}px`,
        fontSize: `${s.headerFontSize}px`, color: s.headerFontColor, fontFamily,
      });
      appendHFNodes(hdr, layout.headerCenter, layout.headerLeft, layout.headerRight);
      shadow.appendChild(hdr);
    }

    // Content. No height or overflow here: :host clips at the page edge (a
    // second clip cut bottom lines through sub-pixel rounding).
    const contentDiv = createDiv({ cls: "mpdf-doc apdf-pg-content" });
    if (isRTL) contentDiv.setAttribute("dir", "rtl");
    contentDiv.setCssStyles({ top: `${mTop}px`, left: `${mLeft}px`, width: `${contentW}px` });
    for (const node of layout.pageNodes) contentDiv.appendChild(node.cloneNode(true));
    shadow.appendChild(contentDiv);

    if (layout.pageShowsFooter && s.showFooter && s.footerImagePath) {
      const imgUrl = resolveImageUrl(this.app, s.footerImagePath);
      if (imgUrl) {
        const bannerEl = createDiv({ cls: "apdf-pg-layer apdf-pg-banner" });
        bannerEl.setCssStyles({
          top: `${footerTop}px`,
          left: `${s.footerImageMargin}px`, right: `${s.footerImageMargin}px`, height: `${footerH}px`,
          backgroundImage: `url('${imgUrl}')`,
        });
        shadow.appendChild(bannerEl);
      }
    }

    if (layout.hasFooter) {
      const footer = createDiv({ cls: s.showFooterBorder ? "apdf-pg-footer apdf-pg-footer-rule" : "apdf-pg-footer" });
      footer.setCssStyles({
        top: `${footerTop}px`, height: `${footerH}px`,
        padding: `0 ${mRight}px 0 ${mLeft}px`, fontSize: `${s.footerFontSize}px`, color: s.footerFontColor, fontFamily,
      });
      appendHFNodes(footer, layout.footerCenter, layout.footerLeft, layout.footerRight);
      shadow.appendChild(footer);
    }

    // Frame last, on top of everything.
    if (s.frameEnabled) {
      const inset = `${s.frameMargin}px`;
      const frame = createDiv({ cls: "apdf-pg-layer" });
      frame.setCssStyles({ top: inset, left: inset, right: inset, bottom: inset, border: frameBorderCSS(s) });
      shadow.appendChild(frame);
    }

    return { sig: "", wrap, host };
  }
}
