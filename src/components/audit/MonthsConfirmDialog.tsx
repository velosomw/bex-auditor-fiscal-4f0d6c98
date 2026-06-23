import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { MultiMonthParsed } from "@/services/auditMonthDetector";
import { defaultLast3 } from "@/services/auditMonthDetector";

interface MonthsConfirmDialogProps {
  open: boolean;
  data: MultiMonthParsed | null;
  onConfirm: (selectedMonthKeys: string[]) => void;
  onCancel: () => void;
}

const sourceLabel = (s: string) =>
  s === "filename" ? "nome do arquivo" : s === "header" ? "cabeçalho" : "padrão";

const sourceColor = (s: string) =>
  s === "filename" || s === "header" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
  : "bg-amber-500/15 text-amber-400 border-amber-500/30";

const MAX_AUDIT_MONTHS = 3;

export const MonthsConfirmDialog = ({ open, data, onConfirm, onCancel }: MonthsConfirmDialogProps) => {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    // Regra: auditoria considera SOMENTE os últimos 3 meses identificados.
    if (data) setSelected(defaultLast3(data));
  }, [data]);

  const totalMonths = data?.months.length || 0;
  const tooFew = totalMonths < 1;
  const lowConf = (data?.months || []).filter(m => m.confidence < 0.7);
  const truncated = totalMonths > MAX_AUDIT_MONTHS;

  const toggle = (key: string) => {
    setSelected(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      // Cap em 3: se já atingiu, remove o mais antigo selecionado para abrir espaço.
      if (prev.length >= MAX_AUDIT_MONTHS) {
        const sorted = [...prev].sort();
        return [...sorted.slice(1), key];
      }
      return [...prev, key];
    });
  };

  const ordered = useMemo(() => [...(data?.months || [])].sort((a,b) => b.key.localeCompare(a.key)), [data]);
  const canConfirm = selected.length >= 1 && selected.length <= MAX_AUDIT_MONTHS;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[hsl(217,91%,60%)]" />
            Confirme os meses detectados
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-2">
             A IA detectou {totalMonths} {totalMonths === 1 ? "período" : "períodos"} nos arquivos.
             Selecione os meses para o diagnóstico (sugestão: os mais recentes já marcados).
          </p>
        </DialogHeader>

        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
          {/* Resumo por arquivo */}
          {(data?.perFileMonths || []).length > 0 && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Arquivos processados</p>
              {data!.perFileMonths.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate flex-1">{f.fileName}</span>
                  <span className="text-muted-foreground">
                    {f.months.length === 0 ? "— sem período" : f.months.map(m => m.label).join(", ")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Lista de meses */}
          <div className="space-y-1.5">
            {ordered.map((m) => {
              const checked = selected.includes(m.key);
              return (
                <label
                  key={m.key}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                    checked
                      ? "border-[hsl(217,91%,60%)] bg-[hsl(217,91%,60%)]/10"
                      : "border-border bg-card hover:border-border/70"
                  }`}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(m.key)} />
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{m.label}</span>
                    <Badge variant="outline" className={`text-[10px] ${sourceColor(m.source)}`}>
                      via {sourceLabel(m.source)}
                    </Badge>
                    {m.confidence < 0.7 && (
                      <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30">
                        baixa confiança
                      </Badge>
                    )}
                  </div>
                  {checked && <CheckCircle2 className="w-4 h-4 text-[hsl(217,91%,60%)]" />}
                </label>
              );
            })}
          </div>

          {/* Avisos */}
          {tooFew && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span className="text-red-400">Nenhum período detectado. Verifique o nome dos arquivos (ex: <code>balancete_03_2024.xlsx</code>).</span>
            </div>
          )}
          {lowConf.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span className="text-amber-400">{lowConf.length} período(s) com baixa confiança — confira se a data está correta antes de prosseguir.</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {selected.length} {selected.length === 1 ? "mês selecionado" : "meses selecionados"}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>Cancelar</Button>
            <Button
              className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,40%)] text-white"
              disabled={!canConfirm}
              onClick={() => onConfirm(selected.sort())}
            >
              Continuar análise ({selected.length})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MonthsConfirmDialog;
