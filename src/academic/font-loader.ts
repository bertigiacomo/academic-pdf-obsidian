// ─────────────────────────────────────────────────────────────────────────────
// Bundled fonts: registration with the document.
//
// The font files are embedded in main.js by esbuild (base64 loader), but each
// family is added to the document's FontFaceSet only the first time a render
// uses it, and removed again when the plugin unloads. The FontFace API is used
// instead of a <style> element, which the store guidelines discourage.
//
// Fonts in the document's FontFaceSet are visible inside the preview's shadow
// DOM. The export window is a separate page, so it gets the same faces as
// @font-face CSS in its <head> (bundledFontCSS).
// ─────────────────────────────────────────────────────────────────────────────

import cmuSerifRoman from "./fonts/cmu-serif-roman.woff2";
import cmuSerifBold from "./fonts/cmu-serif-bold.woff2";
import cmuSerifItalic from "./fonts/cmu-serif-italic.woff2";
import cmuSerifBoldItalic from "./fonts/cmu-serif-bolditalic.woff2";
import cmuTypewriterRegular from "./fonts/cmu-typewriter-regular.woff2";
import cmuTypewriterBold from "./fonts/cmu-typewriter-bold.woff2";
import cmuTypewriterItalic from "./fonts/cmu-typewriter-italic.woff2";
import cmuTypewriterBoldItalic from "./fonts/cmu-typewriter-bolditalic.woff2";
import {
  BundledFace, BundledFamily, CMU_SERIF_FAMILY, CMU_TYPEWRITER_FAMILY,
  buildFontFaceCSS, bundledFamiliesIn,
} from "./fonts";

/** Vertical metrics, in percent of the em. The official CMU 0.7.0 TTFs give
 *  a smaller descent plus a 20% line gap; the layout (and the comparison with
 *  XeLaTeX) was tuned with these values, taken from the TTFs used before
 *  release. Overridden in CSS so the font files stay as published. */
const m = (ascent: number, descent: number) => ({ ascent: `${ascent}%`, descent: `${descent}%`, lineGap: "0%" });

const FACES: Record<BundledFamily, BundledFace[]> = {
  [CMU_SERIF_FAMILY]: [
    { weight: 400, style: "normal", base64: cmuSerifRoman, metrics: m(93.506, 37.256) },
    { weight: 700, style: "normal", base64: cmuSerifBold, metrics: m(93.701, 39.990) },
    { weight: 400, style: "italic", base64: cmuSerifItalic, metrics: m(93.018, 37.354) },
    { weight: 700, style: "italic", base64: cmuSerifBoldItalic, metrics: m(93.115, 41.455) },
  ],
  [CMU_TYPEWRITER_FAMILY]: [
    { weight: 400, style: "normal", base64: cmuTypewriterRegular, metrics: m(85.400, 40.137) },
    { weight: 700, style: "normal", base64: cmuTypewriterBold, metrics: m(89.404, 42.871) },
    { weight: 400, style: "italic", base64: cmuTypewriterItalic, metrics: m(85.400, 40.186) },
    { weight: 700, style: "italic", base64: cmuTypewriterBoldItalic, metrics: m(89.404, 42.871) },
  ],
};

/** Faces added to each document (main window, popouts), per family. Each
 *  window has its own FontFaceSet, and pages are measured in the window the
 *  preview lives in (activeDocument when the render starts). */
const registered = new Map<Document, Map<BundledFamily, FontFace[]>>();

/** The @font-face CSS needed by the given font-family values, or "" when they
 *  use no bundled font. Used for the export window's <head>. */
export function bundledFontCSS(fontFamilies: string[]): string {
  return bundledFamiliesIn(fontFamilies)
    .map((family) => buildFontFaceCSS(family, FACES[family]))
    .join("\n");
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Adds every bundled family named by the given font-family values to the
 *  document, and waits until all their faces are decoded. Must finish before
 *  pagination, or pages are measured with the fallback font's metrics. */
export async function ensureBundledFonts(fontFamilies: string[], doc: Document = activeDocument): Promise<void> {
  let faces = registered.get(doc);
  if (!faces) registered.set(doc, (faces = new Map<BundledFamily, FontFace[]>()));
  for (const family of bundledFamiliesIn(fontFamilies)) {
    if (faces.has(family)) continue;
    const added = FACES[family].map((face) =>
      new FontFace(family, base64ToBytes(face.base64), {
        weight: String(face.weight), style: face.style, display: "block",
        ...(face.metrics && {
          ascentOverride: face.metrics.ascent,
          descentOverride: face.metrics.descent,
          lineGapOverride: face.metrics.lineGap,
        }),
      }),
    );
    added.forEach((face) => doc.fonts.add(face));
    faces.set(family, added);
  }
  const pending = [...faces.values()].flat().filter((face) => face.status !== "loaded");
  try {
    await Promise.all(pending.map((face) => face.load()));
  } catch (err) {
    console.warn("[academic-pdf] Bundled font failed to load:", err);
  }
}

/** Removes the faces added by ensureBundledFonts. Called on unload. */
export function removeBundledFonts(): void {
  for (const [doc, faces] of registered) {
    for (const list of faces.values()) list.forEach((face) => doc.fonts.delete(face));
  }
  registered.clear();
}
