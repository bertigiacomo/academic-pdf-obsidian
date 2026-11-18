import { describe, expect, it } from "vitest";
import {
  mathSignatureArgs, parseAlgorithm, parseHeader, parseMarkdownBlock, splitComment, tokenizeStatement,
} from "./blocks-parse";

describe("parseHeader", () => {
  it("reads title and label in either order", () => {
    expect(parseHeader(["title: A (B)", "label: x", "body"])).toMatchObject({ title: "A (B)", label: "x", bodyStart: 2 });
    expect(parseHeader(["label: x", "title: T", "body"])).toMatchObject({ title: "T", label: "x", bodyStart: 2 });
  });
  it("stops at the first body line", () => {
    expect(parseHeader(["Some text", "label: x"]).bodyStart).toBe(0);
  });
});

describe("parseMarkdownBlock", () => {
  it("keeps a \\ref in the title", () => {
    const b = parseMarkdownBlock("title: Proof of Theorem \\ref{t}\ntext $x$");
    expect(b.title).toContain("\\ref{t}");
    expect(b.content).toBe("text $x$");
  });
});

describe("parseAlgorithm", () => {
  const src = [
    "label: algo-a", "BinarySearch(A, target)", "Input: sorted $A$",
    "  low := 1", "  while low <= high do", "    return mid // found", "Output: an index",
  ].join("\n");

  it("splits signature, directives, io and body", () => {
    const a = parseAlgorithm(src)!;
    expect(a).toMatchObject({ label: "algo-a", font: "math", name: "BinarySearch", args: "A, target" });
    expect(a.io).toEqual([{ label: "Input", text: "sorted $A$" }, { label: "Output", text: "an index" }]);
    expect(a.body.map((l) => [l.depth, l.text, l.comment])).toEqual([
      [0, "low := 1", ""], [0, "while low <= high do", ""], [1, "return mid", "found"],
    ]);
  });
  it("puts Input before Output wherever Output is written", () => {
    const a = parseAlgorithm("A()\nOutput: o\nx := 1\nInput: i")!;
    expect(a.io.map((r) => r.label)).toEqual(["Input", "Output"]);
  });
  it("reads font from a directive or a [mono] tag", () => {
    expect(parseAlgorithm("font: mono\nF(x)\n  a")!.font).toBe("mono");
    expect(parseAlgorithm("F(x) [mono]\n  a")!.font).toBe("mono");
  });
  it("accepts Require/Ensure and an 'Algorithm' prefix", () => {
    const a = parseAlgorithm("Algorithm: Foo(x)\nRequire: r\nEnsure: e\n  a")!;
    expect(a.name).toBe("Foo");
    expect(a.io.map((r) => r.label)).toEqual(["Input", "Output"]);
  });
  it("returns null when there is nothing but directives", () => {
    expect(parseAlgorithm("label: x")).toBeNull();
  });
  it("drops blank lines and ignores the block's base indent", () => {
    const a = parseAlgorithm("F()\n    a\n\n      b\n    c")!;
    expect(a.body.map((l) => l.depth)).toEqual([0, 1, 0]);
  });
});

describe("splitComment", () => {
  it("splits at //, but not inside maths", () => {
    expect(splitComment("x := 1 // note")).toEqual({ text: "x := 1", comment: "note" });
    expect(splitComment("$a // b$ := 1")).toEqual({ text: "$a // b$ := 1", comment: "" });
  });
});

describe("tokenizeStatement", () => {
  it("marks keywords (multi-word first) and maths", () => {
    const p = tokenizeStatement("else if $x$ < y then", true);
    expect(p.map((q) => [q.kind, q.value])).toEqual([
      ["keyword", "else if"], ["text", " "], ["math", "x"], ["text", " < y "], ["keyword", "then"],
    ]);
  });
  it("does not match keywords inside words", () => {
    expect(tokenizeStatement("format index", true).every((p) => p.kind === "text")).toBe(true);
  });
  it("leaves keywords alone when highlighting is off", () => {
    expect(tokenizeStatement("if x", false)).toEqual([{ kind: "text", value: "if x" }]);
  });
});

describe("mathSignatureArgs", () => {
  it("sets each argument in maths, keeps author markup", () => {
    expect(mathSignatureArgs("f, x_0, \\eta")).toBe("$f$, $x_0$, $\\eta$");
    expect(mathSignatureArgs("g(a, b), c")).toBe("$g(a, b)$, $c$");
    expect(mathSignatureArgs("$f$, $x$")).toBe("$f$, $x$");
  });
});
