import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, PDFExportSettings } from "../../settings";
import { marginsValue, ptLabel, rowsById, settingGroups } from "./settings-model";
import { setRowValue } from "./settings-render";

const fresh = (): PDFExportSettings => ({ ...DEFAULT_SETTINGS });

describe("settings model", () => {
  it("has the eight groups of the mockup, in order", () => {
    expect(settingGroups().map((g) => g.heading)).toEqual([
      "Style", "Page", "Typography", "Structure", "Academic", "Header and footer", "Export", "About",
    ]);
  });

  it("shows only the document groups in the modal", () => {
    const modal = settingGroups().filter((g) => g.modal).map((g) => [g.heading, g.rows.filter((r) => r.modal && !r.visible).map((r) => r.modalName ?? r.name)]);
    expect(modal).toEqual([
      ["Style", ["Preset"]],
      ["Page", ["Size", "Orientation", "Margins"]],
      ["Typography", ["Font", "Size", "Line spacing", "Justify text"]],
      ["Structure", ["Title page", "Table of contents", "Number headings", "New page for each section"]],
      ["Academic", ["Number theorems", "Number algorithms"]],
      ["Header and footer", ["Page numbers", "Header"]],
    ]);
  });

  it("font size is in points, keeping a preset's odd value as an option", () => {
    const s = fresh();
    const row = rowsById(settingGroups()).get("fontSize");
    if (row?.kind !== "dropdown") throw new Error("no row");
    s.fontSize = 13;
    expect(Object.values(row.options(s))).toEqual(["9.75 pt", "10 pt", "10.5 pt", "11 pt", "12 pt"]);
    setRowValue(row, s, "11pt");
    expect(ptLabel(s.fontSize)).toBe("11 pt");
  });

  it("margins: presets set all four sides, custom keeps them", () => {
    const s = fresh();
    const row = rowsById(settingGroups()).get("margins");
    if (row?.kind !== "dropdown") throw new Error("no row");
    setRowValue(row, s, "wide");
    expect([s.marginTop, s.marginBottom, s.marginLeft, s.marginRight]).toEqual([35, 35, 35, 35]);
    expect(marginsValue(s)).toBe("wide");
    setRowValue(row, s, "custom");
    expect(marginsValue(s)).toBe("custom");
    setRowValue(row, s, "normal");
    s.marginLeft = 20;
    expect(marginsValue(s)).toBe("custom");
  });

  it("LaTeX article margins are a margins choice of their own", () => {
    const s = fresh();
    expect(marginsValue(s)).toBe("article");
    expect([s.marginTop, s.marginBottom, s.marginLeft, s.marginRight]).toEqual([37, 35, 42, 42]);
  });

  it("the hyphenation language shows only with justified text", () => {
    const row = rowsById(settingGroups()).get("hyphenLang");
    expect(row?.visible?.({ ...fresh(), justify: true })).toBe(true);
    expect(row?.visible?.({ ...fresh(), justify: false })).toBe(false);
  });

  it("turning page numbers on also turns the footer on", () => {
    const s = { ...fresh(), showFooter: false, showPageNumbers: false };
    const row = rowsById(settingGroups()).get("showPageNumbers");
    if (!row) throw new Error("no row");
    setRowValue(row, s, true);
    expect(s.showFooter).toBe(true);
  });
});
