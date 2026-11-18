// ─────────────────────────────────────────────────────────────────────────────
// Registration of everything F3/F4 adds to Obsidian: the block processors,
// the \ref resolvers (reading view and live preview), the insert command and
// the live-preview styles. One call from main.ts: registerAcademic(plugin).
// ─────────────────────────────────────────────────────────────────────────────

import {
  App, Editor, MarkdownPostProcessorContext, Notice, SuggestModal,
} from "obsidian";
import type MarkdownPDFPlugin from "../main";
import {
  ALL_BLOCK_KINDS, BlockKind, isTheoremKind, parseAlgorithm,
  parseHeader, parseMarkdownBlock,
} from "./blocks-parse";
import { refsExtension } from "./editor-refs";
import { applyLiveStyles, clearLiveStyles } from "./live";
import { resolveRefs } from "./refs";
import { RenderEnv, renderAlgorithm, renderBox, renderTheorem } from "./render";
import {
  ScanOptions, ScanResult, annotateNumbers, cachedScan, forgetScans, numberAt,
} from "./scan";

function scanOptions(plugin: MarkdownPDFPlugin): ScanOptions {
  const s = plugin.settings;
  return { numberAlgorithms: s.numberAlgorithms, numberTheorems: s.numberTheorems };
}

/** Where a block sits in its note, when Obsidian can tell. Null for embedded
 *  notes, hover previews, canvas cards and the export, which has no section
 *  info: such a block shows no number rather than a wrong one. */
function locate(plugin: MarkdownPDFPlugin, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
  const info = ctx.getSectionInfo(el);
  if (!info) return null;
  const scan = cachedScan(ctx.sourcePath, info.text, scanOptions(plugin));
  return { scan, line: info.lineStart };
}

function registerBlock(plugin: MarkdownPDFPlugin, kind: BlockKind): void {
  plugin.registerMarkdownCodeBlockProcessor(
    kind,
    async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      const header = parseHeader(source.split("\n"));
      // A number already in the source was put there by the export's
      // pre-scan (or by a box handing numbers to the blocks inside it).
      let number = header.number;
      let scan: ScanResult | null = null;
      let line = -1;
      if (number === null) {
        const where = locate(plugin, el, ctx);
        if (where) {
          scan = where.scan;
          number = numberAt(where.scan, where.line);
          line = where.line;
        }
      }

      const isBox = kind.startsWith("box-");
      const host = isBox ? el : el.createDiv({ cls: "apdf-sheet" });
      const env: RenderEnv = {
        app: plugin.app, ctx, el: host,
        labels: scan ? scan.labels : null,
        // Blocks inside this one are numbered from the same scan.
        prepareBody: scan && line >= 0
          ? (content) => annotateNumbers(content, scan, line + 1 + header.bodyStart)
          : undefined,
      };

      if (kind === "algorithm") {
        const spec = parseAlgorithm(source);
        if (!spec) return;
        const block = await renderAlgorithm(env, spec, number);
        if (env.labels) resolveRefs(block, env.labels);
      } else if (isTheoremKind(kind)) {
        await renderTheorem(env, kind, parseMarkdownBlock(source), number);
      } else {
        await renderBox(env, kind, parseMarkdownBlock(source));
      }
    },
  );
}

// ─── Insert command ─────────────────────────────────────────────────────────

const TEMPLATES: Record<BlockKind, { name: string; text: string }> = {
  algorithm: {
    name: "Algorithm",
    text: "```algorithm\nlabel: \nName(args)\nInput: \n  step\nOutput: \n```\n",
  },
  theorem: { name: "Theorem", text: "```theorem\ntitle: \nlabel: \n\n```\n" },
  lemma: { name: "Lemma", text: "```lemma\ntitle: \nlabel: \n\n```\n" },
  corollary: { name: "Corollary", text: "```corollary\ntitle: \nlabel: \n\n```\n" },
  definition: { name: "Definition", text: "```definition\ntitle: \nlabel: \n\n```\n" },
  remark: { name: "Remark", text: "```remark\ntitle: \n\n```\n" },
  proof: { name: "Proof", text: "```proof\n\n```\n" },
  "box-blue": { name: "Box (blue)", text: "```box-blue\ntitle: \n\n```\n" },
  "box-teal": { name: "Box (teal)", text: "```box-teal\ntitle: \n\n```\n" },
  "box-green": { name: "Box (green)", text: "```box-green\ntitle: \n\n```\n" },
  "box-purple": { name: "Box (purple)", text: "```box-purple\ntitle: \n\n```\n" },
  "box-amber": { name: "Box (amber)", text: "```box-amber\ntitle: \n\n```\n" },
  "box-red": { name: "Box (red)", text: "```box-red\ntitle: \n\n```\n" },
};

export class InsertBlockModal extends SuggestModal<BlockKind> {
  constructor(app: App, private editor: Editor) {
    super(app);
    this.setPlaceholder("Insert a block…");
  }
  getSuggestions(query: string): BlockKind[] {
    const q = query.toLowerCase();
    return ALL_BLOCK_KINDS.filter((k) => TEMPLATES[k].name.toLowerCase().includes(q));
  }
  renderSuggestion(kind: BlockKind, el: HTMLElement): void {
    el.addClass("mod-complex");
    el.createDiv({ cls: "suggestion-content" }).createDiv({ cls: "suggestion-title", text: TEMPLATES[kind].name });
    // The fence name, so the syntax is learnt along the way.
    el.createDiv({ cls: "suggestion-aux" }).createSpan({ cls: "apdf-fence-name", text: kind });
  }
  onChooseSuggestion(kind: BlockKind): void {
    const { text } = TEMPLATES[kind];
    const from = this.editor.getCursor();
    this.editor.replaceSelection(text);
    // Park the cursor after the first colon-less line: on the title when the
    // template has one, otherwise on the empty body line.
    const titleAt = text.split("\n").findIndex((l) => /^(title|label): $/.test(l));
    this.editor.setCursor({
      line: from.line + (titleAt >= 0 ? titleAt : 1),
      ch: titleAt >= 0 ? text.split("\n")[titleAt].length : 0,
    });
  }
}

export function registerAcademic(plugin: MarkdownPDFPlugin): void {
  for (const kind of ALL_BLOCK_KINDS) registerBlock(plugin, kind);

  // Reading view: \ref in ordinary paragraphs. Blocks resolve their own.
  plugin.registerMarkdownPostProcessor((el, ctx) => {
    const where = locate(plugin, el, ctx);
    if (where) resolveRefs(el, where.scan.labels);
  });
  // Live preview: the same, as an editor decoration.
  plugin.registerEditorExtension(refsExtension(() => scanOptions(plugin)));

  plugin.addCommand({
    id: "insert-block",
    name: "Insert academic block",
    editorCallback: (editor) => {
      if (!editor) { new Notice("Open a note first."); return; }
      new InsertBlockModal(plugin.app, editor).open();
    },
  });

  plugin.register(() => { clearLiveStyles(); forgetScans(); });
  applyLiveStyles(plugin.settings);
}

/** Re-applies the live-preview styles after the settings changed. */
export function refreshAcademicStyles(plugin: MarkdownPDFPlugin): void {
  applyLiveStyles(plugin.settings);
}
