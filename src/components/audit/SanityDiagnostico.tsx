/**
 * Sanity diagnostic banner — surfaces data-quality issues detected during
 * client-side dataset construction so users understand why charts/Kanitz
 * may look empty or distorted. Mirrors server-side checks
 * (EQ_BREAK, CAP_ESTOQUES, Kanitz bloqueado) from audit-bs-dados.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { MonthlyDatum } from "@/services/auditDatasetBuilder";

interface Issue {
  level: "critico" | "atencao" | "info";
  mes?: string;
  titulo: string;
  detalhe: string;
}

export default function SanityDiagnostico({
  dataset,
}: {
  dataset: MonthlyDatum[];
}) {
  if (!dataset.length) return null;

  const issues: Issue[] = [];

  // Receita ausente → bloqueia Kanitz (X1=LL/PL precisa de LL da DRE)
  const semReceita = dataset.filter((d) => !d.hasReceita);
  if (semReceita.length === dataset.length) {
    issues.push({
      level: "critico",
      titulo: "DRE ausente em todos os meses",
      detalhe:
        "Sem Receita/Resultado, o modelo Kanitz fica bloqueado (X1=LL/PL não é calculável). " +
        "Reenvie incluindo a DRE para liberar Kanitz, EBITDA e margens.",
    });
  } else if (semReceita.length > 0) {
    issues.push({
      level: "atencao",
      titulo: `DRE ausente em ${semReceita.length} mês(es)`,
      detalhe: `Meses sem receita: ${semReceita.map((d) => d.mes).join(", ")}.`,
    });
  }

  // Balanço ausente
  const semBalanco = dataset.filter((d) => !d.hasBalanco);
  if (semBalanco.length === dataset.length) {
    issues.push({
      level: "critico",
      titulo: "Balanço Patrimonial ausente",
      detalhe:
        "Liquidez, endividamento e Kanitz dependem do Balanço. Reenvie o template BEX completo com Ativo/Passivo/PL separados.",
    });
  }

  // Estoques inflados (>85% do AC) — espelha CAP_ESTOQUES do servidor
  for (const d of dataset) {
    if (d.estoques > 0 && d.ativo_circulante > 0) {
      const pct = (d.estoques / d.ativo_circulante) * 100;
      if (pct > 85) {
        issues.push({
          level: "atencao",
          mes: d.mes,
          titulo: `Estoques inflados em ${d.mes}`,
          detalhe: `Estoques representam ${pct.toFixed(1)}% do Ativo Circulante. Possível dupla contagem de contas analíticas/sintéticas. Cap automático aplicado a 65%.`,
        });
      }
    }
  }

  // Equação contábil aproximada — sem PL no dataset cliente, só validamos magnitudes
  for (const d of dataset) {
    const ativoTotal = d.ativo_circulante + d.ativo_nao_circulante;
    const passivoTotal = d.passivo_circulante + d.passivo_nao_circulante;
    if (ativoTotal > 0 && passivoTotal > ativoTotal * 1.5) {
      const desvio = ((passivoTotal - ativoTotal) / ativoTotal) * 100;
      issues.push({
        level: "critico",
        mes: d.mes,
        titulo: `Equação contábil rompida em ${d.mes}`,
        detalhe: `Passivo+PL aparente (${(passivoTotal / 1000).toFixed(0)}k) muito superior ao Ativo (${(ativoTotal / 1000).toFixed(0)}k) — desvio ${desvio.toFixed(0)}%. Indica contas sintéticas sendo somadas junto com analíticas. Reenvie usando template BEX padrão.`,
      });
    }
  }

  // Dívida total > Passivo Total (cap server-side já aplicado)
  for (const d of dataset) {
    const passivoTotal = d.passivo_circulante + d.passivo_nao_circulante;
    if (passivoTotal > 0 && d.divida_total > passivoTotal * 1.1) {
      issues.push({
        level: "atencao",
        mes: d.mes,
        titulo: `Dívida excede Passivo Total em ${d.mes}`,
        detalhe: `Dívida agregada (${(d.divida_total / 1000).toFixed(0)}k) maior que Passivo Total (${(passivoTotal / 1000).toFixed(0)}k). Verifique se há credores RJ ou fornecedores duplicados.`,
      });
    }
  }

  if (!issues.length) {
    return (
      <Card className="bg-emerald-50/50 border-emerald-200/60 dark:bg-emerald-950/20 dark:border-emerald-900/40">
        <CardContent className="p-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
            Diagnóstico de Sanity: nenhum desvio relevante detectado nos dados extraídos.
          </span>
        </CardContent>
      </Card>
    );
  }

  const criticos = issues.filter((i) => i.level === "critico").length;
  const atencoes = issues.filter((i) => i.level === "atencao").length;

  return (
    <Card className="bg-amber-50/60 border-amber-200/60 dark:bg-amber-950/20 dark:border-amber-900/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-semibold">
            Diagnóstico de Sanity da Extração
          </span>
          {criticos > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {criticos} crítico(s)
            </Badge>
          )}
          {atencoes > 0 && (
            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">
              {atencoes} atenção
            </Badge>
          )}
        </div>
        <ul className="space-y-2 text-xs">
          {issues.map((i, idx) => (
            <li key={idx} className="flex gap-2">
              <Info
                className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                  i.level === "critico" ? "text-red-600" : "text-amber-600"
                }`}
              />
              <div>
                <div className="font-medium">{i.titulo}</div>
                <div className="text-muted-foreground">{i.detalhe}</div>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-muted-foreground border-t pt-2">
          Estes sinalizadores espelham as validações do motor de auditoria
          (CPC 26 R1 §54 / NBC TG 26). Os caps são aplicados automaticamente
          para preservar a leitura dos gráficos, mas a correção definitiva
          requer reenviar o balancete no template BEX.
        </p>
      </CardContent>
    </Card>
  );
}
