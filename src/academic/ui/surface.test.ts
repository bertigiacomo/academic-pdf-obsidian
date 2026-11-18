import { describe, expect, it } from "vitest";
import { SurfaceState, statusLabel } from "./surface";

const st = (over: Partial<SurfaceState>): SurfaceState => ({
  status: "ready", pageCount: 0, overflowPages: [], canExport: false, progress: null, phase: "render", ...over,
});

describe("statusLabel", () => {
  it("shows the share done only once a render reports it", () => {
    expect(statusLabel(st({ status: "first" }))).toBe("Rendering…");
    expect(statusLabel(st({ status: "first", progress: 42 }))).toBe("Rendering… 42%");
    expect(statusLabel(st({ status: "updating", progress: 7 }))).toBe("Updating… 7%");
  });

  it("names the layout phase instead of a number that stands still", () => {
    expect(statusLabel(st({ status: "first", progress: 70, phase: "layout" }))).toBe("Laying out pages…");
    expect(statusLabel(st({ status: "first", phase: "layout" }))).toBe("Rendering…");
  });

  it("counts pages when ready", () => {
    expect(statusLabel(st({ canExport: true, pageCount: 1 }))).toBe("1 page");
    expect(statusLabel(st({ canExport: true, pageCount: 12 }))).toBe("12 pages");
    expect(statusLabel(st({}))).toBe("—");
  });
});
