// ─────────────────────────────────────────────────────────────────────────────
// Export side of F3/F4. Two calls from export-modal.ts:
//   prepareExport(md, s)  before the document is split into sections: runs
//                         the pre-scan and hands every numbered block its
//                         number as a hidden `apdf-n:` line;
//   result.resolve(els)   after all sections are rendered: resolves every
//                         \ref against the whole document (forward
//                         references, references inside boxes).
// ─────────────────────────────────────────────────────────────────────────────

import type { PDFExportSettings } from "../settings";
import { resolveRefs } from "./refs";
import { annotateNumbers, scanDocument } from "./scan";

export interface PreparedExport {
  md: string;
  resolve(roots: ParentNode[]): number;
}

export function prepareExport(
  md: string, s: Pick<PDFExportSettings, "numberAlgorithms" | "numberTheorems">,
): PreparedExport {
  const scan = scanDocument(md, s);
  return {
    md: annotateNumbers(md, scan),
    resolve: (roots) => roots.reduce((n, r) => n + resolveRefs(r, scan.labels), 0),
  };
}
