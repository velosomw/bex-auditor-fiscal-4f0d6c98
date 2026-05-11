/**
 * Dashboard Executivo — 6 gráficos pixel-perfect Excel via Apache ECharts.
 * Layout: grid 2 colunas, altura 320px, gap 16px (padrão MD 1).
 */
import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info, TrendingDown } from "lucide-react";
import { buildMonthlyDataset } from "@/services/auditDatasetBuilder";
import { buildBSDados, type BalanceteEntry } from "@/services/bsDadosBuilder";
import { bsDadosToMonthlyDataset } from "@/services/bsDadosToMonthlyDatum";
import {
  buildCMVOption, buildCMVDespesaOption, buildResultadoOption,
  buildEBITDAOption, buildLiquidezOption, buildEndividamentoOption,
  generateInsights,
} from "@/services/auditChartsOptions";
import type { ParsedFinancialData } from "@/services/auditAIService";

interface Props {
  parsedData?: ParsedFinancialData | null;
  /** Entradas (arquivo + mês atribuído pelo usuário) — alimentam BS & Dados como fonte única. */
  entries?: BalanceteEntry[];
}

const Empty = ({ msg }: { msg: string }) => (
  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
    <AlertTriangle className="w-6 h-6 mb-2 opacity-50" />
    <p className="text-xs">{msg}</p>
  </div>
);

const ChartTile = ({ option }: { option: any }) => (
  <Card className="overflow-hidden">
    <CardContent className="p-4">
      <ReactECharts
        option={option}
        style={{ height: 320, width: "100%" }}
        opts={{ renderer: "canvas" }}
        notMerge
        lazyUpdate
      />
    </CardContent>
  </Card>
);

const AuditCharts: React.FC<Props> = ({ parsedData, entries = [] }) => {
  // FONTE ÚNICA: BS & Dados (Ref Capital). Fallback para builder antigo se vazio.
  const dataset = useMemo(() => {
    const bs = buildBSDados(parsedData ?? null, entries);
    if (bs.length) return bsDadosToMonthlyDataset(bs);
    return buildMonthlyDataset(parsedData ?? null);
  }, [parsedData, entries]);

  const options = useMemo(() => {
    if (!dataset.length) return null;
    return {
      cmv: buildCMVOption(dataset),
      cmvDesp: buildCMVDespesaOption(dataset),
      resultado: buildResultadoOption(dataset),
      ebitda: buildEBITDAOption(dataset),
      liquidez: buildLiquidezOption(dataset),
      endividamento: buildEndividamentoOption(dataset),
    };
  }, [dataset]);

  const insights = useMemo(() => generateInsights(dataset), [dataset]);

  if (!dataset.length || !options) {
    return (
      <Card>
        <CardContent className="py-10">
          <Empty msg="Carregue um balancete na fase de processamento para gerar os gráficos." />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* INSIGHTS automáticos */}
      {insights.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Info className="w-4 h-4 text-[hsl(217,91%,50%)]" />
              <span className="text-sm font-semibold">Auto-Interpretação IA</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {insights.map((i, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className={
                    i.tipo === "critico"
                      ? "bg-[hsl(0,75%,55%)]/10 border-[hsl(0,75%,55%)]/40 text-[hsl(0,75%,40%)]"
                      : i.tipo === "atencao"
                      ? "bg-[hsl(34,95%,55%)]/10 border-[hsl(34,95%,55%)]/40 text-[hsl(30,95%,40%)]"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {i.tipo === "critico" && <TrendingDown className="w-3 h-3 mr-1" />}
                  {i.texto}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* GRID 2x3 — pixel perfect Excel */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
      >
        <ChartTile option={options.cmv} />
        <ChartTile option={options.cmvDesp} />
        <ChartTile option={options.resultado} />
        <ChartTile option={options.ebitda} />
        <ChartTile option={options.liquidez} />
        <ChartTile option={options.endividamento} />
      </div>
    </div>
  );
};

export default AuditCharts;
