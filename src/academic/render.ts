// ─────────────────────────────────────────────────────────────────────────────
// Academic blocks: DOM construction. The class names are styled by the
// single stylesheet blocks.css. No innerHTML, no inline styles.
// ─────────────────────────────────────────────────────────────────────────────

import {
  App, Component, MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownRenderer,
  finishRenderMath, renderMath,
} from "obsidian";
import {
  AlgorithmSpec, BlockKind, MarkdownBlockSpec, TheoremKind, kindLabel,
  mathSignatureArgs, tokenizeStatement,
} from "./blocks-parse";
import { resolveRefs } from "./refs";
import type { LabelInfo } from "./scan";

export interface RenderEnv {
  app: App;
  ctx: MarkdownPostProcessorContext;
  /** Block-level container the output goes into (the fence's element). */
  el: HTMLElement;
  /** Label map for resolving `\ref` inside the block; null when the block's
   *  document is unknown (the export resolves them in its final pass). */
  labels: ReadonlyMap<string, LabelInfo> | null;
  /** Transforms a markdown body before rendering (nested numbers). */
  prepareBody?: (content: string) => string;
}

/** A child component bound to the block, released with it. */
function childOf(env: RenderEnv, host: HTMLElement): Component {
  const child = new MarkdownRenderChild(host);
  env.ctx.addChild(child);
  return child;
}

const MATH_TIMEOUT_MS = 3000;

async function settleMath(): Promise<void> {
  let timer = 0;
  try {
    await Promise.race([
      finishRenderMath(),
      new Promise<void>((resolve) => { timer = window.setTimeout(resolve, MATH_TIMEOUT_MS); }),
    ]);
  } catch { /* non-fatal: the export waits for math again */ } finally {
    window.clearTimeout(timer);
  }
}

function appendMath(parent: HTMLElement, src: string): void {
  try {
    parent.appendChild(renderMath(src, false));
  } catch {
    parent.appendText(`$${src}$`);
  }
}

/** Plain text, bold keywords and `$…$` maths inside `parent`. */
function appendStatement(parent: HTMLElement, text: string, highlight: boolean): void {
  for (const piece of tokenizeStatement(text, highlight)) {
    if (piece.kind === "math") appendMath(parent, piece.value);
    else if (piece.kind === "keyword") parent.createSpan({ cls: "apdf-k", text: piece.value });
    else parent.appendText(piece.value);
  }
}

// ─── Algorithm ──────────────────────────────────────────────────────────────

export async function renderAlgorithm(env: RenderEnv, spec: AlgorithmSpec, number: number | null): Promise<HTMLElement> {
  const mono = spec.font === "mono";
  const fig = env.el.createEl("figure", {
    cls: `apdf-block apdf-algo apdf-algo--${spec.font}`,
  });

  const caption = fig.createEl("figcaption", { cls: "apdf-algo-caption" });
  caption.createEl("b", { text: number !== null ? `Algorithm ${number}:` : "Algorithm:" });
  caption.appendText(" ");
  const sig = caption.createSpan({ cls: "apdf-sig" });
  sig.createSpan({ cls: "apdf-algo-name", text: spec.name });
  if (spec.args) {
    sig.appendText("(");
    appendStatement(sig, mono ? spec.args : mathSignatureArgs(spec.args), false);
    sig.appendText(")");
  }

  if (spec.io.length) {
    const dl = fig.createEl("dl", { cls: "apdf-algo-io" });
    for (const row of spec.io) {
      dl.createEl("dt", { text: `${row.label}:` });
      appendStatement(dl.createEl("dd"), row.text, false);
    }
  }

  const ol = fig.createEl("ol", { cls: "apdf-algo-body" });
  for (const line of spec.body) {
    const depth = Math.min(line.depth, 4);
    const li = ol.createEl("li", depth > 0 ? { cls: `d${depth}` } : {});
    const l = li.createSpan({ cls: "apdf-l" });
    appendStatement(l.createSpan({ cls: "apdf-s" }), line.text, true);
    if (line.comment) appendStatement(l.createSpan({ cls: "apdf-c" }), line.comment, false);
  }

  await settleMath();
  return fig;
}

// ─── Inline markdown (titles) ───────────────────────────────────────────────

/** Renders a one-line piece of Markdown (a title) as inline content. */
async function renderInline(env: RenderEnv, text: string, into: HTMLElement, owner: Component): Promise<void> {
  const tmp = createDiv();
  await MarkdownRenderer.render(env.app, text, tmp, env.ctx.sourcePath, owner);
  const p = tmp.querySelector("p");
  const src = p ?? tmp;
  while (src.firstChild) into.appendChild(src.firstChild);
}

// ─── Theorem family ─────────────────────────────────────────────────────────

const THEOREM_STYLE: Record<TheoremKind, "plain" | "definition" | "remark" | "proof"> = {
  theorem: "plain", lemma: "plain", corollary: "plain",
  definition: "definition", remark: "remark", proof: "proof",
};

export async function renderTheorem(
  env: RenderEnv, kind: TheoremKind, spec: MarkdownBlockSpec, number: number | null,
): Promise<HTMLElement> {
  const style = THEOREM_STYLE[kind];
  const block = env.el.createDiv({
    cls: style === "proof"
      ? "apdf-block apdf-thm apdf-proof"
      : `apdf-block apdf-thm apdf-thm--${style}`,
  });
  const owner = childOf(env, block);
  const content = env.prepareBody ? env.prepareBody(spec.content) : spec.content;
  await MarkdownRenderer.render(env.app, content, block, env.ctx.sourcePath, owner);

  // Run-in head: "Theorem 1 (Note)." at the start of the first paragraph.
  const head = createSpan({ cls: "apdf-thm-head" });
  head.appendText(number !== null ? `${kindLabel(kind)} ${number}` : kindLabel(kind));
  if (spec.title) {
    head.appendText(" ");
    const note = head.createSpan({ cls: "apdf-thm-note" });
    note.appendText("(");
    await renderInline(env, spec.title, note, owner);
    note.appendText(")");
  }
  head.appendText(".");

  let first = block.querySelector(":scope > p");
  if (!first) {
    first = createEl("p");
    block.prepend(first);
  }
  first.prepend(head);

  if (style === "proof") {
    const last = [...block.querySelectorAll(":scope > p")].pop() ?? first;
    last.createSpan({ cls: "apdf-qed", attr: { "aria-label": "End of proof" } });
  }

  if (env.labels) resolveRefs(block, env.labels);
  return block;
}

// ─── Boxes ──────────────────────────────────────────────────────────────────

export async function renderBox(
  env: RenderEnv, kind: BlockKind, spec: MarkdownBlockSpec,
): Promise<HTMLElement> {
  const box = env.el.createDiv({ cls: `apdf-block apdf-box apdf-box--${kind.slice(4)}` });
  const owner = childOf(env, box);
  if (spec.title) {
    const title = box.createSpan({ cls: "apdf-box-title" });
    await renderInline(env, spec.title, title, owner);
  }
  const content = env.prepareBody ? env.prepareBody(spec.content) : spec.content;
  await MarkdownRenderer.render(env.app, content, box, env.ctx.sourcePath, owner);
  if (env.labels) resolveRefs(box, env.labels);
  return box;
}
