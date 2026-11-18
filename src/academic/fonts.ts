// ─────────────────────────────────────────────────────────────────────────────
// Bundled fonts: names and CSS.
//
// The plugin ships Computer Modern (CMU Serif and CMU Typewriter Text 0.7.0,
// SIL OFL 1.1) inside main.js, because a store release can only carry main.js,
// manifest.json and styles.css. A family is registered with the document only
// when the chosen text or code font actually uses it (see font-loader.ts).
//
// Each family is registered under its own name, not "CMU Serif": a system copy
// of CMU would otherwise satisfy the font stack and hide a broken bundle, and
// the old fork lost its bundled font to exactly such a name mismatch. One
// constant feeds the @font-face rules, the font stack and the settings option.
//
// Pure: no Obsidian or DOM imports, so it is unit-testable as is.
// ─────────────────────────────────────────────────────────────────────────────

/** Family names used in the @font-face rules of the bundled fonts. */
export const CMU_SERIF_FAMILY = "Academic PDF CMU Serif";
export const CMU_TYPEWRITER_FAMILY = "Academic PDF CMU Typewriter";

/** CSS font-family values stored in settings when a bundled font is chosen.
 *  Single quotes: the value is also written into double-quoted style="…"
 *  attributes (page header and footer), where a double quote would end it. */
export const CMU_SERIF_STACK = `'${CMU_SERIF_FAMILY}', serif`;
export const CMU_TYPEWRITER_STACK = `'${CMU_TYPEWRITER_FAMILY}', monospace`;

/** Extra entries for the "Font family" dropdown, value → label. */
export const ACADEMIC_FONT_OPTIONS: Record<string, string> = {
  [CMU_SERIF_STACK]: "Computer Modern (bundled)",
};

/** Extra entries for the "Code font family" dropdown, value → label. */
export const ACADEMIC_CODE_FONT_OPTIONS: Record<string, string> = {
  [CMU_TYPEWRITER_STACK]: "Computer Modern Typewriter (bundled)",
};

/** Every bundled family, in a stable order. */
export const BUNDLED_FAMILIES = [CMU_SERIF_FAMILY, CMU_TYPEWRITER_FAMILY] as const;
export type BundledFamily = typeof BUNDLED_FAMILIES[number];

export interface BundledFace {
  weight: 400 | 700;
  style: "normal" | "italic";
  /** WOFF2 file contents, base64-encoded. */
  base64: string;
  /** Vertical metrics as @font-face overrides (ascent-override,
   *  descent-override, line-gap-override), in percent of the em. The font
   *  files stay unmodified (OFL Reserved Font Name). */
  metrics?: { ascent: string; descent: string; lineGap: string };
}

/** Splits a CSS font-family value into bare family names (quotes removed). */
export function parseFontFamilies(fontFamily: string): string[] {
  return fontFamily
    .split(",")
    .map((name) => name.trim().replace(/^(['"])(.*)\1$/, "$2").trim())
    .filter((name) => name.length > 0);
}

/** The bundled families named by any of the given CSS font-family values. */
export function bundledFamiliesIn(fontFamilies: string[]): BundledFamily[] {
  const named = new Set(fontFamilies.flatMap(parseFontFamilies));
  return BUNDLED_FAMILIES.filter((family) => named.has(family));
}

/** @font-face rules for one family, with the font data inlined as data URLs
 *  so they also resolve inside the export window's blob: origin. */
export function buildFontFaceCSS(family: string, faces: BundledFace[]): string {
  return faces
    .map((face) => [
      "@font-face {",
      `  font-family: "${family}";`,
      `  font-style: ${face.style};`,
      `  font-weight: ${face.weight};`,
      "  font-display: block;",
      ...(face.metrics
        ? [
          `  ascent-override: ${face.metrics.ascent};`,
          `  descent-override: ${face.metrics.descent};`,
          `  line-gap-override: ${face.metrics.lineGap};`,
        ]
        : []),
      `  src: url("data:font/woff2;base64,${face.base64}") format("woff2");`,
      "}",
    ].join("\n"))
    .join("\n");
}
