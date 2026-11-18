// {{title}} and {{date}} in the header and footer text, the same double-brace
// syntax as {{current}} and {{total}} in the page number format. Pure.

/** Today as "17 November 2026", like LaTeX's \today. */
export function todayLabel(d = new Date()): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function fillPlaceholders(text: string, title: string, date: string): string {
  if (!text.includes("{{")) return text;
  return text
    .replace(/\{\{\s*date\s*\}\}/g, date)
    .replace(/\{\{\s*title\s*\}\}/g, title);
}
