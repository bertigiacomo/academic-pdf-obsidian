// Where the note text comes from. Every surface (pane, modal, page breaks)
// reads through here, so none of them works on stale text: an open note is
// read from its editor buffer, which is ahead of the file on disk until
// Obsidian autosaves; a closed note from the vault.

import { App, MarkdownView, TFile } from "obsidian";

/** The Markdown view showing `file`, if any. Prefers the most recent one. */
export function findMarkdownView(app: App, file: TFile): MarkdownView | null {
  const recent = app.workspace.getActiveViewOfType(MarkdownView);
  if (recent?.file === file) return recent;
  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    if (leaf.view instanceof MarkdownView && leaf.view.file === file) return leaf.view;
  }
  return null;
}

export async function readNote(app: App, file: TFile): Promise<string> {
  const view = findMarkdownView(app, file);
  const buffer = view?.getViewData() ?? "";
  // Right after a note opens, its editor is still empty for a moment: an
  // empty buffer falls back to the file (a note emptied by hand reaches the
  // file at the next autosave, and the preview follows).
  return buffer || app.vault.cachedRead(file);
}

/** The Markdown note the user is working on: the active file, or the file of
 *  the most recent Markdown leaf when focus is elsewhere (a sidebar, a graph). */
export function activeMarkdownFile(app: App): TFile | null {
  const active = app.workspace.getActiveFile();
  if (active?.extension === "md") return active;
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (view?.file) return view.file;
  const recent = app.workspace.getMostRecentLeaf();
  return recent?.view instanceof MarkdownView ? recent.view.file ?? null : null;
}
