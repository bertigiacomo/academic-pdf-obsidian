// ─────────────────────────────────────────────────────────────────────────────
// Render chunks: a page section (the text between two page breaks) is
// rendered in pieces cut before each heading, so that typing re-renders one
// piece instead of the whole note. Pure: no DOM, no Obsidian.
//
// A heading always ends the block before it, so the pieces render to the same
// HTML as the whole, with two exceptions this module refuses to cut:
//  - footnotes and link reference definitions, which pair a use with a
//    definition that may sit in another piece;
//  - headings inside fenced code, `$$` math and multi-line `%%` comments,
//    which are not headings at all.
// ─────────────────────────────────────────────────────────────────────────────

const FOOTNOTE_OR_REFDEF = /\[\^[^\]\n]+\]|^ {0,3}\[[^\]\n]+\]:/m;

export function splitRenderChunks(md: string): string[] {
  if (FOOTNOTE_OR_REFDEF.test(md)) return [md];
  const chunks: string[] = [];
  let buf: string[] = [];
  let fence = "";
  let inMath = false;
  let inComment = false;
  for (const line of md.split("\n")) {
    const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !f[2].trim()) fence = "";
    } else if (f && !(f[1][0] === "`" && f[2].includes("`"))) {
      fence = f[1];
    } else {
      if ((line.split("$$").length - 1) % 2 === 1) inMath = !inMath;
      if ((line.split("%%").length - 1) % 2 === 1) inComment = !inComment;
      if (!inMath && !inComment && /^#{1,6}(\s|$)/.test(line) && buf.some((l) => l.trim())) {
        chunks.push(buf.join("\n"));
        buf = [];
      }
    }
    buf.push(line);
  }
  if (buf.some((l) => l.trim())) chunks.push(buf.join("\n"));
  return chunks.length ? chunks : [md];
}
