import { describe, expect, it } from "vitest";
import { BlockLocator, blockStarts, hasBreakAbove, pageBreakInsertion } from "./block-map";

describe("blockStarts", () => {
  it("finds paragraphs, headings, fences and rules", () => {
    const md = "# Title\nintro line\nsecond line\n\n```theorem\nlabel: t\n\n# not a heading\n```\n\n***\n\nend";
    expect(blockStarts(md)).toEqual(["# Title", "intro line", "```theorem", "***", "end"]);
  });

  it("keeps loose lists and quotes as one block", () => {
    const md = "- a\n\n- b\n  more\n\n> [!note]\n> x\n\nafter";
    expect(blockStarts(md)).toEqual(["- a", "> [!note]", "after"]);
  });

  it("a different list marker starts a new list", () => {
    expect(blockStarts("- a\n- b\n1. c")).toEqual(["- a", "1. c"]);
  });

  it("treats a setext underline as part of the heading", () => {
    expect(blockStarts("Title\n---\n\ntext")).toEqual(["Title", "text"]);
  });

  it("display math is one block", () => {
    expect(blockStarts("a\n\n$$\nx\n\ny\n$$\n\nb")).toEqual(["a", "$$", "b"]);
  });

  it("definitions and comments make no block; footnotes add one at the end", () => {
    expect(blockStarts("a[^1]\n\n[^1]: note\n\n[r]: http://x\n\n%%\nhidden\n%%\n\nb"))
      .toEqual(["a[^1]", "b", null]);
  });

  it("a table is one block", () => {
    expect(blockStarts("| a | b |\n|---|---|\n| 1 | 2 |\n\nz")).toEqual(["| a | b |", "z"]);
  });

  it("a line without a pipe right after a table starts a paragraph", () => {
    expect(blockStarts("| a | b |\n|---|---|\n| 1 | 2 |\nNote: x\nmore")).toEqual(["| a | b |", "Note: x"]);
  });
});

describe("BlockLocator", () => {
  it("finds first lines in order, skipping fences and frontmatter", () => {
    const note = "---\ntitle: x\n---\nfoo\n\n```\nbar\n```\n\nbar\n\nfoo";
    const loc = new BlockLocator(note);
    expect(loc.next("foo")).toBe(3);
    expect(loc.next("```")).toBe(5);
    expect(loc.next("bar")).toBe(9);
    expect(loc.next("missing")).toBeNull();
    expect(loc.next("foo")).toBe(11);
    expect(loc.next(null)).toBeNull();
  });
});

describe("insertion helpers", () => {
  it("adds a blank line before when needed", () => {
    expect(pageBreakInsertion("a\n\nb", 2, "%% page break %%")).toBe("%% page break %%\n\n");
    expect(pageBreakInsertion("a\nb", 1, "%% page break %%")).toBe("\n%% page break %%\n\n");
  });

  it("detects a break right above", () => {
    const isBreak = (l: string) => l === "%% page break %%";
    expect(hasBreakAbove("%% page break %%\n\nb", 2, isBreak)).toBe(true);
    expect(hasBreakAbove("a\n\nb", 2, isBreak)).toBe(false);
  });
});
