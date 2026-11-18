// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { findRefs, resolveRefs } from "./refs";
import { scanDocument } from "./scan";

const labels = scanDocument("```theorem\nlabel: t\nx\n```\n```algorithm\nlabel: a\nA()\n```").labels;

function html(src: string): string {
  const el = document.createElement("div");
  el.innerHTML = src;
  resolveRefs(el, labels);
  return el.innerHTML;
}

describe("resolveRefs", () => {
  it("replaces known labels with their number", () => {
    expect(html("<p>Theorem \\ref{t}, Algorithm \\ref{a}.</p>"))
      .toBe('<p>Theorem <span class="apdf-ref" data-apdf-ref="t">1</span>, Algorithm <span class="apdf-ref" data-apdf-ref="a">1</span>.</p>');
  });
  it("shows ?? for an unknown label", () => {
    expect(html("<p>\\ref{nope}</p>")).toContain('apdf-ref--missing" title="Label not found: nope">??');
  });
  it("leaves code, maths and an empty \\ref{} alone", () => {
    const src = "<p><code>\\ref{t}</code> <span class=\"math\">\\ref{t}</span> \\ref{}</p>";
    expect(html(src)).toBe(src);
  });
  it("reaches references inside nested blocks and is idempotent", () => {
    const el = document.createElement("div");
    el.innerHTML = '<div class="apdf-box"><p>see \\ref{t}</p></div>';
    expect(resolveRefs(el, labels)).toBe(1);
    expect(resolveRefs(el, labels)).toBe(0);
  });
});

describe("findRefs", () => {
  it("finds positions", () => {
    expect(findRefs("a \\ref{x} b \\ref{y}")).toEqual([
      { start: 2, end: 9, label: "x" }, { start: 12, end: 19, label: "y" },
    ]);
  });
});
