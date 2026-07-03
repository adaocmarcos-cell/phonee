import { forwardRef, useId } from "react";
import { Input } from "@/components/ui/input";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Input>, "list"> & {
  options: (string | null | undefined)[];
  maxOptions?: number;
};

/**
 * Input com autocomplete sugestivo baseado em <datalist> nativo.
 * Mantém digitação livre — sugere valores previamente cadastrados no sistema.
 */
const AutocompleteInput = forwardRef<HTMLInputElement, Props>(
  ({ options, maxOptions = 100, ...props }, ref) => {
    const listId = useId();
    const clean = Array.from(
      new Set(
        (options ?? [])
          .map((o) => (o ?? "").toString().trim())
          .filter((o) => o.length > 0)
      )
    )
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .slice(0, maxOptions);
    return (
      <>
        <Input ref={ref} list={listId} autoComplete="off" {...props} />
        <datalist id={listId}>
          {clean.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </>
    );
  }
);
AutocompleteInput.displayName = "AutocompleteInput";

export default AutocompleteInput;