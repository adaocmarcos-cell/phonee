import "@testing-library/jest-dom";

// jsdom doesn't implement ResizeObserver — required by Radix primitives (Select, Switch, etc.)
if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom lacks PointerEvent / scrollIntoView used by Radix Select.
if (typeof (globalThis as any).PointerEvent === "undefined") {
  (globalThis as any).PointerEvent = class extends Event {
    constructor(type: string, props: any = {}) { super(type, props); }
  } as any;
}
if (typeof (Element.prototype as any).scrollIntoView === "undefined") {
  (Element.prototype as any).scrollIntoView = function () {};
}
if (typeof (Element.prototype as any).hasPointerCapture === "undefined") {
  (Element.prototype as any).hasPointerCapture = function () { return false; };
}
if (typeof (Element.prototype as any).releasePointerCapture === "undefined") {
  (Element.prototype as any).releasePointerCapture = function () {};
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
