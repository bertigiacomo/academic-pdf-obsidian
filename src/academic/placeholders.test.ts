import { describe, expect, it } from "vitest";
import { fillPlaceholders, todayLabel } from "./placeholders";

describe("header and footer placeholders", () => {
  it("fills {{title}} and {{date}}", () => {
    expect(fillPlaceholders("{{title}} · {{ date }}", "Notes", "1 May 2026")).toBe("Notes · 1 May 2026");
    expect(fillPlaceholders("plain", "x", "y")).toBe("plain");
  });

  it("does not expand placeholders found in the title", () => {
    expect(fillPlaceholders("{{title}}", "{{date}}", "d")).toBe("{{date}}");
  });

  it("formats the date like \\today", () => {
    expect(todayLabel(new Date(2026, 10, 17))).toBe("17 November 2026");
  });
});
