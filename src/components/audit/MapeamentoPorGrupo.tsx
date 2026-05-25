/**
 * Mapeamento por Grupo — Painel de Auditoria Explicável.
 *
 * Para cada mês e cada grupo contábil (2 dígitos), mostra:
 *  - Valor declarado pela linha totalizadora (Camada A — subtotal autoritativo)
 *  - Soma das folhas descendentes (drill-down, Camada B)
 *  - Camada usada (A / B / C — regex fallback)
 *  - Divergência percentual e status trifásico (1% / 3% / >3%)
 *
 * Este é o ponto de transparência que permite auditar visualmente se
 * o classificador acertou em qualquer balancete novo.
 */
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, AlertTriangle, XCircle, Info, Layers } from "lucide-react";
import type { BSDadosRow, GroupMappingEntry, GroupMappingStatus } from "@/services/bsDadosBuilder";

const fmt = (n?: number) =>
  n == null ? "—" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));

const statusMeta: Record<GroupMappingStatus, { label: string; icon: React.ReactNode; cls: string }> = {
  ok:         { label: "OK",       icon: <CheckCircle2 className="w-3 h-3" />, cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  atencao:    { label: "Atenção",  icon: <AlertTriangle className="w-3 h-3" />, cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  erro:       { label: "Erro",     icon: <XCircle className="w-3 h-3" />, cls: "bg-red-500/15 text-red-700 border-red-500/30" },
  sem_total:  { label: "Sem GT",   icon: <Info className="w-3 h-3" />, cls: "bg-slate-500/15 text-slate-700 border-slate-500/30" },
};

const camadaMeta: Record<GroupMappingEntry["camada"], string> = {
  A: "A — Subtotal declarado (autoritativo)",
  B: "B — Drill-down de folhas",
  C: "C — Fallback regex (sem totalizador)",
};

export default function MapeamentoPorGrupo({ rows }: { rows: BSDadosRow[] }) {
  const monthsWithGroups = rows.filter(r => r.grupos && r.grupos.length > 0);
  if (!monthsWithGroups.length) return null;

  return (
    <Card className="border-[hsl(217,91%,50%)]/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="w-4 h-4 text-[hsl(217,91%,50%)]" />
          Mapeamento por Grupo — Trilha de Auditoria Explicável
        </CardTitle>
        <CardDescription className="text-xs">
          Para cada grupo contábil (2 dígitos), comparamos o <strong>valor declarado</strong> pela linha
          totalizadora com a <strong>soma das folhas</strong> descendentes. Semáforo trifásico:
          <Badge variant="outline" className="ml-1 text-[10px] border-emerald-500/40 text-emerald-700">≤ 1% OK</Badge>{" "}
          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700">1–3% Atenção</Badge>{" "}
          <Badge variant="outline" className="text-[10px] border-red-500/40 text-red-700">&gt; 3% Erro</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {monthsWithGroups.map(r => (
          <div key={r.mesKey} className="space-y-2">
            <div className="text-sm font-semibold text-foreground/80">{r.mes}</div>
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="bg-muted/30 text-[10px] uppercase tracking-wider">
                    <TableHead>Grupo</TableHead>
                    <TableHead>Rótulo</TableHead>
                    <TableHead className="text-right">Declarado (GT)</TableHead>
                    <TableHead className="text-right">Calculado (folhas)</TableHead>
                    <TableHead className="text-right">Δ %</TableHead>
                    <TableHead>Camada</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.grupos!.map(g => {
                    const meta = statusMeta[g.status];
                    return (
                      <TableRow key={`${r.mesKey}-${g.grupo}`}>
                        <TableCell className="font-mono font-semibold">{g.grupo}</TableCell>
                        <TableCell>{g.rotulo}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(g.declarado)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(g.calculado)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {g.declarado == null ? "—" : `${(g.desvioPct * 100).toFixed(2)}%`}
                        </TableCell>
                        <TableCell title={camadaMeta[g.camada]} className="font-mono text-[11px]">{g.camada}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] gap-1 ${meta.cls}`}>
                            {meta.icon} {meta.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
        <p className="text-[10px] text-muted-foreground border-t pt-2">
          <strong>Camada A</strong> usa o subtotal autoritativo da linha-totalizadora.{" "}
          <strong>Camada B</strong> usa drill-down quando o GT está presente (folhas alimentam
          sub-componentes, agregado vem do GT).{" "}
          <strong>Camada C</strong> é fallback regex quando nenhum totalizador foi encontrado.
        </p>
      </CardContent>
    </Card>
  );
}
