// Test helper: the DOM additions Obsidian installs (createEl, createDiv,
// createSpan, addClass, appendText, setCssStyles), on happy-dom's document.
// Import it first in a test that runs with `@vitest-environment happy-dom`.

interface Opts { cls?: string; text?: string }

function make(tag: string, o?: Opts | string): HTMLElement {
  const el = document.createElement(tag);
  const opts = typeof o === "string" ? { cls: o } : o;
  if (opts?.cls) el.className = opts.cls;
  if (opts?.text !== undefined) el.textContent = opts.text;
  return el;
}

const g = window as unknown as Record<string, unknown>;
g.activeDocument = document;
g.createEl = make;
g.createDiv = (o?: Opts) => make("div", o);
g.createSpan = (o?: Opts) => make("span", o);

const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
proto.createEl = function (this: HTMLElement, tag: string, o?: Opts) { return this.appendChild(make(tag, o)); };
proto.createDiv = function (this: HTMLElement, o?: Opts) { return this.appendChild(make("div", o)); };
proto.createSpan = function (this: HTMLElement, o?: Opts) { return this.appendChild(make("span", o)); };
proto.addClass = function (this: HTMLElement, c: string) { this.classList.add(c); };
proto.appendText = function (this: HTMLElement, t: string) { this.appendChild(document.createTextNode(t)); };
proto.setCssStyles = function (this: HTMLElement, s: Partial<CSSStyleDeclaration>) { Object.assign(this.style, s); };

export {};
