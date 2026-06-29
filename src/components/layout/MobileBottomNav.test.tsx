import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MobileBottomNav } from "./MobileBottomNav";

// Force isMobile=true so the nav renders during tests.
vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ setOpenMobile: vi.fn(), isMobile: true }),
}));

function renderNav() {
  return render(
    <MemoryRouter initialEntries={["/painel"]}>
      <MobileBottomNav />
    </MemoryRouter>
  );
}

function setTheme(theme: "light" | "dark" | "ocean" | "clean") {
  const root = document.documentElement;
  root.classList.remove("dark", "theme-ocean", "theme-clean");
  if (theme === "dark") root.classList.add("dark");
  if (theme === "ocean") root.classList.add("theme-ocean");
  if (theme === "clean") root.classList.add("theme-clean");
}

describe("MobileBottomNav — theme & a11y", () => {
  beforeEach(() => {
    setTheme("light");
  });

  it("uses white background in light theme and black in dark theme, swapping fast", async () => {
    renderNav();
    const list = screen.getByRole("navigation").querySelector("ul")!;

    expect(list.className).toMatch(/bg-white/);
    expect(list.className).not.toMatch(/bg-black/);

    // Rapid theme toggling — must remain consistent (no leftover classes).
    for (const t of ["dark", "light", "ocean", "clean", "dark", "light"] as const) {
      await act(async () => {
        setTheme(t);
        // allow MutationObserver + rAF to flush
        await new Promise((r) => setTimeout(r, 20));
      });
      const dark = t === "dark" || t === "ocean";
      expect(list.className).toMatch(dark ? /bg-black/ : /bg-white/);
      expect(list.className).not.toMatch(dark ? /bg-white/ : /bg-black/);
    }
  });

  it("keeps unselected labels at neutral-400 and selected at brand blue across themes", async () => {
    renderNav();
    const inicio = screen.getByLabelText("Início");
    const vendas = screen.getByLabelText("Vendas");

    for (const t of ["light", "dark"] as const) {
      await act(async () => {
        setTheme(t);
        await new Promise((r) => setTimeout(r, 10));
      });
      // Selected route "/painel" → Início
      expect(inicio.querySelector("span")!.className).toMatch(/text-\[#0EA5E9\]/);
      // Unselected → neutral-400 in both themes
      expect(vendas.querySelector("span")!.className).toMatch(/text-neutral-400/);
    }
  });

  it("exposes focus-visible ring and 44x44 hit area for accessibility", () => {
    renderNav();
    const vendas = screen.getByLabelText("Vendas");
    expect(vendas.className).toMatch(/focus-visible:ring-2/);
    expect(vendas.className).toMatch(/min-w-\[44px\]/);
    expect(vendas.className).toMatch(/min-h-\[44px\]/);
  });

  it("respects iOS safe-area via env(safe-area-inset-bottom)", () => {
    renderNav();
    const nav = screen.getByRole("navigation");
    // jsdom drops unknown css funcs from style.cssText, so check raw HTML.
    expect(nav.outerHTML).toMatch(/safe-area-inset-bottom/);
  });

  it("marks the active route with aria-current=page", () => {
    renderNav();
    expect(screen.getByLabelText("Início").getAttribute("aria-current")).toBe("page");
    expect(screen.getByLabelText("Vendas").getAttribute("aria-current")).toBeNull();
  });
});