/**
 * ADAPTER: BS & Dados (SSOT) → MonthlyDatum (engine de gráficos).
 *
 * Propaga os campos completos do template BEX agora capturados pelo SSOT:
 * ANC, PNC, PL, despesas financeiras, depreciação/amortização — para que
 * os gráficos (Liquidez Geral, Endividamento, EBITDA, Resultado/RL) batam
 * com os números das demais abas.
 */
import type { BSDadosRow } from "@/services/bsDadosBuilder";
import type { MonthlyDatum } from "@/services/auditDatasetBuilder";

export function bsDadosToMonthlyDataset(rows: BSDadosRow[]): MonthlyDatum[] {
  return rows.map(r => {
    // EBITDA = LAJIR + Depreciação + Amortização
    // LAJIR ≈ Resultado + |Despesas Financeiras| − |Receitas Financeiras|
    const despFinAbs = Math.abs(r.despesas_financeiras || 0);
    const recFinAbs = Math.abs(r.receitas_financeiras || 0);
    const depAbs = Math.abs(r.depreciacao || 0);
    const amortAbs = Math.abs(r.amortizacao || 0);
    const lajir = (r.resultado || 0) + despFinAbs - recFinAbs;
    const ebitda = lajir + depAbs + amortAbs;

    return {
      mes: r.mes,
      mesKey: r.mesKey,
      // DRE
      receita_liquida: r.receita_liquida,
      cmv: r.cmv,
      despesas: r.despesas,
      resultado: r.resultado,
      ebitda,
      depreciacao: -depAbs,
      amortizacao: -amortAbs,
      // BALANÇO
      ativo_circulante: r.ativo_circulante,
      ativo_nao_circulante: r.ativo_nao_circulante,
      passivo_circulante: r.passivo_circulante,
      passivo_nao_circulante: r.passivo_nao_circulante,
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
    };
  });
}
