// ─────────────────────────────────────────────────────────────────────────────
// PDF export and printing, moved from the upstream modal. Takes the same
// DocumentLayout the preview draws (page-view.ts) and serialises the same page
// structure (background → header banner → header text → content → footer
// banner → footer text → frame) into an HTML document for Electron's print
// pipeline. A layout change must be made in both files.
// ─────────────────────────────────────────────────────────────────────────────

import { bandTops } from "../running-head";
import { App, FileSystemAdapter, Notice, TFile } from "obsidian";
import type { PDFExportSettings } from "../../settings";
import {
  bgImageCssProps, escapeCSSForStyle, escapeHTML, getMathJaxCSSInlined, resolveCodeFont,
  resolveFont, resolveImageUrl, waitForMathJaxStylesheetStable,
} from "../../css-builder";
import { extractOutlineEntries, injectPDFOutline } from "../../paginator";
import { pdfFileName, resolveSaveLocation } from "../../save-path";
import { bundledFontCSS } from "../font-loader";
import { injectPageLabels } from "../page-labels";
import type { DocumentLayout } from "./pipeline";

// ─── Electron type shims: just enough for the export path ─────────────────────

interface ElectronBrowserWindow {
  loadURL(url: string): void;
  close(): void;
  webContents: {
    once(event: "did-fail-load", listener: (event: unknown, code: number, desc: string) => void): void;
    once(event: "did-finish-load", listener: () => void): void;
    executeJavaScript(code: string): Promise<unknown>;
    printToPDF(options: {
      pageSize: string;
      landscape: boolean;
      printBackground: boolean;
      preferCSSPageSize?: boolean;
      margins: { marginType: string };
    }): Promise<Uint8Array>;
    print(
      options: Record<string, unknown>,
      callback?: (success: boolean, failureReason: string) => void,
    ): void;
  };
}

interface ElectronRemote {
  dialog: {
    showSaveDialog(options: {
      title: string;
      defaultPath: string;
      filters: { name: string; extensions: string[] }[];
    }): Promise<{ canceled: boolean; filePath?: string }>;
  };
  BrowserWindow: new (options: {
    show: boolean;
    webPreferences: { nodeIntegration: boolean };
  }) => ElectronBrowserWindow;
}

interface ElectronFs {
  writeFile(path: string, data: Uint8Array, cb: (err: Error | null) => void): void;
}

interface ElectronBridge {
  require(module: "@electron/remote"): ElectronRemote;
  require(module: "fs"): ElectronFs;
  require(module: string): unknown;
}

function frameOverlayHTML(s: PDFExportSettings): string {
  if (!s.frameEnabled) return "";
  const inset = `${s.frameMargin}px`;
  return `<div style="position:absolute;top:${inset};left:${inset};right:${inset};bottom:${inset};pointer-events:none;box-sizing:border-box;border:${s.frameThickness}px ${s.frameStyle} ${s.frameColor};"></div>`;
}

function hfInnerHTML(center: string, left: string, right: string): string {
  if (!center && !left && !right) return "";
  return center
    ? `<span style="flex:1;text-align:center;">${escapeHTML(center)}</span>`
    : `<span>${escapeHTML(left)}</span><span style="margin-left:auto;">${escapeHTML(right)}</span>`;
}

