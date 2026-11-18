// ─────────────────────────────────────────────────────────────────────────────
// Where the user meets the plugin. Two actions, always with the same names and
// the file-output icon: "Open PDF preview" (the pane) and "Export to PDF…"
// (the modal; the dots say a window opens first). One call from main.ts.
//
//   ribbon            Open PDF preview
//   file menu         Export to PDF…, Open PDF preview
//   editor menu       Insert academic block…, Export to PDF…
//   commands          open-preview, export-note, print-note (insert-block is
//                     registered with the blocks, register.ts)
// ─────────────────────────────────────────────────────────────────────────────

import { MarkdownView, Notice, TFile } from "obsidian";
import type MarkdownPDFPlugin from "../../main";
import { InsertBlockModal } from "../register";
import { printPdf } from "./export-pdf";
import { activeMarkdownFile, readNote } from "./note-source";
import { RenderPipeline } from "./pipeline";
import { PREVIEW_VIEW_TYPE, PdfPreviewView, activatePreview } from "./preview-view";

const ICON = "file-output";

/** Prints a note directly: a one-off render of its current text. */
async function printNote(plugin: MarkdownPDFPlugin, file: TFile): Promise<void> {
  const pipeline = new RenderPipeline(plugin.app, () => plugin.settings);
  try {
    const text = await readNote(plugin.app, file);
    if (!text.trim()) { new Notice("This note is empty."); return; }
    const layout = await pipeline.render({ text, title: file.basename, sourcePath: file.path });
    await printPdf(plugin.app, layout, plugin.settings, file.basename);
  } catch (err) {
    new Notice("Couldn't render this note: " + (err instanceof Error ? err.message : String(err)));
  } finally {
    pipeline.dispose();
  }
}

/** The active Markdown note, for commands that need one. */
function activeNote(plugin: MarkdownPDFPlugin): TFile | null {
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  return view?.file ?? null;
}

export function registerUi(plugin: MarkdownPDFPlugin): void {
  plugin.registerView(PREVIEW_VIEW_TYPE, (leaf) => new PdfPreviewView(leaf, plugin));

  plugin.addRibbonIcon(ICON, "Open PDF preview", () => void activatePreview(plugin));

  plugin.addCommand({
    id: "open-preview",
    name: "Open PDF preview",
    icon: ICON,
    callback: () => void activatePreview(plugin),
  });

  plugin.addCommand({
    id: "export-note",
    name: "Export current note to PDF",
    icon: ICON,
    // Opens the modal: settings and page breaks live there, so every export
    // goes through it.
    checkCallback: (checking) => {
      const file = activeNote(plugin);
      if (!file) return false;
      if (!checking) plugin.openModal(file);
      return true;
    },
  });

  plugin.addCommand({
    id: "print-note",
    name: "Print current note",
    icon: "printer",
    checkCallback: (checking) => {
      const file = activeNote(plugin);
      if (!file) return false;
      if (!checking) void printNote(plugin, file);
      return true;
    },
  });

  plugin.registerEvent(plugin.app.workspace.on("file-menu", (menu, file) => {
    if (!(file instanceof TFile) || file.extension !== "md") return;
    menu.addItem((item) => item.setTitle("Export to PDF…").setIcon(ICON)
      .onClick(() => plugin.openModal(file)));
    menu.addItem((item) => item.setTitle("Open PDF preview").setIcon(ICON)
      .onClick(() => void activatePreview(plugin, file)));
  }));

  plugin.registerEvent(plugin.app.workspace.on("editor-menu", (menu, editor, info) => {
    menu.addItem((item) => item.setTitle("Insert academic block…").setIcon("square-function")
      .onClick(() => new InsertBlockModal(plugin.app, editor).open()));
    const file = info.file ?? activeMarkdownFile(plugin.app);
    if (file) {
      menu.addItem((item) => item.setTitle("Export to PDF…").setIcon(ICON)
        .onClick(() => plugin.openModal(file)));
    }
  }));
}
