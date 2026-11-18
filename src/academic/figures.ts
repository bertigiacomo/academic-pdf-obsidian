// ─────────────────────────────────────────────────────────────────────────────
// F5: figures. An image alone in its paragraph, with a written alt text,
// becomes <figure> with "Figure n: alt" as caption. Alt texts Obsidian fills
// in by itself (the file name, a size like 300 or 300x200) are not captions.
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_FILE = /\.(?:png|jpe?g|gif|svg|webp|bmp|avif|tiff?)$/i;
const SIZE = /^\d+(?:x\d+)?$/;

export function isCaption(alt: string | null, src: string | null): boolean {
  const a = (alt ?? "").trim();
  if (!a || SIZE.test(a) || IMAGE_FILE.test(a)) return false;
  // Obsidian sets the alt of ![[photo]] to the link text.
  const file = decodeURIComponent((src ?? "").split(/[?#]/)[0].split("/").pop() ?? "");
  return a !== file && a !== file.replace(IMAGE_FILE, "");
}

/** Whether `p` holds one image and nothing else but whitespace. */
function soleImage(p: HTMLElement): HTMLImageElement | null {
  const imgs = p.querySelectorAll("img");
  if (imgs.length !== 1) return null;
  if ((p.textContent ?? "").trim()) return null;
  return imgs[0];
}

/** Wraps captioned images into numbered figures, in document order. */
export function applyFigures(roots: HTMLElement[]): number {
  let n = 0;
  for (const root of roots) {
    for (const p of Array.from(root.querySelectorAll<HTMLElement>("p"))) {
      if (p.closest(".apdf-block, figure")) continue;
      const img = soleImage(p);
      if (!img || !isCaption(img.getAttribute("alt"), img.getAttribute("src"))) continue;
      n++;
      const fig = createEl("figure", { cls: "apdf-figure" });
      // The paragraph's attributes (page-break tags) move to the figure.
      for (const a of Array.from(p.attributes)) fig.setAttribute(a.name, a.value);
      fig.addClass("apdf-figure");
      while (p.firstChild) fig.appendChild(p.firstChild);
      const cap = fig.createEl("figcaption", { cls: "apdf-figure-caption" });
      cap.createEl("b", { text: `Figure ${n}:` });
      cap.appendText(" " + (img.getAttribute("alt") ?? "").trim());
      p.replaceWith(fig);
    }
  }
  return n;
}