/** Builds the print-ready HTML document for `c`, one fixed-size div per page. */
export async function buildExportDocument(
  app: App, c: DocumentLayout, s: PDFExportSettings, title: string,
): Promise<string> {
  const { layouts, pw, ph, mTop, mLeft, mRight, footerH, headerH, contentW, contentH, docCSS, fontFamily, pageBackground, isRTL } = c;
  const { headerTop, footerTop } = bandTops(ph, mTop, contentH, headerH, footerH);

  const frameHTML = frameOverlayHTML(s);
  const headerBannerUrl = (s.showHeader && s.headerImagePath) ? resolveImageUrl(app, s.headerImagePath) : "";
  const footerBannerUrl = (s.showFooter && s.footerImagePath) ? resolveImageUrl(app, s.footerImagePath) : "";
  const bgImgUrl = (s.backgroundImageEnabled && s.backgroundImagePath) ? resolveImageUrl(app, s.backgroundImagePath) : "";

  const bgImgHTML = bgImgUrl ? (() => {
    const bgCss = bgImageCssProps(s.backgroundImageSize);
    const pos = s.backgroundImageScope === "content-only"
      ? `top:${mTop}px;left:${mLeft}px;width:${contentW}px;height:${contentH}px;`
      : `inset:0;`;
    const common = `background-image:url('${bgImgUrl}');background-size:${bgCss.size};background-repeat:${bgCss.repeat};background-position:center;opacity:${s.backgroundImageOpacity};pointer-events:none;`;
    return `<div style="position:absolute;${pos}${common}"></div>`;
  })() : "";

  const pageHTMLParts = layouts.map((layout) => {
    // pageNodes went through postProcessRenderedHTML (top-level style/script
    // stripped), so they serialise as they are.
    const contentHTML = layout.pageNodes.map((n) => n.outerHTML).join("\n");

    // academic-pdf (F7): the running head, slanted over a 0.4pt rule, \headsep above the text.
    const headerHTML = layout.hasHeader
      ? `<div style="position:absolute;top:${headerTop}px;left:${mLeft}px;right:${mRight}px;height:${headerH}px;display:flex;align-items:flex-end;padding-bottom:3px;border-bottom:0.4pt solid #000;font-style:italic;font-size:${s.headerFontSize}px;color:${s.headerFontColor};font-family:${fontFamily};white-space:nowrap;">${hfInnerHTML(layout.headerCenter, layout.headerLeft, layout.headerRight)}</div>`
      : "";

    const footerBorder = s.showFooterBorder ? `border-top:0.4pt solid #000;` : "";
    const footerHTML = layout.hasFooter
      ? `<div style="position:absolute;top:${footerTop}px;left:0;right:0;height:${footerH}px;display:flex;align-items:center;${footerBorder}padding:0 ${mRight}px 0 ${mLeft}px;font-size:${s.footerFontSize}px;color:${s.footerFontColor};font-family:${fontFamily};">${hfInnerHTML(layout.footerCenter, layout.footerLeft, layout.footerRight)}</div>`
      : "";

    const contentDivHTML = `<div class="mpdf-doc"${isRTL ? ' dir="rtl"' : ''} style="position:absolute;top:${mTop}px;left:${mLeft}px;width:${contentW}px;">${contentHTML}</div>`;

    const headerBannerHTML = (layout.pageShowsHeader && headerBannerUrl)
      ? `<div style="position:absolute;top:${headerTop}px;left:${s.headerImageMargin}px;right:${s.headerImageMargin}px;height:${headerH}px;background-image:url('${headerBannerUrl}');background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none;"></div>`
      : "";
    const footerBannerHTML = (layout.pageShowsFooter && footerBannerUrl)
      ? `<div style="position:absolute;top:${footerTop}px;left:${s.footerImageMargin}px;right:${s.footerImageMargin}px;height:${footerH}px;background-image:url('${footerBannerUrl}');background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none;"></div>`
      : "";

    return `<div class="mpdf-export-page">${bgImgHTML}${headerBannerHTML}${headerHTML}${contentDivHTML}${footerBannerHTML}${footerHTML}${frameHTML}</div>`;
  });

  // The MathJax stylesheet must be settled right before the capture.
  await waitForMathJaxStylesheetStable();
  // MathJax fonts inlined: the export window's blob: origin cannot resolve
  // the app:// paths MathJax references.
  const inlinedMathCSS = await getMathJaxCSSInlined();
  const fontsCSS = bundledFontCSS([resolveFont(s), resolveCodeFont(s)]);

  const printCSS = `
    *, *::before, *::after { box-sizing: border-box; }
    @page { size: ${pw}px ${ph}px; margin: 0; }
    html, body { margin: 0; padding: 0; background: ${pageBackground}; }
    .mpdf-export-page {
      position: relative;
      width: ${pw}px; height: ${ph}px;
      overflow: hidden;
      background: ${pageBackground};
      page-break-after: always; break-after: page;
    }
    .mpdf-export-page:last-child { page-break-after: avoid; break-after: avoid; }
    ${docCSS}
  `;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHTML(title || "Export")}</title>
${inlinedMathCSS ? `<style>${escapeCSSForStyle(inlinedMathCSS)}</style>` : ""}
${fontsCSS ? `<style>${escapeCSSForStyle(fontsCSS)}</style>` : ""}
<style>${escapeCSSForStyle(printCSS)}</style>
</head>
<body>
${pageHTMLParts.join("\n")}
</body>
</html>`;
}

/** Loads `fullHTML` into a hidden window and waits for its fonts. Callers
 *  revoke the url and close the window. */
async function loadExportWindow(
  remote: ElectronRemote, fullHTML: string,
): Promise<{ win: ElectronBrowserWindow; url: string }> {
  const blob = new Blob([fullHTML], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const win  = new remote.BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
  win.loadURL(url);
  await new Promise<void>((resolve, reject) => {
    let handled = false;
    win.webContents.once("did-fail-load", (_e: unknown, _code: number, desc: string) => {
      if (handled) return;
      handled = true;
      reject(new Error(desc));
    });
    win.webContents.once("did-finish-load", () => {
      if (handled) return;
      handled = true;
      resolve();
    });
  });
  await win.webContents.executeJavaScript("document.fonts.ready.then(() => true)").catch(() => true);
  return { win, url };
}

function electronRemote(): { electron: ElectronBridge; remote: ElectronRemote } | null {
  try {
    const electron = window as unknown as ElectronBridge;
    const remote = electron.require("@electron/remote") as ElectronRemote | null;
    return remote?.BrowserWindow ? { electron, remote } : null;
  } catch {
    return null;
  }
}

/** The "content cut off" Notice belongs to the export only: while writing,
 *  the fixed warning in the preview is enough. */
function warnOverflow(c: DocumentLayout): void {
  if (c.overflowPages.length === 0) return;
  new Notice(`Content cut off on page ${c.overflowPages[0] + 1}. A block is taller than a page and can't be split.`);
}

