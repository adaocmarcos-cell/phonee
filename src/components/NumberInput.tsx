import { forwardRef, useEffect, useRef, useState, InputHTMLAttributes, FocusEvent, ChangeEvent } from "react";
import { Input } from "@/components/ui/input";

export type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (n: number) => void;
  min?: number;
  allowDecimal?: boolean;
  /** When blur leaves the field empty: "min" uses min (default 1 if unset), "zero" uses 0. Default: "zero". */
  emptyBehavior?: "zero" | "min";
};

function numberToText(n: number | null | undefined, allowDecimal: boolean): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  if (n === 0) return "";
  if (!allowDecimal) return String(Math.trunc(n));
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseText(text: string, allowDecimal: boolean): number | null {
  if (text == null) return null;
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "," || trimmed === ".") return null;
  const normalized = trimmed.replace(/\./g, (m, i, s) => {
    // keep dots as decimal only if there's no comma in string
    return s.includes(",") ? "" : m;
  }).replace(",", ".");
  const n = allowDecimal ? parseFloat(normalized) : parseInt(normalized, 10);
  if (Number.isNaN(n)) return null;
  return n;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onValueChange, min, allowDecimal = true, emptyBehavior = "zero", onFocus, onBlur, onKeyDown, inputMode, ...rest },
  ref
) {
  const [text, setText] = useState<string>(() => numberToText(value, allowDecimal));
  const focusedRef = useRef(false);

  // Sync from external value changes (but not while user is actively typing)
  useEffect(() => {
    if (focusedRef.current) return;
    setText(numberToText(value, allowDecimal));
  }, [value, allowDecimal]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow only digits, one separator, optional leading minus (if min < 0)
    const allowNeg = min === undefined || min < 0;
    let cleaned = raw.replace(/[^\d.,-]/g, "");
    if (!allowNeg) cleaned = cleaned.replace(/-/g, "");
    if (!allowDecimal) cleaned = cleaned.replace(/[.,]/g, "");
    setText(cleaned);
    const parsed = parseText(cleaned, allowDecimal);
    if (parsed === null) {
      // Empty / intermediate — propagate 0 so downstream calc doesn't NaN
      onValueChange(0);
    } else {
      onValueChange(parsed);
    }
  };

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    focusedRef.current = true;
    // Show current numeric value on focus if state is empty but value !=0? Keep as-is.
    try { e.target.select(); } catch { /* noop */ }
    onFocus?.(e);
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    focusedRef.current = false;
    const parsed = parseText(text, allowDecimal);
    let finalNum: number;
    if (parsed === null) {
      if (emptyBehavior === "min") finalNum = min ?? 1;
      else finalNum = 0;
    } else {
      finalNum = parsed;
      if (min !== undefined && finalNum < min) finalNum = min;
    }
    onValueChange(finalNum);
    setText(numberToText(finalNum, allowDecimal));
    onBlur?.(e);
  };

  return (
    <Input
      ref={ref}
      type="text"
      inputMode={inputMode ?? (allowDecimal ? "decimal" : "numeric")}
      value={text}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={onKeyDown}
      {...rest}
    />
  );
});

export default NumberInput;