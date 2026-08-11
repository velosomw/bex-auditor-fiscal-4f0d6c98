import { useState } from "react";
import { ChevronDown, ChevronUp, Lock, Sliders } from "lucide-react";
import type { DedupConfig, DedupOptions, DedupDataKind } from "@/services/auditAIService";

interface Props {
  value: DedupConfig;
  onChange: (cfg: DedupConfig) => void;
  disabled?: boolean;
  lockedMessage?: string;
}

const DATA_KINDS: { id: DedupDataKind; label: string; hint: string }[] = [
  { id: "auto", label: "Auto (recomendado)", hint: "Detecta a escala pela mediana dos valores" },
  { id: "balanco", label: "Balanço (BRL)", hint: "eps=0,01 · 2 casas · relTol 1e-5" },
  { id: "dre", label: "DRE (BRL)", hint: "eps=0,01 · 2 casas · relTol 1e-5" },
  { id: "indice", label: "Índice/%", hint: "eps=1e-4 · 4 casas · relTol 1e-4" },
  { id: "unidade", label: "R$ mil/milhão", hint: "eps=1 · 0 casas · relTol 1e-5" },
];

const targets: { key: keyof DedupConfig; title: string }[] = [
  { key: "balanco", title: "Balanço" },
  { key: "dre", title: "DRE" },
];

const Field = ({
  label,
  hint,
  value,
  onChange,
  step,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: string;
  placeholder?: string;
}) => (
  <label className="block">
    <span className="text-[11px] font-medium text-foreground">{label}</span>
    {hint && <span className="block text-[10px] text-muted-foreground">{hint}</span>}
    <input
      type="number"
      step={step}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? undefined : Number(v));
      }}
      className="mt-1 w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-[#8B5CF6]"
    />
  </label>
);

const KindBlock = ({
  title,
  opts,
  onChange,
}: {
  title: string;
  opts: DedupOptions;
  onChange: (o: DedupOptions) => void;
}) => {
  const kind = opts.dataKind ?? "auto";
  return (
    <div className="rounded-xl border border-border p-3 space-y-3 bg-muted/20">
      <p className="text-xs font-semibold text-foreground">{title}</p>

      <div className="flex flex-wrap gap-1.5">
        {DATA_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            title={k.hint}
            onClick={() => onChange({ ...opts, dataKind: k.id })}
            className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${
              kind === k.id
                ? "bg-[#8B5CF6] text-white border-[#8B5CF6]"
                : "bg-background text-foreground border-border hover:border-[#8B5CF6]/40"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field
          label="eps (tolerância absoluta)"
          hint="Vazio = preset"
          step="any"
          value={opts.eps}
          onChange={(v) => onChange({ ...opts, eps: v })}
          placeholder="ex.: 0.01"
        />
        <Field
          label="decimals (arredondamento)"
          hint="Vazio = preset"
          step="1"
          value={opts.decimals}
          onChange={(v) => onChange({ ...opts, decimals: v })}
          placeholder="ex.: 2"
        />
        <Field
          label="proxWindow (linhas)"
          hint="Janela de proximidade"
          step="1"
          value={opts.proxWindow}
          onChange={(v) => onChange({ ...opts, proxWindow: v })}
          placeholder="ex.: 3"
        />
        <Field
          label="relTol (tolerância relativa)"
          hint="Ex.: 1e-5"
          step="any"
          value={opts.relTol}
          onChange={(v) => onChange({ ...opts, relTol: v })}
          placeholder="ex.: 0.00001"
        />
      </div>
    </div>
  );
};

export const DedupPresetForm = ({ value, onChange, disabled = false, lockedMessage }: Props) => {
  const [open, setOpen] = useState(false);

  if (disabled) {
    return (
      <div
        className="border border-border rounded-xl bg-muted/30 opacity-70 cursor-not-allowed"
        title={lockedMessage || "Disponível em planos pagos"}
      >
        <div className="w-full flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Deduplicação avançada</p>
              <p className="text-[11px] text-muted-foreground">
                {lockedMessage || "Disponível em planos pagos — faça upgrade para liberar."}
              </p>
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded-full px-2 py-0.5">
            Plano pago
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl bg-background">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#8B5CF6]" />
          <div>
            <p className="text-sm font-semibold text-foreground">Deduplicação avançada</p>
            <p className="text-[11px] text-muted-foreground">
              Ajustes finos por tipo de dado (balanço/DRE) — opcional
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {targets.map((t) => (
            <KindBlock
              key={t.key}
              title={t.title}
              opts={value[t.key] ?? { dataKind: "auto" }}
              onChange={(o) => onChange({ ...value, [t.key]: o })}
            />
          ))}
          <button
            type="button"
            onClick={() => onChange({})}
            className="text-[11px] text-muted-foreground hover:text-foreground underline"
          >
            Restaurar padrões
          </button>
        </div>
      )}
    </div>
  );
};
