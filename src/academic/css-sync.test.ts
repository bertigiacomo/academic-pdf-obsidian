import { describe, expect, it } from "vitest";
import { render } from "../../scripts/sync-block-css.mjs";
import { readFileSync } from "node:fs";
import { buildAcademicCSS } from "./css";

describe("one stylesheet for blocks", () => {
  const out = render();
  it("styles.css carries blocks.css verbatim (run npm run sync-css)", () => {
    expect(readFileSync("styles.css", "utf8")).toBe(out.styles);
  });
  it("the export embeds the same text (run npm run sync-css)", () => {
    expect(readFileSync("src/academic/blocks-css.ts", "utf8")).toBe(out.ts);
  });
  it("the export adds only variables on top of it", () => {
    const css = buildAcademicCSS({ bodyColor: "#111", pageBackground: "#fff", font: "F", codeFont: "M" });
    expect(css).toContain(out.css);
    expect(css).toContain("--apdf-block-font: F;");
  });
});
