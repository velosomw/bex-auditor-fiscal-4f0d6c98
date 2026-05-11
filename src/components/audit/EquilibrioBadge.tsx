import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { BSDadosRow } from "@/services/bsDadosBuilder";

interface Props {
  row: BSDadosRow;
  /** Tolerância relativa (default 0,5%). */
  tolerance?: number;
}

/**
 * Badge "Ativo = Passivo + PL" (regra contábil obrigatória).
 * Como BS & Dados consolida apenas o circulante + componentes de dívida,
 * usamos a melhor aproximação disponível: AC ≈ PC + (Capital/Resultado proxy).
 * Verde se Δ ≤ tolerance; vermelho caso contrário.
 */
export default function EquilibrioBadge({ row, tolerance = 0.005 }: Props) {
  const ativo = row.ativo_circulante;
  const passivoPl = row.passivo_circulante + Math.abs(row.resultado);
  if (ativo === 0 && passivoPl === 0) return null;
  const ref = Math.max(ativo, passivoPl, 1);
  const diff = Math.abs(ativo - passivoPl);
  const ratio = diff / ref;
  const ok = ratio <= tolerance;
  const fmt = (n: number) =>
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(n));

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            className={
              ok
                ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30"
                : "bg-red-500/15 text-red-700 border border-red-500/30"
            }
          >
            {ok ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
            A=P+PL {ok ? "✓" : `Δ ${(ratio * 100).toFixed(2)}%`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="text-xs space-y-0.5">
          <div>Ativo Circulante: R$ {fmt(ativo)}</div>
          <div>Passivo + PL (proxy): R$ {fmt(passivoPl)}</div>
          <div>Diferença: R$ {fmt(diff)} ({(ratio * 100).toFixed(2)}%)</div>
          <div className="opacity-70">Tolerância: {(tolerance * 100).toFixed(1)}%</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
