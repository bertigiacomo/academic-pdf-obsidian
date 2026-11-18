import { describe, expect, it } from "vitest";
import { splitRenderChunks } from "./render-chunks";

describe("splitRenderChunks", () => {
  it("cuts before each heading", () => {
    expect(splitRenderChunks("intro\n# A\ntext\n## B\nmore")).toEqual(["intro", "# A\ntext", "## B\nmore"]);
  });

  it("joins back to the original text", () => {
    const md = "# A\n\n- x\n- y\n\n# B\n\n```\n# code\n```\n";
    expect(splitRenderChunks(md).join("\n")).toBe(md);
  });

  it("does not cut inside fences, math or comments", () => {
    expect(splitRenderChunks("a\n```\n# no\n```")).toHaveLength(1);
    expect(splitRenderChunks("a\n$$\n# no\n$$")).toHaveLength(1);
    expect(splitRenderChunks("a\n%%\n# no\n%%")).toHaveLength(1);
    expect(splitRenderChunks("a\n#hashtag")).toHaveLength(1);
  });

  it("keeps notes with footnotes or reference links whole", () => {
    expect(splitRenderChunks("a[^1]\n# B\n[^1]: note")).toHaveLength(1);
    expect(splitRenderChunks("[x][r]\n# B\n[r]: http://e.x")).toHaveLength(1);
  });
});
