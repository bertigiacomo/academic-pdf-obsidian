// ─────────────────────────────────────────────────────────────────────────────
// Page breaks from the PDF (export modal only).
//  - Put: hovering the gap between two blocks shows a dashed line and the
//    pill "New page here", and outlines the next block; a click writes
//    `%% page break %%` into the note before that block.
//  - Take away: a page started by a manual break shows "Page break ×" at the
//    top; the × removes the line from the note. Automatic breaks ("New page
//    for each section") show a label without ×.
// Writing goes through an editor transaction when the note is open (so Cmd/
// Ctrl+Z undoes it), through vault.process otherwise; and only when the note
// still holds the text the pages were made from.
// ─────────────────────────────────────────────────────────────────────────────

import { App, Notice, TFile, setIcon } from "obsidian";
import { hasBreakAbove, pageBreakInsertion } from "./block-map";
import { findMarkdownView, readNote } from "./note-source";
import { PAGE_BREAK_LINE, findPageBreakLines, removePageBreak } from "./page-breaks";
import type { PageCanvas } from "./page-view";
import type { DocumentLayout } from "./pipeline";

const AFFORDANCE_CSS = `
  .apdf-pb-layer { position: absolute; inset: 0; pointer-events: none; font-family: var(--font-interface, system-ui, sans-serif); }
  .apdf-pb-gap { position: absolute; left: 0; right: 0; height: 0; display: none; }
  .apdf-pb-gap.is-active { display: block; }
  .apdf-pb-gap::before {
    content: ""; position: absolute; left: 0; right: 0; top: 0;
    border-top: calc(2px / var(--apdf-zoom, 1)) dashed var(--interactive-accent, #7c3aed);
  }
  .apdf-pb-pill, .apdf-pb-mark {
    position: absolute; left: 50%; top: 0; transform: translate(-50%, -50%); white-space: nowrap;
    display: inline-flex; align-items: center; gap: calc(6px / var(--apdf-zoom, 1));
    font-size: calc(12px / var(--apdf-zoom, 1)); font-weight: 500; line-height: 1;
    padding: calc(5px / var(--apdf-zoom, 1)) calc(10px / var(--apdf-zoom, 1));
    border-radius: calc(99px / var(--apdf-zoom, 1));
    box-shadow: 0 calc(1px / var(--apdf-zoom, 1)) calc(4px / var(--apdf-zoom, 1)) rgba(0, 0, 0, 0.18);
  }
  .apdf-pb-top { position: absolute; left: 0; right: 0; height: 0; top: calc(18px / var(--apdf-zoom, 1)); }
  .apdf-pb-pill { background: var(--interactive-accent, #7c3aed); color: #fff; }
  .apdf-pb-mark { background: #fff; color: #444; border: calc(1px / var(--apdf-zoom, 1)) solid #d6d6d6; pointer-events: auto; }
  .apdf-pb-mark.mod-auto { color: #777; }
  .apdf-pb-x { display: inline-flex; color: #999; cursor: pointer; margin-left: calc(2px / var(--apdf-zoom, 1)); }
  .apdf-pb-x:hover { color: #000; }
  .apdf-pb-pill svg, .apdf-pb-mark svg {
    width: calc(14px / var(--apdf-zoom, 1)); height: calc(14px / var(--apdf-zoom, 1));
    stroke-width: calc(2px / var(--apdf-zoom, 1));
  }
  .apdf-pb-target {
    outline: calc(2px / var(--apdf-zoom, 1)) solid color-mix(in oklab, var(--interactive-accent, #7c3aed) 35%, transparent);
    outline-offset: calc(6px / var(--apdf-zoom, 1)); border-radius: 2px;
  }
`;

interface Gap {
  node: HTMLElement;
  prev: HTMLElement;
  line: number;
}

interface PageState {
  shadow: ShadowRoot;
  content: HTMLElement;
  gapEl: HTMLElement;
  gaps: Gap[];
  active: Gap | null;
}

