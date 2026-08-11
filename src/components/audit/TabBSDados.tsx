import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Download, AlertTriangle, CheckCircle2, Database } from "lucide-react";
import {
  buildBSDados, exportBSDadosToCSV, computeBSIndicators, buildIndicatorMemory,
  type BalanceteEntry, type BSDadosRow,
} from "@/services/bsDadosBuilder";
import type { ParsedFinancialData } from "@/services/auditAIService";
import WindowSelector, { applyWindow, type Window } from "./WindowSelector";
import EquilibrioBadge from "./EquilibrioBadge";
import MapeamentoPorGrupo from "./MapeamentoPorGrupo";

interface Props {
  parsedData: ParsedFinancialData | null;
  /** Entries originais (file + mês atribuído) — para fallback quando o parse não traz períodos */
  entries?: BalanceteEntry[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));
const fmtPct = (n: number | null) => n == null ? "—" : `${(n * 100).toFixed(1)}%`;

const tooltipMap: Record<string, string> = {
  receita_liquida: "Receita Líquida = Receita Bruta − Deduções (impostos sobre vendas, devoluções).",
  cmv: "Custo das Mercadorias/Serviços Vendidos. Sempre apresentado como negativo.",
  despesas: "Despesas operacionais (administrativas, comerciais, pessoal). Sempre negativas.",
  resultado: "Lucro/Prejuízo Líquido do período. Mantém o sinal natural.",
  ativo_circulante: "Ativos realizáveis em até 12 meses (caixa, clientes, estoques).",
  passivo_circulante: "Obrigações exigíveis em até 12 meses.",
  estoques: "Mercadorias, matérias-primas e produtos em elaboração.",
  disponivel: "Caixa, equivalentes e aplicações financeiras de liquidez imediata.",
  divida_total: "Soma de obrigações tributárias, trabalhistas, financeiras, fornecedores e credores RJ.",
};

