// @vitest-environment happy-dom
import "./__tests__/dom";
import { describe, expect, it } from "vitest";
import { academicMeta, frontmatterYaml, readAcademicMeta } from "./frontmatter";
import { applyHeadingNumbers, headingNumbers, stripManualNumber, TITLE_HEADING_ATTR } from "./heading-numbers";
import { frontMatterNumbering, pageLabelRanges, toRoman } from "./page-numbers";
import { applyFigures, isCaption } from "./figures";
import { collectTocEntries } from "./frontpages";
import { chooseLineSplit, splitAlgorithm } from "./pagination-hooks";
import { blockSignature, firstChange, resumePoint, suffixStart } from "./ui/resume";

describe("frontmatter", () => {
  it("finds the YAML block", () => {
    expect(frontmatterYaml("---\ntitle: A\n---\n# x")).toBe("title: A");
    expect(frontmatterYaml("# no")).toBeNull();
  });

  it("reads the academic fields from the parsed object", () => {
    const meta = academicMeta({
      Title: "On Graphs", author: ["Ada Lovelace", "Alan Turing"], date: "2026",
      abstract: "We prove $P$ in \\ref{thm-a}.\n", affiliation: "Uni",
    });
    expect(meta).toEqual({
      title: "On Graphs", subtitle: undefined, authors: ["Ada Lovelace", "Alan Turing"],
      affiliation: "Uni", date: "2026", abstract: "We prove $P$ in \\ref{thm-a}.",
    });
  });

  it("splits a one-line author list", () => {
    expect(academicMeta({ authors: "A. One, B. Two and C. Three" })?.authors).toEqual(["A. One", "B. Two", "C. Three"]);
  });

  it("formats a YAML date object", () => {
    expect(academicMeta({ title: "T", date: new Date("2026-11-18T00:00:00Z") })?.date).toBe("2026-11-18");
  });

  it("has no metadata without title, author or abstract", () => {
    expect(academicMeta({ tags: ["x"], date: "2026" })).toBeNull();
    expect(academicMeta(null)).toBeNull();
    expect(academicMeta(["title"])).toBeNull();
  });

  it("treats a parse error as no metadata", () => {
    expect(readAcademicMeta("---\n: :\n---\n", () => { throw new Error("bad"); })).toBeNull();
  });
});

describe("heading numbers", () => {
  it("numbers sections from the top level used", () => {
    expect(headingNumbers([1, 2, 2, 3, 1, 2], false)).toEqual(["1", "1.1", "1.2", "1.2.1", "2", "2.1"]);
    expect(headingNumbers([2, 3, 2], false)).toEqual(["1", "1.1", "2"]);
  });

  it("skips the title and numbers the rest from its own top level", () => {
    expect(headingNumbers([1, 2, 3, 2], true)).toEqual([null, "1", "1.1", "2"]);
  });

  it("leaves levels below the third unnumbered", () => {
    expect(headingNumbers([1, 2, 3, 4], false)).toEqual(["1", "1.1", "1.1.1", null]);
  });

  it("counts a subsection before any section from 0, like LaTeX", () => {
    expect(headingNumbers([2, 1], false)).toEqual(["0.1", "1"]);
  });

  it("drops a hand-written number but keeps a year", () => {
    expect(stripManualNumber("1. Introduction")).toBe("Introduction");
    expect(stripManualNumber("4.1 Boxes")).toBe("Boxes");
    expect(stripManualNumber("2.3.1 - Proof")).toBe("Proof");
    expect(stripManualNumber("2024 results")).toBe("2024 results");
  });

  it("marks the title heading and writes numbers in the DOM", () => {
    const root = document.createElement("div");
    root.append(
      Object.assign(document.createElement("h1"), { textContent: "My Note" }),
      Object.assign(document.createElement("h2"), { textContent: "1. Intro" }),
      Object.assign(document.createElement("h3"), { textContent: "Details" }),
    );
    applyHeadingNumbers([root], "my note", true);
    const [h1, h2, h3] = Array.from(root.children);
    expect(h1.hasAttribute(TITLE_HEADING_ATTR)).toBe(true);
    expect(h1.textContent).toBe("My Note");
    expect(h2.textContent).toBe("1 Intro");
    expect(h3.querySelector(".apdf-secnum")?.textContent).toBe("1.1");
  });
});