/** Asks where to save, then writes the PDF. Resolves when done or cancelled. */
export async function exportPdf(
  app: App, c: DocumentLayout, s: PDFExportSettings, file: TFile | null,
): Promise<void> {
  if (c.layouts.length === 0) { new Notice("Nothing to export."); return; }
  const bridge = electronRemote();
  if (!bridge) { new Notice("Academic PDF requires the Obsidian desktop app."); return; }
  const { electron, remote } = bridge;

  const absolute = (folder: string) => {
    const adapter = app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getFullPath(folder) : null;
  };
  const prefill = s.prefillSaveLocation ? resolveSaveLocation(file, absolute) : null;
  const fallbackName = pdfFileName(file?.basename) ?? "export.pdf";
  const res = await remote.dialog.showSaveDialog({
    title: "Save PDF",
    defaultPath: prefill ?? fallbackName,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (res.canceled || !res.filePath) return;
  const target = res.filePath;

  warnOverflow(c);
  const fullHTML = await buildExportDocument(app, c, s, file?.basename ?? "");
  let win: ElectronBrowserWindow, url: string;
  try {
    ({ win, url } = await loadExportWindow(remote, fullHTML));
  } catch (err: unknown) {
    new Notice("Couldn't prepare the PDF: " + (err instanceof Error ? err.message : String(err)));
    return;
  }
  try {
    // Custom sizes carry their @page size; named sizes pass the name.
    const isCustom = s.pageSize === "Custom";
    let data = await win.webContents.printToPDF({
      pageSize:          isCustom ? "A4" : s.pageSize,
      landscape:         !isCustom && s.orientation === "landscape",
      preferCSSPageSize: isCustom,
      printBackground:   true,
      margins:           { marginType: "none" },
    });
    if (s.includeOutline) {
      try {
        data = await injectPDFOutline(data, extractOutlineEntries(c.layouts));
      } catch (outlineErr) {
        console.warn("[academic-pdf] outline injection failed:", outlineErr);
      }
    }
    try {
      data = await injectPageLabels(data, c.pageLabels);
    } catch (labelErr) {
      console.warn("[academic-pdf] page labels failed:", labelErr);
    }
    await new Promise<void>((resolve) => {
      electron.require("fs").writeFile(target, data, (err: Error | null) => {
        if (err) new Notice("Couldn't save the PDF: " + err.message);
        else new Notice("PDF saved: " + target);
        resolve();
      });
    });
  } catch (err: unknown) {
    new Notice("Couldn't render the PDF: " + (err instanceof Error ? err.message : String(err)));
  } finally {
    URL.revokeObjectURL(url);
    win.close();
  }
}

/** Opens the system print dialog on the same document. No outline here: the
 *  result goes from Electron straight to the printer the user picked. */
export async function printPdf(
  app: App, c: DocumentLayout, s: PDFExportSettings, title: string,
): Promise<void> {
  if (c.layouts.length === 0) { new Notice("Nothing to print."); return; }
  const bridge = electronRemote();
  if (!bridge) { new Notice("Academic PDF requires the Obsidian desktop app."); return; }
  warnOverflow(c);
  const fullHTML = await buildExportDocument(app, c, s, title);
  let win: ElectronBrowserWindow, url: string;
  try {
    ({ win, url } = await loadExportWindow(bridge.remote, fullHTML));
  } catch (err: unknown) {
    new Notice("Couldn't prepare the page: " + (err instanceof Error ? err.message : String(err)));
    return;
  }
  await new Promise<void>((resolve) => {
    win.webContents.print({}, (success: boolean, failureReason: string) => {
      // A cancelled job is reported as a failure too ("cancelled", or
      // "Print job canceled" on macOS).
      if (!success && !/cancel/i.test(failureReason)) new Notice("Print failed: " + failureReason);
      URL.revokeObjectURL(url);
      win.close();
      resolve();
    });
  });
}
