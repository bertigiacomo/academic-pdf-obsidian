// Vitest setup: Obsidian adds `instanceOf` (a cross-window `instanceof`) to
// Node.prototype and `addClass` to Element.prototype. Tests run on happy-dom,
// which lacks them.
if (typeof Node !== "undefined" && !("instanceOf" in Node.prototype)) {
  Object.defineProperty(Node.prototype, "instanceOf", {
    configurable: true, writable: true,
    value: function (this: Node, type: abstract new (...args: never[]) => unknown) { return this instanceof type; },
  });
}
if (typeof Element !== "undefined" && !("addClass" in Element.prototype)) {
  Object.defineProperty(Element.prototype, "addClass", {
    configurable: true, writable: true,
    value: function (this: Element, ...cls: string[]) { this.classList.add(...cls); },
  });
}

export {};
