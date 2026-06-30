import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import Landing from "./Landing";

// jsdom polyfill
class IO { observe(){} unobserve(){} disconnect(){} takeRecords(){return []} }
// @ts-ignore
globalThis.IntersectionObserver = globalThis.IntersectionObserver || IO;

vi.mock("@/lib/trackVisit", () => ({ trackPageVisit: vi.fn() }));
const trackMetaEvent = vi.fn();
vi.mock("@/lib/metaPixel", () => ({ trackMetaEvent: (...a: any[]) => trackMetaEvent(...a) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) } },
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderLanding(initial = "/") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/" element={<><Landing /><LocationProbe /></>} />
        <Route path="/testegratis" element={<div data-testid="testegratis-page">trial-flow</div>} />
        <Route path="/comprar" element={<div data-testid="comprar-page">comprar</div>} />
        <Route path="/entrar" element={<div data-testid="entrar-page">entrar</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Landing — Trial CTA & footer CTAs", () => {
  beforeEach(() => trackMetaEvent.mockClear());

  it("Trial CTA renders text (no literal \\n) and links to /testegratis", () => {
    renderLanding();
    const cta = screen.getByRole("link", { name: /experimente grátis por 7 dias/i });
    expect(cta).toHaveAttribute("href", "/testegratis");
    expect(cta.textContent).not.toMatch(/\\n/);
    expect(cta.textContent?.toLowerCase()).toContain("experimente grátis");
  });

  it("Click navigates to /testegratis and fires a single Lead event", () => {
    renderLanding();
    const cta = screen.getByRole("link", { name: /experimente grátis por 7 dias/i });
    fireEvent.click(cta);
    expect(screen.getByTestId("testegratis-page")).toBeInTheDocument();
    const leadCalls = trackMetaEvent.mock.calls.filter((c) => c[0] === "Lead");
    expect(leadCalls.length).toBe(1);
  });

  it("Keyboard activation (Enter) follows the same single-event flow", () => {
    renderLanding();
    const cta = screen.getByRole("link", { name: /experimente grátis por 7 dias/i });
    cta.focus();
    // jsdom: Enter on an <a href> triggers click via default action; simulate explicitly.
    fireEvent.keyDown(cta, { key: "Enter", code: "Enter" });
    fireEvent.click(cta);
    expect(screen.getByTestId("testegratis-page")).toBeInTheDocument();
    const leadCalls = trackMetaEvent.mock.calls.filter((c) => c[0] === "Lead");
    expect(leadCalls.length).toBe(1);
  });

  it("Footer CTAs are keyboard-focusable links with correct destinations", () => {
    renderLanding();
    const buy = screen.getAllByRole("link", { name: /comprar agora/i })[0];
    const login = screen.getAllByRole("link", { name: /fazer login/i })[0];
    expect(buy).toHaveAttribute("href", "/comprar?plano=annual");
    expect(login).toHaveAttribute("href", "/entrar");
    buy.focus(); expect(document.activeElement).toBe(buy);
    login.focus(); expect(document.activeElement).toBe(login);
  });
});