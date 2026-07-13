import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { NumberInput } from "./NumberInput";

function Harness({ initial = 0, allowDecimal = true, emptyBehavior = "zero" as "zero" | "min", min }: any) {
  const [v, setV] = useState<number>(initial);
  return (
    <>
      <NumberInput
        aria-label="num"
        value={v}
        onValueChange={setV}
        allowDecimal={allowDecimal}
        emptyBehavior={emptyBehavior}
        min={min}
      />
      <span data-testid="value">{v}</span>
    </>
  );
}

describe("NumberInput", () => {
  it("abre vazio quando o valor inicial é 0", () => {
    render(<Harness initial={0} />);
    const input = screen.getByLabelText("num") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("permite apagar o valor sem snap-back para 1 quando emptyBehavior=zero", () => {
    render(<Harness initial={5} allowDecimal={false} emptyBehavior="zero" min={0} />);
    const input = screen.getByLabelText("num") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input.value).toBe("");
    expect(screen.getByTestId("value").textContent).toBe("0");
  });

  it("faz snap para min quando emptyBehavior=min", () => {
    render(<Harness initial={5} allowDecimal={false} emptyBehavior="min" min={1} />);
    const input = screen.getByLabelText("num") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(screen.getByTestId("value").textContent).toBe("1");
  });

  it("formata valor decimal em pt-BR no blur", () => {
    render(<Harness initial={0} allowDecimal />);
    const input = screen.getByLabelText("num") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1234,5" } });
    fireEvent.blur(input);
    expect(input.value).toBe("1.234,50");
    expect(screen.getByTestId("value").textContent).toBe("1234.5");
  });

  it("respeita min ao digitar abaixo do mínimo (snap no blur)", () => {
    render(<Harness initial={10} allowDecimal={false} min={5} />);
    const input = screen.getByLabelText("num") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.blur(input);
    expect(screen.getByTestId("value").textContent).toBe("5");
  });

  it("ignora caracteres não-numéricos quando allowDecimal=false", () => {
    const onChange = vi.fn();
    function Wrap() {
      const [v, setV] = useState(0);
      return (
        <NumberInput
          aria-label="qty"
          value={v}
          onValueChange={(n) => { setV(n); onChange(n); }}
          allowDecimal={false}
          min={0}
        />
      );
    }
    render(<Wrap />);
    const input = screen.getByLabelText("qty") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12,3abc" } });
    expect(input.value).toBe("123");
  });
});