// ─────────────────────────────────────────────────────────────────────────────
// \ref{label}: pass two of F4. Pure DOM, no Obsidian: it takes the label map
// built by the pre-scan (scan.ts) and rewrites the text nodes of a rendered
// tree. The same function serves the export (one pass over every section,
// after rendering, so forward references and references inside boxes work),
// the reading view and the box bodies in live preview.
// ─────────────────────────────────────────────────────────────────────────────

import type { LabelInfo } from "./scan";

export const REF_PATTERN = "\\\\ref\\{([^}\\s]+)\\}";

/** A `\ref{…}` found in a string. */
export interface RefMatch { start: number; end: number; label: string }

export function findRefs(text: string): RefMatch[] {
  const out: RefMatch[] = [];
  for (const m of text.matchAll(new RegExp(REF_PATTERN, "g"))) {
    out.push({ start: m.index, end: m.index + m[0].length, label: m[1] });
  }
  return out;
}

/** What `\ref{label}` shows: the number, or `??` when the label is unknown. */
export function refText(label: string, labels: ReadonlyMap<string, LabelInfo>): string {
  const info = labels.get(label);
  return info ? String(info.number) : "??";
}

// Parts of a rendered tree where `\ref` is literal text, not a reference.
const SKIP = "code, pre, script, style, .math, mjx-container, .apdf-ref, .cm-inline-code";

function refSpan(label: string, labels: ReadonlyMap<string, LabelInfo>): HTMLElement {
  const span = createSpan();
  const info = labels.get(label);
  span.className = info ? "apdf-ref" : "apdf-ref apdf-ref--missing";
  span.textContent = refText(label, labels);
  if (!info) span.setAttribute("title", `Label not found: ${label}`);
  else span.setAttribute("data-apdf-ref", label);
  return span;
}

/** Replaces every `\ref{label}` in the text nodes under `root`. Returns how
 *  many references were rewritten. Safe to call twice on the same tree. */
export function resolveRefs(root: ParentNode, labels: ReadonlyMap<string, LabelInfo>): number {
  const doc = (root as Node).ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    if (!t.data.includes("\\ref{")) continue;
    if (t.parentElement?.closest(SKIP)) continue;
    nodes.push(t);
  }
  let count = 0;
  for (const node of nodes) {
    const refs = findRefs(node.data);
    if (!refs.length) continue;
    const frag = doc.createDocumentFragment();
    let last = 0;
    for (const r of refs) {
      if (r.start > last) frag.append(node.data.slice(last, r.start));
      frag.append(refSpan(r.label, labels));
      last = r.end;
      count++;
    }
    if (last < node.data.length) frag.append(node.data.slice(last));
    node.replaceWith(frag);
  }
  return count;
}