describe("page numbers", () => {
  it("writes lower-case roman numerals", () => {
    expect([1, 2, 4, 9, 14, 40, 1999].map(toRoman)).toEqual(["i", "ii", "iv", "ix", "xiv", "xl", "mcmxcix"]);
  });

  it("numbers front matter in roman, hidden on the title page, and the body from 1", () => {
    const n = frontMatterNumbering(["title", "toc", "toc"], 3, 1, (c, t) => `${c} / ${t}`);
    expect(n.map((p) => p.numStr)).toEqual([null, "ii", "iii", "1 / 3", "2 / 3", "3 / 3"]);
    expect(n[0].showFooter).toBe(false);
    expect(n[1].showHeader).toBe(false);
    expect(n[3].showHeader).toBe(true);
  });

  it("gives PDF readers the same labels", () => {
    expect(pageLabelRanges(0, 1)).toEqual([]);
    expect(pageLabelRanges(2, 1)).toEqual([
      { startPage: 0, style: "r", first: 1 }, { startPage: 2, style: "D", first: 1 },
    ]);
  });
});

describe("figures", () => {
  it("takes only written alt texts as captions", () => {
    expect(isCaption("Loss over epochs", "img/loss.png")).toBe(true);
    expect(isCaption("loss.png", "app://x/loss.png")).toBe(false);
    expect(isCaption("loss", "app://x/loss.png?123")).toBe(false);
    expect(isCaption("300x200", "a.png")).toBe(false);
    expect(isCaption("", "a.png")).toBe(false);
  });

  it("wraps a captioned image in a numbered figure, keeping its tags", () => {
    const root = document.createElement("div");
    const p = root.appendChild(document.createElement("p"));
    p.dataset.apdfBlock = "4";
    const img = p.appendChild(document.createElement("img"));
    img.setAttribute("alt", "A cat");
    img.setAttribute("src", "cat.png");
    expect(applyFigures([root])).toBe(1);
    const fig = root.firstElementChild as HTMLElement;
    expect(fig.tagName).toBe("FIGURE");
    expect(fig.dataset.apdfBlock).toBe("4");
    expect(fig.querySelector("figcaption")?.textContent).toBe("Figure 1: A cat");
  });
});

describe("contents", () => {
  it("lists headings with their body page and no title", () => {
    const h = (tag: string, text: string, num?: string) => {
      const el = document.createElement(tag);
      el.id = text.toLowerCase();
      if (num) { el.setAttribute("data-apdf-num", num); el.append(Object.assign(document.createElement("span"), { className: "apdf-secnum", textContent: num })); }
      el.append(text);
      return el;
    };
    const title = h("h1", "Title");
    title.setAttribute("data-apdf-title", "");
    const pages = [[title, h("h2", "Intro", "1")], [h("h3", "Sub", "1.1"), h("h2", "End", "2")]];
    const entries = collectTocEntries(pages, (i) => String(i + 1));
    expect(entries.map((e) => [e.level, e.num, e.page, e.id])).toEqual([
      [1, "1", "1", "intro"], [2, "1.1", "2", "sub"], [1, "2", "2", "end"],
    ]);
    expect(entries[0].content.map((n) => n.textContent).join("")).toBe("Intro");
  });
});

