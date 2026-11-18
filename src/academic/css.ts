// ─────────────────────────────────────────────────────────────────────────────
// Block styles for the export. The rules themselves are blocks.css, the same
// text Obsidian loads from styles.css; this adds only what the export page
// must define for them: the variables that Obsidian's theme supplies in live
// preview, here taken from the document style.
// ─────────────────────────────────────────────────────────────────────────────

import { BLOCKS_CSS } from "./blocks-css";
import { STRUCTURE_CSS } from "./structure-css";

export interface BlockCssInput {
  bodyColor: string;
  pageBackground: string;
  font: string;
  codeFont: string;
}

export function buildAcademicCSS(i: BlockCssInput): string {
  const bg = i.pageBackground && i.pageBackground !== "transparent" ? i.pageBackground : "#ffffff";
  return `
  .mpdf-doc {
    --background-primary: ${bg};
    --text-normal: ${i.bodyColor};
    --text-muted: color-mix(in oklab, ${i.bodyColor} 72%, ${bg});
    --text-faint: color-mix(in oklab, ${i.bodyColor} 45%, ${bg});
    --font-text: ${i.font};
    --font-monospace: ${i.codeFont};
    --apdf-block-font: ${i.font};
    --apdf-block-mono: ${i.codeFont};
  }
${BLOCKS_CSS}
${STRUCTURE_CSS}`;
}
