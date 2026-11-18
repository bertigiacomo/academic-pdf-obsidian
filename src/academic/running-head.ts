// ─────────────────────────────────────────────────────────────────────────────
// F7: running head and page furniture, as LaTeX places them.
//
// - Running head (fancyhdr): the current section, the note's title or a
//   custom text, at the top left of every body page, slanted, over a 0.4pt
//   rule. The page shows the first section that starts on it, otherwise the
//   one in force from the pages before (\rightmark's first mark).
// - Geometry: the text block is the page minus the margins; the head sits
//   \headsep above it and the page number \footskip below it, inside the
//   margins, so turning either on never moves the text.
// ─────────────────────────────────────────────────────────────────────────────

import type { PDFExportSettings } from "../settings";
import { HEADING_DEPTH_ATTR, TITLE_HEADING_ATTR } from "./heading-numbers";
import { fillPlaceholders, todayLabel } from "./placeholders";

export type RunningHead = PDFExportSettings["runningHead"];
const KINDS: readonly RunningHead[] = ["none", "section", "title", "custom"];

export function isRunningHead(v: string): v is RunningHead {
  return (KINDS as readonly string[]).includes(v);
}

/** \headsep 25pt and \footskip 30pt, in CSS px. */
export const HEADSEP_PX = 25 * 4 / 3;
export const FOOTSKIP_PX = 30 * 4 / 3;

/** Top edges of the head and foot bands. The foot band's middle line sits
 *  about \footskip below the last baseline of a full page. */
export function bandTops(
  ph: number, mTop: number, contentH: number, headerH: number, footerH: number,
): { headerTop: number; footerTop: number } {
  const headerTop = Math.max(0, mTop - HEADSEP_PX - headerH);
  const footerTop = Math.min(ph - footerH, Math.max(0, mTop + contentH + FOOTSKIP_PX - footerH / 2 - 4));
  return { headerTop, footerTop };
}

/** The section heading text a page carries, per page; "" before the first. */
export function sectionMarks(pages: HTMLElement[][]): string[] {
  let current = "";
  return pages.map((nodes) => {
    let first = "";
    for (const node of nodes) {
      const heads = node.matches?.(`[${HEADING_DEPTH_ATTR}="0"]`)
        ? [node]
        : Array.from(node.querySelectorAll<HTMLElement>(`[${HEADING_DEPTH_ATTR}="0"]`));
      for (const h of heads) {
        if (h.hasAttribute(TITLE_HEADING_ATTR)) continue;
        const text = (h.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!first) first = text;
        current = text;
      }
    }
    return first || current;
  });
}

interface HeadFields {
  pageShowsHeader: boolean;
  hasHeader: boolean;
  headerLeft: string;
  headerCenter: string;
  headerRight: string;
}

/**
 * Writes the running head into the page layouts, replacing the upstream
 * header text. `firstBody` is the index of the first body page: the front
 * pages (title page, contents) carry no head.
 */
export function applyRunningHead(
  layouts: HeadFields[], pages: HTMLElement[][], s: PDFExportSettings, title: string, firstBody: number,
): void {
  const kind = s.runningHead;
  const marks = kind === "section" ? sectionMarks(pages) : [];
  const fixed = kind === "title" ? title
    : kind === "custom" ? fillPlaceholders(s.headerText, title, todayLabel()) : "";
  layouts.forEach((l, i) => {
    const text = kind === "none" || i < firstBody || !l.pageShowsHeader ? ""
      : kind === "section" ? marks[i] : fixed;
    l.headerLeft = text;
    l.headerCenter = "";
    l.headerRight = "";
    l.hasHeader = !!text;
  });
}
