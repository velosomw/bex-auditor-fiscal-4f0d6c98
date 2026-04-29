/**
 * ADAPTER: BS & Dados (Single Source of Truth) → MonthlyDatum (engine de gráficos).
 *
 * Mantém o módulo `auditChartsOptions` desacoplado: ele continua consumindo
 * `MonthlyDatum[]`, mas a fonte agora é `BSDadosRow[]` derivado da consolidação
 * por Ref Capital — exatamente como a aba "Dados para Gráficos" da planilha BEX.
 */
import type { BSDadosRow } from "@/services/bsDadosBuilder";
import type { MonthlyDatum } from "@/services/auditDatasetBuilder";

export function bsDadosToMonthlyDataset(rows: BSDadosRow[]): MonthlyDatum[] {
  return rows.map(r => ({
    mes: r.mes,
    mesKey: r.mesKey,
    // DRE
    receita_liquida: r.receita_liquida,
    cmv: r.cmv,
    despesas: r.despesas,
    resultado: r.resultado,
    // Sem dados detalhados de depreciação/amortização aqui, EBITDA usa proxy:
    // EBITDA ≈ Resultado − Despesas Financeiras (proxy quando indisponível).
    // Mantemos 0 nos derivados; o auditChartsOptions usará fallback seguro.
    ebitda: r.resultado,
    depreciacao: 0,
    amortizacao: 0,
    // BALANÇO
    ativo_circulante: r.ativo_circulante,
    ativo_nao_circulante: 0,
    passivo_circulante: r.passivo_circulante,
    passivo_nao_circulante: 0,
    estoques: r.estoques,
    disponivel: r.disponivel,
    // ENDIVIDAMENTO
    divida_tributaria: r.divida_tributaria,
    divida_trabalhista: r.divida_trabalhista,
    divida_financeira: r.divida_financeira,
    fornecedores: r.fornecedores,
    credores_rj: r.credores_rj,
    outras_obrigacoes: 0,
    divida_total: r.divida_total,
    // FLAGS
    hasReceita: r.hasReceita,
    hasBalanco: r.hasBalanco,
  }));
}