const HeaderCell = ({ k, label }: { k: string; label: string }) => (
  <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{tooltipMap[k] ?? label}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export default function TabBSDados({ parsedData, entries = [] }: Props) {
  const allRows = useMemo(() => buildBSDados(parsedData, entries), [parsedData, entries]);
  const [windowSize, setWindowSize] = useState<Window>("ALL");
  const rows = useMemo(() => applyWindow(allRows, windowSize), [allRows, windowSize]);
  const totalErrors = rows.reduce((s, r) => s + r.errors.length, 0);

  const handleExport = () => {
    const csv = exportBSDadosToCSV(rows);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BEx_BS_Dados_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!rows.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Database className="w-10 h-10 mx-auto mb-3 opacity-40" />
          Nenhum balancete consolidado ainda. Carregue documentos e atribua o mês de referência.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-[#8B5CF6]/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="w-5 h-5 text-[#8B5CF6]" />
                BS &amp; Dados — Base Consolidada (Single Source of Truth)
              </CardTitle>
              <CardDescription className="text-xs">
                Replica a aba <strong>Dados para Gráficos</strong> do template BEX. Agrupamento por <strong>Ref 1 (Ref Capital)</strong>,
                consolidação mensal a partir do <em>Saldo Atual</em>. Esta é a fonte que alimenta gráficos, Kanitz e Relatório BEX.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {rows.length > 0 && <EquilibrioBadge row={rows[rows.length - 1]} />}
              {(() => {
                // Onda 8 — surface validation_status & confidence do último mês
                const last: any = rows[rows.length - 1];
                const vs = last?.validation_status as "ok" | "warn" | "needs_review" | undefined;
                const conf = last?.confidence_by_group as Record<string, number> | undefined;
                if (!vs || vs === "ok") return null;
                const tone = vs === "warn"
                  ? "bg-amber-500/15 text-amber-700 border-amber-500/30"
                  : "bg-red-500/15 text-red-700 border-red-500/30";
                const label = vs === "warn" ? "Validação: atenção" : "Validação: revisar";
                return (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge className={`border ${tone} cursor-help`}>
                          <AlertTriangle className="w-3 h-3 mr-1" /> {label}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm text-xs space-y-1">
                        <p className="font-semibold">Equação contábil (Ativo = Passivo + PL)</p>
                        {last?.validation_diagnostics?.desvio_pct != null && (
                          <p>Desvio: {last.validation_diagnostics.desvio_pct}%</p>
                        )}
                        {last?.validation_diagnostics?.causa && (
                          <p className="text-muted-foreground">{last.validation_diagnostics.causa}</p>
                        )}
                        {conf && (
                          <p className="text-[10px] text-muted-foreground pt-1 border-t">
                            Confiança: AC {conf.AC}% · ANC {conf.ANC}% · PC {conf.PC}% · PNC {conf.PNC}% · PL {conf.PL}%
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })()}
              {totalErrors === 0 ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Validado
                </Badge>
              ) : (
                <Badge className="bg-amber-500/15 text-amber-700 border border-amber-500/30">
                  <AlertTriangle className="w-3 h-3 mr-1" /> {totalErrors} alerta(s)
                </Badge>
              )}
              <WindowSelector value={windowSize} onChange={setWindowSize} available={allRows.length} />
              <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> Exportar CSV
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="bg-muted/30 text-[10px] uppercase tracking-wider">
                <TableHead className="font-bold">Mês</TableHead>
                <TableHead className="text-right"><HeaderCell k="ativo_circulante" label="Ativo Circ. (AC)" /></TableHead>
                <TableHead className="text-right"><HeaderCell k="passivo_circulante" label="Passivo Circ. (PC)" /></TableHead>
                <TableHead className="text-right"><HeaderCell k="estoques" label="Estoques" /></TableHead>
                <TableHead className="text-right"><HeaderCell k="disponivel" label="Disponível" /></TableHead>
                <TableHead className="text-right font-bold"><HeaderCell k="divida_total" label="Dívida Total" /></TableHead>
                <TableHead className="text-right text-accent font-bold">LC</TableHead>
                <TableHead className="text-right text-accent font-bold">LS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => {
                const ind = computeBSIndicators(r);
                const hasError = r.errors.length > 0;
                return (
                  <TableRow key={r.mesKey} className={hasError ? "bg-amber-50/40" : ""}>
                    <TableCell className="font-semibold whitespace-nowrap">
                      {r.mes}
                      {hasError && (
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 inline ml-1.5" />
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">{r.errors.join(" • ")}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.ativo_circulante)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.passivo_circulante)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.estoques)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.disponivel)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(r.divida_total)}</TableCell>
                    <TableCell className="text-right tabular-nums font-bold text-accent">
                      <MemoryCell row={r} indicador="Liquidez Corrente" value={ind.liquidez_corrente} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-bold text-accent">
                      <MemoryCell row={r} indicador="Liquidez Seca" value={ind.liquidez_seca} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Demonstração de Resultado e Performance (R$)</CardTitle>
          <CardDescription className="text-xs">
            Acompanhamento mensal da Receita e Geração de Resultado. 
            <strong> Nota:</strong> Os valores correspondem à variação mensal real.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Mês</TableHead>
                <TableHead className="text-right"><HeaderCell k="receita_liquida" label="Receita Líq." /></TableHead>
                <TableHead className="text-right"><HeaderCell k="cmv" label="CMV" /></TableHead>
                <TableHead className="text-right"><HeaderCell k="despesas" label="Despesas" /></TableHead>
                <TableHead className="text-right"><HeaderCell k="resultado" label="Resultado Líq." /></TableHead>
                <TableHead className="text-right">% Margem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => {
                const ind = computeBSIndicators(r);
                return (
                  <TableRow key={`dre-${r.mesKey}`}>
                    <TableCell className="font-semibold">{r.mes}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmt(r.receita_liquida)}</TableCell>
                    <TableCell className="text-right tabular-nums text-red-600">{fmt(r.cmv)}</TableCell>
                    <TableCell className="text-right tabular-nums text-red-600">{fmt(r.despesas)}</TableCell>
                    <TableCell className={`text-right tabular-nums font-bold ${r.resultado < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {fmt(r.resultado)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPct(ind.resultado_percent)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Componentes da Dívida (módulo, R$)</CardTitle>
          <CardDescription className="text-xs">
            Detalhamento das obrigações por natureza, agrupadas conforme <em>Ref 1 (Ref Capital)</em>.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Tributário</TableHead>
                <TableHead className="text-right">Trabalhista</TableHead>
                <TableHead className="text-right">Financeiro</TableHead>
                <TableHead className="text-right">Fornecedores</TableHead>
                <TableHead className="text-right">Credores RJ</TableHead>
                <TableHead className="text-right font-bold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={`d-${r.mesKey}`}>
                  <TableCell className="font-semibold">{r.mes}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.divida_tributaria)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.divida_trabalhista)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.divida_financeira)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.fornecedores)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.credores_rj)}</TableCell>
                  <TableCell className="text-right tabular-nums font-bold">{fmt(r.divida_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <MapeamentoPorGrupo rows={rows} />
    </div>
  );
}

/** Tooltip de memória de cálculo para um indicador (numerador, denominador, fórmula, origem). */
function MemoryCell({ row, indicador, value }: { row: BSDadosRow; indicador: string; value: number | null }) {
  const memorias = buildIndicatorMemory(row);
  const mem = memorias.find(m => m.indicador === indicador);
  if (!mem) return <span>{value == null ? "—" : value.toFixed(2)}</span>;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help underline decoration-dotted decoration-accent/50 underline-offset-4">
            {value == null ? "—" : value.toFixed(2)}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm text-[11px] space-y-1">
          <div className="font-semibold">{mem.indicador} = {mem.resultado == null ? "—" : mem.resultado.toFixed(2)}</div>
          <div className="text-muted-foreground">Fórmula: <span className="font-mono">{mem.formula}</span></div>
          <div className="border-t pt-1">
            <div><strong>Numerador</strong> ({mem.numerador.rotulo}): {fmt(mem.numerador.valor)}</div>
            <div className="text-muted-foreground text-[10px]">↳ origem: {mem.numerador.origem}</div>
          </div>
          <div>
            <div><strong>Denominador</strong> ({mem.denominador.rotulo}): {fmt(mem.denominador.valor)}</div>
            <div className="text-muted-foreground text-[10px]">↳ origem: {mem.denominador.origem}</div>
          </div>
          {mem.classificacao && <div className="border-t pt-1 text-accent">Classificação: {mem.classificacao}</div>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