export class PageBreakAffordance {
  private sheet: CSSStyleSheet | null = null;
  private pages = new WeakMap<HTMLElement, PageState>();
  private busy = false;

  constructor(
    private app: App,
    private getFile: () => TFile | null,
    private getLayout: () => DocumentLayout | null,
    /** Called after the note was changed, to re-render. */
    private onChanged: () => void,
  ) {}

  attach(canvas: PageCanvas): void {
    canvas.decorate = (index, content, shadow, wrap) => this.decorate(index, content, shadow, wrap);
  }

  private decorate(index: number, content: HTMLElement, shadow: ShadowRoot, wrap: HTMLElement): void {
    const layout = this.getLayout();
    if (!layout) return;
    if (!this.sheet) {
      // Constructed sheets belong to one document: the page's own window.
      this.sheet = new (wrap.win as unknown as typeof window).CSSStyleSheet();
      this.sheet.replaceSync(AFFORDANCE_CSS);
    }
    if (!shadow.adoptedStyleSheets.includes(this.sheet)) {
      shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, this.sheet];
    }
    shadow.querySelector(".apdf-pb-layer")?.remove();
    content.querySelectorAll(".apdf-pb-target").forEach((el) => el.removeClass("apdf-pb-target"));

    const layer = createDiv({ cls: "apdf-pb-layer" });
    shadow.appendChild(layer);

    // Label at the top of a page that a break started.
    const section = layout.sections.find((sec) => sec.firstPage === index && sec.start);
    if (section?.start) {
      const mark = layer.createDiv({ cls: "apdf-pb-top" }).createDiv({ cls: "apdf-pb-mark" });
      setIcon(mark.createSpan(), "separator-horizontal");
      if (section.start.kind === "manual") {
        mark.createSpan({ text: "Page break" });
        const x = mark.createSpan({ cls: "apdf-pb-x", attr: { "aria-label": "Remove page break" } });
        setIcon(x, "x");
        const breakIndex = section.start.index;
        x.addEventListener("click", (e) => {
          e.stopPropagation();
          void this.remove(breakIndex);
        });
      } else {
        mark.addClass("mod-auto");
        mark.createSpan({ text: "Page break" });
        mark.setAttr("title", "From \"New page for each section\"");
      }
    }

    // Gaps where a break can go: before a block that starts here (not a
    // fragment carried over from the previous page), never before the first
    // block of a page.
    const gaps: Gap[] = [];
    const nodes = Array.from(content.children) as HTMLElement[];
    for (let k = 1; k < nodes.length; k++) {
      const g = nodes[k].dataset.apdfBlock;
      if (g === undefined || g === nodes[k - 1].dataset.apdfBlock) continue;
      const line = layout.blockLines[Number(g)];
      if (line === null || line === undefined) continue;
      gaps.push({ node: nodes[k], prev: nodes[k - 1], line });
    }
    const gapEl = layer.createDiv({ cls: "apdf-pb-gap" });
    const pill = gapEl.createDiv({ cls: "apdf-pb-pill" });
    setIcon(pill.createSpan(), "separator-horizontal");
    pill.createSpan({ text: "New page here" });

