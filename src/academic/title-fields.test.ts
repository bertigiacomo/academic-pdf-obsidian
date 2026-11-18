import { describe, expect, it } from "vitest";
import { readTitleFields, writeTitleFields } from "./title-fields";

describe("title page fields", () => {
  it("reads every field, even without a title or author", () => {
    expect(readTitleFields({ Date: "2026-11-18", affiliations: ["A", "B"] })).toEqual({
      title: "", subtitle: "", authors: [], affiliation: "A; B", date: "2026-11-18", abstract: "",
    });
    expect(readTitleFields(undefined).authors).toEqual([]);
  });

  it("writes in place, keeping other properties and the note's own keys", () => {
    const fm: Record<string, unknown> = { tags: ["ml"], Title: "Old", authors: ["X"], affiliations: ["A"] };
    writeTitleFields(fm, {
      title: " New ", subtitle: "", authors: ["Ada Lovelace", " ", "Alan Turing"],
      affiliation: "Uni", date: "", abstract: "Line one\n$x^2$\n\n",
    });
    expect(fm).toEqual({
      tags: ["ml"], Title: "New", authors: ["Ada Lovelace", "Alan Turing"],
      affiliation: "Uni", abstract: "Line one\n$x^2$",
    });
  });

  it("writes one author as a plain value and removes empty fields", () => {
    const fm: Record<string, unknown> = { subtitle: "S", author: ["A", "B"], date: "x" };
    writeTitleFields(fm, { title: "", subtitle: "", authors: ["Solo"], affiliation: "", date: "", abstract: "  " });
    expect(fm).toEqual({ author: "Solo" });
  });
});
