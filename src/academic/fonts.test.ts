import { describe, expect, it } from "vitest";
import {
  ACADEMIC_CODE_FONT_OPTIONS, ACADEMIC_FONT_OPTIONS, BUNDLED_FAMILIES,
  CMU_SERIF_FAMILY, CMU_SERIF_STACK, CMU_TYPEWRITER_FAMILY, CMU_TYPEWRITER_STACK,
  buildFontFaceCSS, bundledFamiliesIn, parseFontFamilies,
} from "./fonts";

describe("bundled font names", () => {
  // The old fork declared "Computer Modern Serif" but offered "CMU Serif", so
  // its bundled font was never used. One constant must drive all three places.
  it("uses one family name for the option, the stack and the @font-face", () => {
    expect(Object.keys(ACADEMIC_FONT_OPTIONS)).toContain(CMU_SERIF_STACK);
    expect(parseFontFamilies(CMU_SERIF_STACK)[0]).toBe(CMU_SERIF_FAMILY);
    const css = buildFontFaceCSS(CMU_SERIF_FAMILY, [{ weight: 400, style: "normal", base64: "AA==" }]);
    expect(css).toContain(`font-family: "${CMU_SERIF_FAMILY}";`);
  });

  it("does the same for the typewriter font", () => {
    expect(Object.keys(ACADEMIC_CODE_FONT_OPTIONS)).toContain(CMU_TYPEWRITER_STACK);
    expect(parseFontFamilies(CMU_TYPEWRITER_STACK)[0]).toBe(CMU_TYPEWRITER_FAMILY);
  });

  it("has no double quotes, so it survives a double-quoted style attribute", () => {
    expect(CMU_SERIF_STACK).not.toContain('"');
    expect(CMU_TYPEWRITER_STACK).not.toContain('"');
  });

  it("does not reuse the system names of CMU", () => {
    for (const family of BUNDLED_FAMILIES) expect(family).not.toMatch(/^CMU /);
  });
});

describe("parseFontFamilies", () => {
  it("strips quotes and whitespace", () => {
    expect(parseFontFamilies(`"A B", 'C', D ,serif`)).toEqual(["A B", "C", "D", "serif"]);
  });

  it("drops empty entries", () => {
    expect(parseFontFamilies(" , Georgia,")).toEqual(["Georgia"]);
  });
});

describe("bundledFamiliesIn", () => {
  it("finds the bundled stacks", () => {
    expect(bundledFamiliesIn([CMU_SERIF_STACK])).toEqual([CMU_SERIF_FAMILY]);
    expect(bundledFamiliesIn([CMU_SERIF_STACK, CMU_TYPEWRITER_STACK]))
      .toEqual([CMU_SERIF_FAMILY, CMU_TYPEWRITER_FAMILY]);
  });

  it("finds a family later in a custom stack, once", () => {
    expect(bundledFamiliesIn([`Inter, "${CMU_TYPEWRITER_FAMILY}"`, CMU_TYPEWRITER_STACK]))
      .toEqual([CMU_TYPEWRITER_FAMILY]);
  });

  it("is empty for system fonts, including a system CMU", () => {
    expect(bundledFamiliesIn(["Georgia, serif", '"CMU Serif", serif', "inherit"])).toEqual([]);
  });
});

describe("buildFontFaceCSS", () => {
  const faces = [
    { weight: 400 as const, style: "normal" as const, base64: "Uk9NQU4=" },
    { weight: 700 as const, style: "italic" as const, base64: "Qkk=" },
  ];

  it("emits one rule per face with inlined woff2 data", () => {
    const css = buildFontFaceCSS("Fam", faces);
    expect(css.match(/@font-face/g)).toHaveLength(2);
    expect(css).toContain('src: url("data:font/woff2;base64,Uk9NQU4=") format("woff2");');
    expect(css).toContain("font-weight: 700;");
    expect(css).toContain("font-style: italic;");
  });

  it("returns an empty string for no faces", () => {
    expect(buildFontFaceCSS("Fam", [])).toBe("");
  });

  it("writes the vertical metric overrides when a face has them", () => {
    const css = buildFontFaceCSS("Fam", [
      { ...faces[0], metrics: { ascent: "93.5%", descent: "37.2%", lineGap: "0%" } },
    ]);
    expect(css).toContain("ascent-override: 93.5%;");
    expect(css).toContain("descent-override: 37.2%;");
    expect(css).toContain("line-gap-override: 0%;");
    expect(buildFontFaceCSS("Fam", faces)).not.toContain("override");
  });
});