    const first = !this.pages.has(wrap);
    this.pages.set(wrap, { shadow, content, gapEl, gaps, active: null });
    if (first) {
      wrap.addEventListener("mousemove", (e) => this.hover(wrap, e));
      wrap.addEventListener("mouseleave", () => this.setActive(wrap, null));
      wrap.addEventListener("click", (e) => {
        const st = this.pages.get(wrap);
        if (!st?.active) return;
        e.preventDefault();
        void this.insert(st.active.line);
      });
    }
  }

  private hover(wrap: HTMLElement, e: MouseEvent): void {
    const st = this.pages.get(wrap);
    if (!st || this.busy) return;
    let best: Gap | null = null;
    let bestDist = 10; // client px
    for (const gap of st.gaps) {
      const y = (gap.prev.getBoundingClientRect().bottom + gap.node.getBoundingClientRect().top) / 2;
      const d = Math.abs(e.clientY - y);
      if (d < bestDist) { best = gap; bestDist = d; }
    }
    this.setActive(wrap, best);
  }

  private setActive(wrap: HTMLElement, gap: Gap | null): void {
    const st = this.pages.get(wrap);
    if (!st || st.active === gap) return;
    st.active?.node.removeClass("apdf-pb-target");
    st.active = gap;
    st.gapEl.toggleClass("is-active", !!gap);
    wrap.toggleClass("is-pb-hover", !!gap);
    if (!gap) return;
    gap.node.addClass("apdf-pb-target");
    const hostRect = (st.shadow.host as HTMLElement).getBoundingClientRect();
    const layout = this.getLayout();
    const scale = layout ? hostRect.width / layout.pw : 1;
    const y = (gap.prev.getBoundingClientRect().bottom + gap.node.getBoundingClientRect().top) / 2;
    st.gapEl.setCssStyles({ top: `${(y - hostRect.top) / scale}px` });
  }

  /** The note text, only if it is still the text the pages show. */
  private async currentText(): Promise<{ file: TFile; text: string } | null> {
    const file = this.getFile();
    const layout = this.getLayout();
    if (!file || !layout) return null;
    const text = await readNote(this.app, file);
    if (text !== layout.sourceText) {
      new Notice("The note changed: the pages are being updated.");
      this.onChanged();
      return null;
    }
    return { file, text };
  }

  private async insert(line: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const cur = await this.currentText();
      if (!cur) return;
      const isBreak = (l: string) => findPageBreakLines(l).length === 1;
      if (hasBreakAbove(cur.text, line, isBreak)) return;
      const insertion = pageBreakInsertion(cur.text, line, PAGE_BREAK_LINE);
      await this.edit(cur.file, cur.text, line, line, 0, insertion);
    } finally {
      this.busy = false;
    }
  }

  private async remove(index: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const cur = await this.currentText();
      if (!cur) return;
      const range = removePageBreak(cur.text, index);
      if (!range) return;
      const lines = cur.text.split("\n");
      // Remove whole lines [from, to]: up to the start of the next line, or
      // from the end of the previous one when `to` is the last line.
      if (range.to + 1 < lines.length) {
        await this.edit(cur.file, cur.text, range.from, range.to + 1, 0, "");
      } else if (range.from > 0) {
        await this.editRange(cur.file, cur.text,
          { line: range.from - 1, ch: lines[range.from - 1].length },
          { line: range.to, ch: lines[range.to].length }, "");
      } else {
        await this.editRange(cur.file, cur.text, { line: 0, ch: 0 }, { line: range.to, ch: lines[range.to].length }, "");
      }
    } finally {
      this.busy = false;
    }
  }

  private edit(file: TFile, text: string, fromLine: number, toLine: number, ch: number, insert: string): Promise<void> {
    return this.editRange(file, text, { line: fromLine, ch }, { line: toLine, ch }, insert);
  }

  private async editRange(
    file: TFile, text: string,
    from: { line: number; ch: number }, to: { line: number; ch: number }, insert: string,
  ): Promise<void> {
    const view = findMarkdownView(this.app, file);
    if (view) {
      // An editor transaction: the change joins the note's undo history.
      view.editor.replaceRange(insert, from, to);
    } else {
      const offset = (pos: { line: number; ch: number }) => {
        const lines = text.split("\n");
        let o = 0;
        for (let i = 0; i < pos.line; i++) o += lines[i].length + 1;
        return o + pos.ch;
      };
      let changed = true;
      await this.app.vault.process(file, (data) => {
        if (data !== text) { changed = false; return data; }
        return data.slice(0, offset(from)) + insert + data.slice(offset(to));
      });
      if (!changed) new Notice("The note changed: the pages are being updated.");
    }
    this.onChanged();
  }
}
