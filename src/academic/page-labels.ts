// ─────────────────────────────────────────────────────────────────────────────
// F5 / D6: /PageLabels in the exported PDF, so that readers show the printed
// page numbers (i, ii, … then 1, 2, …) instead of the physical page index.
// ─────────────────────────────────────────────────────────────────────────────

import { PDFDocument, PDFName, PDFNumber, PDFObject } from "pdf-lib";
import type { PageLabelRange } from "./page-numbers";

export async function injectPageLabels(pdf: Uint8Array, ranges: PageLabelRange[]): Promise<Uint8Array> {
  if (ranges.length === 0) return pdf;
  const doc = await PDFDocument.load(pdf);
  const ctx = doc.context;
  const nums: PDFObject[] = [];
  for (const r of ranges) {
    nums.push(PDFNumber.of(r.startPage));
    nums.push(ctx.obj({ S: PDFName.of(r.style), St: PDFNumber.of(r.first) }));
  }
  doc.catalog.set(PDFName.of("PageLabels"), ctx.obj({ Nums: nums }));
  return doc.save();
}
