import { describe, expect, it } from "vitest";
import {
  findPageBreakLines, insertAutoBreaks, prepareSections, removePageBreak, splitSections,
} from "./page-breaks";

const sections = (md: string, h1 = false) => {
  const p = prepareSections(md, { autoBreakH1: h1, autoBreakH2: false });
  return p.split(p.md);
};

describe("page breaks", () => {
  it("splits on `%% page break %%` and numbers the manual breaks", () => {
    const out = sections("A\n\n%% page break %%\n\nB\n\n%% Page Break %%\nC");
    expect(out.map((s) => s.md)).toEqual(["A", "B", "C"]);
    expect(out.map((s) => s.start)).toEqual([
      null, { kind: "manual", index: 0 }, { kind: "manual", index: 1 },
    ]);
  });

  it("no longer reads `///`", () => {
    expect(sections("A\n///\nB").map((s) => s.md)).toEqual(["A\n///\nB"]);
  });

  it("ignores breaks inside fenced code", () => {
    const md = "```\n%% page break %%\n```\nafter";
    expect(sections(md)).toHaveLength(1);
    expect(findPageBreakLines(md)).toEqual([]);
  });

  it("cannot be forged with the private-use marker", () => {
    const forged = "A\napdf-page-break:0\nB";
    expect(sections(forged)).toHaveLength(1);
  });

  it("keeps the marker through a transform that drops comment lines", () => {
    const p = prepareSections("A\n%% page break %%\n%%note%%\nB", {
      autoBreakH1: false, autoBreakH2: false,
      transform: (md) => md.split("\n").filter((l) => !l.startsWith("%%")).join("\n"),
    });
    expect(p.split(p.md).map((s) => s.md)).toEqual(["A", "B"]);
  });

  it("adds automatic breaks before H1, not before the first line", () => {
    const out = sections("# One\ntext\n# Two\n```\n# not\n```", true);
    expect(out.map((s) => s.start)).toEqual([null, { kind: "auto" }]);
    expect(out[1].md).toBe("# Two\n```\n# not\n```");
    expect(insertAutoBreaks("a", false, false)).toBe("a");
  });

  it("a manual break wins over an automatic one at the same place", () => {
    const out = sections("intro\n\n%% page break %%\n# Two\nx", true);
    expect(out[1].start).toEqual({ kind: "manual", index: 0 });
  });

  it("drops empty sections", () => {
    expect(splitSections("\n\n")).toEqual([]);
  });

  it("finds break lines after the frontmatter only", () => {
    const md = "---\na: 1\n---\nx\n%% page break %%\ny";
    expect(findPageBreakLines(md)).toEqual([4]);
  });

  it("removes a break and one surrounding blank line", () => {
    const md = "A\n\n%% page break %%\n\nB";
    expect(removePageBreak(md, 0)).toEqual({ from: 2, to: 3 });
    expect(removePageBreak(md, 1)).toBeNull();
    expect(removePageBreak("A\n%% page break %%\nB", 0)).toEqual({ from: 1, to: 1 });
  });
});
