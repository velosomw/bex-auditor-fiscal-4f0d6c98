import { Button } from "@/components/ui/button";

export type Window = "3M" | "6M" | "12M" | "ALL";

interface Props {
  value: Window;
  onChange: (w: Window) => void;
  /** Quantidade total de meses disponíveis — desabilita opções maiores. */
  available?: number;
}

const OPTIONS: { v: Window; label: string; n: number }[] = [
  { v: "3M", label: "3M", n: 3 },
  { v: "6M", label: "6M", n: 6 },
  { v: "12M", label: "12M", n: 12 },
  { v: "ALL", label: "Todos", n: Infinity },
];

export default function WindowSelector({ value, onChange, available = Infinity }: Props) {
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden">
      {OPTIONS.map(o => {
        const disabled = o.n !== Infinity && available > 0 && available < o.n;
        return (
          <Button
            key={o.v}
            type="button"
            size="sm"
            variant={value === o.v ? "default" : "ghost"}
            disabled={disabled && value !== o.v}
            onClick={() => onChange(o.v)}
            className="rounded-none h-7 px-3 text-xs"
          >
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}

/** Aplica a janela em uma lista ordenada cronologicamente (mantém os últimos N). */
export function applyWindow<T>(rows: T[], w: Window): T[] {
  if (w === "ALL") return rows;
  const n = w === "3M" ? 3 : w === "6M" ? 6 : 12;
  return rows.slice(-n);
}
