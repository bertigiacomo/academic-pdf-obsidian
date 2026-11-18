import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { annotateNumbers, blocksInside, fencedLines, numberAt, scanDocument } from "./scan";
import { parseHeader } from "./blocks-parse";

const fence = (kind: string, body: string, ticks = "```") => `${ticks}${kind}\n${body}\n${ticks}`;

describe("scanDocument", () => {
  it("numbers each kind separately, in document order", () => {
    const md = [
      fence("theorem", "label: t1\ntext"), fence("lemma", "label: l1\ntext"),
      fence("theorem", "label: t2\ntext"), fence("remark", "text"), fence("proof", "text"),
    ].join("\n\n");
    const r = scanDocument(md);
    expect(r.labels.get("t1")).toEqual({ kind: "theorem", number: 1 });
    expect(r.labels.get("t2")).toEqual({ kind: "theorem", number: 2 });
    expect(r.labels.get("l1")).toEqual({ kind: "lemma", number: 1 });
    expect(r.blocks.find((b) => b.kind === "remark")!.number).toBeNull();
    expect(r.blocks.find((b) => b.kind === "proof")!.number).toBeNull();
  });

  it("counts unlabelled blocks too", () => {
    const md = [fence("algorithm", "label: a\nA()"), fence("algorithm", "B()"), fence("algorithm", "label: c\nC()")].join("\n");
    expect(scanDocument(md).labels.get("c")!.number).toBe(3);
  });

  it("finds blocks nested in a longer fence, and in a box", () => {
    const md = fence("box-teal", "title: x\n" + fence("theorem", "label: inner\nbody"), "````");
    const r = scanDocument(md);
    expect(r.labels.get("inner")).toEqual({ kind: "theorem", number: 1 });
    expect(r.blocks.map((b) => [b.kind, b.depth])).toEqual([["box-teal", 0], ["theorem", 1]]);
  });

  it("numbers a forward reference target before a later block", () => {
    const md = [fence("box-blue", "uses \\ref{later}"), fence("theorem", "label: later\nx")].join("\n");
    expect(scanDocument(md).labels.get("later")!.number).toBe(1);
  });

  it("ignores academic fences inside ordinary code, either fence character", () => {
    const md = fence("md", fence("theorem", "label: x\ny"), "````") + "\n\n" + fence("text", fence("theorem", "label: z\ny"), "~~~~");
    expect(scanDocument(md).blocks).toHaveLength(0);
  });

  it("does not close a fence on a shorter one, nor on another character", () => {
    const md = "````box-red\n```\n~~~~\nstill inside\n````\n\n```theorem\nlabel: t\nx\n```";
    const r = scanDocument(md);
    expect(r.blocks.map((b) => b.kind)).toEqual(["box-red", "theorem"]);
    expect(r.labels.get("t")!.number).toBe(1);
  });

  it("copes with an unclosed fence", () => {
    const r = scanDocument("```theorem\nlabel: t\nnever closed");
    expect(r.labels.get("t")!.number).toBe(1);
  });

  it("keeps the first of two equal labels", () => {
    const md = [fence("theorem", "label: d\na"), fence("theorem", "label: d\nb")].join("\n");
    expect(scanDocument(md).labels.get("d")!.number).toBe(1);
  });

  it("turns numbering off per family", () => {
    const md = [fence("algorithm", "label: a\nA()"), fence("theorem", "label: t\nx")].join("\n");
    const r = scanDocument(md, { numberAlgorithms: false, numberTheorems: true });
    expect(r.labels.has("a")).toBe(false);
    expect(r.labels.get("t")!.number).toBe(1);
  });

  it("is stable: same text, same result", () => {
    const md = fence("lemma", "label: l\nx");
    expect(scanDocument(md).labels).toEqual(scanDocument(md).labels);
  });

  // The test note lives in the development repository only.
  const TEST_NOTE = "fixtures/Super Markdown Test.md";
  it.skipIf(!existsSync(TEST_NOTE))("settles the numbers of the test note: Dijkstra is the sixth algorithm", () => {
    const md = readFileSync(TEST_NOTE, "utf8");
    const labels = scanDocument(md).labels;
    const n = (l: string) => labels.get(l)!.number;
    expect([n("algo-binary"), n("algo-grad"), n("algo-merge"), n("algo-newton"), n("algo-dijkstra")]).toEqual([1, 2, 3, 5, 6]);
    expect([n("thm-gd-conv"), n("thm-unique"), n("lem-lipschitz"), n("lem-decrease"), n("cor-linear"), n("def-strong-conv"), n("def-smooth")])
      .toEqual([1, 2, 1, 2, 1, 1, 2]);
    expect(labels.has("algo-nonexistent")).toBe(false);
  });
});

describe("annotateNumbers", () => {
  it("adds the number as the first body line, read back by parseHeader", () => {
    const md = fence("theorem", "label: t\nbody");
    const out = annotateNumbers(md, scanDocument(md));
    const lines = out.split("\n");
    expect(lines[1]).toBe("apdf-n: 1");
    expect(parseHeader(lines.slice(1)).number).toBe(1);
    expect(parseHeader(lines.slice(1)).label).toBe("t");
  });

  it("numbers nested blocks, and leaves unnumbered kinds alone", () => {
    const md = fence("box-blue", fence("lemma", "x") + "\n" + fence("remark", "y"), "````");
    const out = annotateNumbers(md, scanDocument(md));
    expect(out.match(/apdf-n:/g)).toHaveLength(1);
  });

  it("annotates the body of a box with the numbers from the whole document", () => {
    const md = [fence("theorem", "x"), fence("box-blue", "title: t\n" + fence("theorem", "y"), "````")].join("\n");
    const scan = scanDocument(md);
    const box = scan.blocks.find((b) => b.kind === "box-blue")!;
    const body = md.split("\n").slice(box.line + 1, box.endLine).join("\n").split("\n").slice(1).join("\n");
    expect(annotateNumbers(body, scan, box.line + 2)).toContain("apdf-n: 2");
    expect(blocksInside(scan, box).size).toBe(1);
  });
});

describe("fencedLines", () => {
  it("flags fence lines and their content only", () => {
    expect(fencedLines("a\n```x\nb\n```\nc")).toEqual([false, true, true, true, false]);
  });
});

describe("numberAt", () => {
  it("gives no number, rather than a wrong one, when the note is unknown", () => {
    expect(numberAt(null, 0)).toBeNull();
  });
  it("gives no number to a fence the scan does not know", () => {
    expect(numberAt(scanDocument("```theorem\nx\n```"), 5)).toBeNull();
    expect(numberAt(scanDocument("```theorem\nx\n```"), 0)).toBe(1);
  });
});
