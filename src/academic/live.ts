// ─────────────────────────────────────────────────────────────────────────────
// Live-preview context of the block styles: the block font, the "paper"
// option and the marker class that turns on the Obsidian-only rules of
// blocks.css. Re-applied whenever the settings are saved, removed on unload.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveCodeFont, resolveFont } from "../css-builder";
import type { PDFExportSettings } from "../settings";
import { ensureBundledFonts } from "./font-loader";

const VARS = ["--apdf-block-font", "--apdf-block-mono"];

export function applyLiveStyles(s: PDFExportSettings): void {
  const body = activeDocument.body;
  const font = resolveFont(s);
  const mono = resolveCodeFont(s);
  body.addClass("apdf-live");
  body.toggleClass("apdf-paper", s.blockPaper);
  body.setCssProps({ "--apdf-block-font": font, "--apdf-block-mono": mono });
  void ensureBundledFonts([font, mono]);
}

export function clearLiveStyles(): void {
  const body = activeDocument.body;
  body.removeClass("apdf-live");
  body.removeClass("apdf-paper");
  body.setCssProps(Object.fromEntries(VARS.map((v) => [v, ""])));
}