describe("line splits", () => {
  it("keeps at least the minimum on both sides", () => {
    expect(chooseLineSplit(10, 5, 3, false)).toBe(5);
    expect(chooseLineSplit(10, 2, 3, false)).toBeNull();
    expect(chooseLineSplit(10, 9, 3, false)).toBe(7);
    expect(chooseLineSplit(5, 4, 3, false)).toBeNull();
  });

  it("always progresses when forced", () => {
    expect(chooseLineSplit(10, 0, 3, true)).toBe(1);
    expect(chooseLineSplit(10, 9, 3, true)).toBe(7);
    expect(chooseLineSplit(1, 0, 3, true)).toBeNull();
  });

  it("splits an algorithm with the caption repeated and numbering carried on", () => {
    const wrap = document.createElement("div");
    const fig = wrap.appendChild(document.createElement("figure"));
    fig.className = "apdf-block apdf-algo";
    fig.append(
      Object.assign(document.createElement("figcaption"), { className: "apdf-algo-caption", textContent: "Algorithm 1: Sort" }),
      Object.assign(document.createElement("dl"), { className: "apdf-algo-io", textContent: "Input" }),
    );
    const ol = fig.appendChild(document.createElement("ol"));
    ol.className = "apdf-algo-body";
    for (let i = 0; i < 8; i++) ol.append(Object.assign(document.createElement("li"), { textContent: `line ${i}` }));

    const fits = (node: HTMLElement) => node.querySelectorAll("li").length <= 5;
    const split = splitAlgorithm(wrap, fits, false);
    if (!split) throw new Error("no split");
    const [a, b] = split;
    expect(a.querySelectorAll("li").length).toBe(5);
    expect(b.querySelectorAll("li").length).toBe(3);
    expect(b.querySelector(".apdf-algo-caption")?.textContent).toBe("Algorithm 1: Sort (continued)");
    expect(b.querySelector(".apdf-algo-io")).toBeNull();
    expect((b.querySelector(".apdf-algo-body") as HTMLElement).style.counterReset).toBe("apdf-line 5");

    // A part of a part keeps counting and says "(continued)" once.
    const again = splitAlgorithm(b, (n) => n.querySelectorAll("li").length <= 2, true);
    if (!again) throw new Error("no split");
    expect((again[1].querySelector(".apdf-algo-body") as HTMLElement).style.counterReset).toBe("apdf-line 6"); // 1 + 2: two lines must stay together
    expect(again[1].querySelectorAll(".apdf-algo-cont").length).toBe(1);
  });

  it("leaves other blocks to the upstream splitters", () => {
    expect(splitAlgorithm(document.createElement("p"), () => true, false)).toBeUndefined();
  });
});

describe("resumed pagination", () => {
  it("ignores the per-pass position tags in signatures", () => {
    expect(blockSignature('<p data-apdf-block="3" class="x">a <span data-apdf-block="1">b</span></p>'))
      .toBe('<p class="x">a <span data-apdf-block="1">b</span></p>');
  });

  it("resumes before the heading run that precedes the change", () => {
    const heads = new Set([4, 5]);
    // Pages started at blocks 0, 3, 5 (heading), 8.
    const starts = [0, 3, 5, 8];
    expect(resumePoint(9, (i) => heads.has(i), starts, 12)).toEqual({ page: 3, child: 8 });
    // Change at 6: the run 4–5 looked at it, so resume before block 4.
    expect(resumePoint(6, (i) => heads.has(i), starts, 12)).toEqual({ page: 1, child: 3 });
    expect(resumePoint(2, () => false, starts, 12)).toEqual({ page: 0, child: 0 });
    // Continuations are not resume points.
    expect(resumePoint(9, () => false, [0, null], 12)).toEqual({ page: 0, child: 0 });
  });

  it("finds where the unchanged tail starts", () => {
    expect(firstChange(["a", "b", "c"], ["a", "x", "c"])).toBe(1);
    expect(suffixStart(["a", "N", "b", "c"], ["a", "b", "c"])).toEqual({ start: 2, delta: 1 });
    expect(suffixStart(["a", "c"], ["a", "b", "c"])).toEqual({ start: 1, delta: -1 });
    expect(suffixStart(["a", "b"], ["a", "b"])).toEqual({ start: 0, delta: 0 });
  });
});
