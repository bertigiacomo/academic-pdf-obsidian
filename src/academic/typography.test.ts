// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import "./test-utils/dom";
import { applyTypography, setLang, attachedRuns, looksLikeUrl, noteLang, smartQuotes, urlBreaks } from "./typography";
import { headingDepths } from "./heading-numbers";
import { sectionMarks } from "./running-head";
import { initialHyphenLang } from "./presets";

describe("smartQuotes", () => {
  it("turns apostrophes inside words into ’", () => {
    expect(smartQuotes("l'uno, dell'utente, sotto l'80%")).toBe("l’uno, dell’utente, sotto l’80%");
  });
  it("opens and closes double and single quotes", () => {
    expect(smartQuotes('He said "yes" and \'no\'.')).toBe("He said “yes” and ‘no’.");
    expect(smartQuotes('("x")')).toBe("(“x”)");
  });
  it("uses the character before the text node", () => {
    expect(smartQuotes('"', "a")).toBe("”");
    expect(smartQuotes('"', " ")).toBe("“");
  });
  it("is idempotent", () => {
    const once = smartQuotes("l'uno \"due\"");
    expect(smartQuotes(once)).toBe(once);
  });
});

describe("attachedRuns", () => {
  it("takes the punctuation after a formula", () => {
    expect(attachedRuns("con ", ", e")).toEqual({ lead: 0, trail: 1 });
    expect(attachedRuns("valore (", "). Poi")).toEqual({ lead: 1, trail: 2 });
  });
  it("takes a word attached on either side", () => {
    expect(attachedRuns("il ", "-esimo")).toEqual({ lead: 0, trail: 6 });
  });
  it("leaves spaced formulas alone", () => {
    expect(attachedRuns("a ", " b")).toEqual({ lead: 0, trail: 0 });
  });
});

describe("applyTypography", () => {
  const block = (html: string) => {
    const root = document.createElement("div");
    root.innerHTML = html;
    applyTypography([root]);
    setLang([root], "it");
    return root;
  };
  it("glues a formula to its comma and tags the block's language", () => {
    const root = block('<p>con <span class="math math-inline">X</span>, e poi</p>');
    expect(root.innerHTML).toBe('<p lang="it">con <span class="apdf-nobr"><span class="math math-inline">X</span>,</span> e poi</p>');
  });
  it("leaves code and maths untouched", () => {
    const root = block("<p>l'uno <code>a'b</code></p><pre><code>\"x\"</code></pre>");
    expect(root.innerHTML).toBe('<p lang="it">l’uno <code>a\'b</code></p><pre lang="it"><code>"x"</code></pre>');
  });
  it("leaves algorithm statements as written, but not their comments", () => {
    const root = block('<figure class="apdf-algo"><ol><li><span class="apdf-l"><span class="apdf-s">print("x\'")</span><span class="apdf-c">l\'ultimo</span></span></li></ol></figure>');
    expect(root.querySelector(".apdf-s")?.textContent).toBe('print("x\'")');
    expect(root.querySelector(".apdf-c")?.textContent).toBe("l\u2019ultimo");
  });
  it("adds break points to a URL shown as text", () => {
    const root = block('<p><a href="https://a.org/b-c">https://a.org/b-c</a></p>');
    expect(root.querySelectorAll("wbr").length).toBe(urlBreaks("https://a.org/b-c").length);
    expect(root.textContent).toBe("https://a.org/b-c");
  });
  it("is stable when run twice", () => {
    const root = block('<p>"a" <span class="math math-inline">X</span>.</p>');
    const once = root.innerHTML;
    applyTypography([root]);
    setLang([root], "it");
    expect(root.innerHTML).toBe(once);
  });
});

describe("urls and language", () => {
  it("recognises URLs", () => {
    expect(looksLikeUrl("https://arxiv.org/abs/1705.08500")).toBe(true);
    expect(looksLikeUrl("the paper")).toBe(false);
  });
  it("breaks after separators, not before a doubled one", () => {
    expect(urlBreaks("a//b.c")).toEqual([3, 5]);
  });
  it("reads lang from the frontmatter", () => {
    expect(noteLang("---\ntitle: X\nlang: it-IT\n---\ntext")).toBe("it");
    expect(noteLang("---\nlanguage: \"en\"\n---\n")).toBe("en");
    expect(noteLang("lang: it\n")).toBeNull();
  });
  it("starts from Obsidian's language when we offer it", () => {
    expect(initialHyphenLang("it")).toBe("it");
    expect(initialHyphenLang("zh-TW")).toBe("en");
  });
});

describe("headings and running head", () => {
  it("depth is relative to the top level used after the title", () => {
    expect(headingDepths([1, 2, 3, 2], true)).toEqual([null, 0, 1, 0]);
    expect(headingDepths([2, 3, 4, 5, 6], false)).toEqual([0, 1, 2, 3, 3]);
  });
  it("a page shows the first section starting on it, else the one in force", () => {
    const h = (t: string) => {
      const el = document.createElement("h2");
      el.setAttribute("data-apdf-depth", "0");
      el.textContent = t;
      return el;
    };
    const p = () => document.createElement("p");
    expect(sectionMarks([[p()], [h("1 A"), p(), h("2 B")], [p()]])).toEqual(["", "1 A", "2 B"]);
  });
});

import { columnShares, needsHyphenation } from "./tables";
describe("columnShares", () => {
  const col = (minPx: number, natPx: number, avgChars: number) => ({ minPx, headPx: 0, natPx, avgChars });
  it("leaves a table that fits at its natural width", () => {
    expect(columnShares([col(60, 80, 8), col(30, 40, 3)], 480, 16)).toBeNull();
  });
  it("gives a long description the room, and every column its longest word", () => {
    const cols = [col(100, 110, 8), col(50, 55, 5), col(60, 65, 4), col(70, 600, 60), col(75, 80, 7)];
    const w = columnShares(cols, 700, 16) as number[];
    expect(w).not.toBeNull();
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    cols.forEach((c, i) => expect(w[i] * 700).toBeGreaterThanOrEqual(c.minPx + 16 - 1e-6));
    expect(w[3]).toBeGreaterThan(Math.max(w[0], w[1], w[2], w[4]));
    // short columns stop at their natural width
    expect(w[1] * 700).toBeLessThanOrEqual(55 + 16 + 1e-6);
  });
  it("lets body cells hyphenate before shrinking below the words", () => {
    const cols = [col(150, 160, 8), col(150, 160, 8), col(150, 900, 60), col(150, 160, 8)];
    expect(needsHyphenation(cols, 480, 16)).toBe(true);
    const w = columnShares(cols, 480, 16) as number[];
    cols.forEach((c, i) => expect(w[i] * 480).toBeGreaterThanOrEqual(c.minPx * 0.6 + 16 - 1e-6));
    expect(w[2]).toBeGreaterThan(w[0]);
  });
  it("shrinks proportionally when even hyphenated words do not fit", () => {
    const w = columnShares([col(400, 400, 5), col(400, 400, 5)], 480, 16) as number[];
    expect(w[0]).toBeCloseTo(0.5, 6);
  });
});
