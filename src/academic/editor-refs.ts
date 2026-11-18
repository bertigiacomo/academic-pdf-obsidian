// ─────────────────────────────────────────────────────────────────────────────
// \ref{label} in live preview. Markdown post-processors only run in reading
// view; in the editor only code-block processors run, so a \ref in a normal
// paragraph would stay raw text. This CodeMirror extension replaces it with
// the resolved number (or ??) while the cursor is elsewhere, using the same
// pre-scan as the blocks. Source mode and the text under the cursor are left
// untouched; fenced code, inline code and maths are skipped.
// ─────────────────────────────────────────────────────────────────────────────

import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType,
} from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";
import { findRefs, refText } from "./refs";
import { LabelInfo, ScanOptions, fencedLines, scanDocument } from "./scan";

class RefWidget extends WidgetType {
  constructor(private label: string, private text: string, private known: boolean) { super(); }
  eq(other: RefWidget): boolean {
    return other.label === this.label && other.text === this.text && other.known === this.known;
  }
  toDOM(): HTMLElement {
    const span = createSpan({
      cls: this.known ? "apdf-ref" : "apdf-ref apdf-ref--missing",
      text: this.text,
    });
    if (!this.known) span.setAttribute("title", `Label not found: ${this.label}`);
    return span;
  }
  ignoreEvent(): boolean { return false; }
}

/** Number of occurrences of `ch` in `s` not preceded by a backslash. */
function unescapedCount(s: string, ch: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === ch) n++;
  }
  return n;
}

export function refsExtension(getOptions: () => ScanOptions) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet = Decoration.none;
    private text = "";
    private labels: Map<string, LabelInfo> = new Map();
    private fenced: boolean[] = [];
    private key = "";

    constructor(view: EditorView) { this.decorations = this.build(view); }

    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged) {
        this.decorations = this.build(u.view);
      }
    }

    private refresh(view: EditorView): void {
      const opts = getOptions();
      const key = `${opts.numberAlgorithms}${opts.numberTheorems}`;
      const text = view.state.doc.toString();
      if (text === this.text && key === this.key) return;
      this.text = text;
      this.key = key;
      this.labels = scanDocument(text, opts).labels;
      this.fenced = fencedLines(text);
    }

    private build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      if (!view.state.field(editorLivePreviewField, false)) return builder.finish();
      this.refresh(view);
      const sel = view.state.selection.ranges;
      let lastLine = -1;
      for (const range of view.visibleRanges) {
        let pos = range.from;
        while (pos <= range.to) {
          const line = view.state.doc.lineAt(pos);
          pos = line.to + 1;
          if (line.number === lastLine) continue;
          lastLine = line.number;
          if (this.fenced[line.number - 1] || !line.text.includes("\\ref{")) continue;
          for (const r of findRefs(line.text)) {
            const before = line.text.slice(0, r.start);
            if (unescapedCount(before, "`") % 2 || unescapedCount(before, "$") % 2) continue;
            const from = line.from + r.start;
            const to = line.from + r.end;
            if (sel.some((s) => s.from <= to && s.to >= from)) continue;
            const known = this.labels.has(r.label);
            builder.add(from, to, Decoration.replace({
              widget: new RefWidget(r.label, refText(r.label, this.labels), known),
            }));
          }
        }
      }
      return builder.finish();
    }
  }, { decorations: (v) => v.decorations });
}
