/**
 * INDICATORS ENGINE — Engine única de indicadores econômico-financeiros.
 *
 * Consome BSDadosRow[] (SSOT — saída do bsDadosBuilder) e produz, por mês,
 * o conjunto canônico de indicadores usados em todas as abas do Diagnóstico
 * (Indicadores, Endividamento, Patrimonial, Kanitz, Gráficos).
 */
import type { BSDadosRow } from "@/services/bsDadosBuilder";

export interface IndicatorRow {
  mesKey: string;
  mes: string;
  resultadoAcumulado?: number;
  resultadoCompetencia?: number;
  // Liquidez
  liquidezCorrente: number;
  liquidezSeca: number;
  liquidezImediata: number;
  liquidezGeral: number;
  // Endividamento
  endividamentoTotal: number;
  grauEndividamentoPL: number;
  composicaoEndividamento: number;
  composicaoEndividamentoLP: number;
  imobilizacaoPL: number;
  coberturaJuros: number;
  // Atividade
  giroAtivo: number;
  pmr: number;
  pmp: number;
  idadeMediaEstoque: number;
  cicloOperacional: number;
  cicloCaixa: number;
  // Rentabilidade
  margemLiquida: number;
  margemOperacional: number;
  roa: number;
  roe: number;
  // EBITDA
  ebitda: number;
  ebitdaStatus: "AVAILABLE" | "NOT_AVAILABLE";
  coberturaJurosStatus: "AVAILABLE" | "NOT_AVAILABLE";
  // Bases (para drill-down)
  _ac: number;
  _anc: number;
  _at: number;
  _pc: number;
  _pnc: number;
  _pt: number;
  _pl: number;
  _rlp: number;
  _caixa: number;
  _estoque: number;
  _imob: number;
  _contasReceber: number;
  _fornecedores: number;
  _receita: number;
  _cmv: number;
  _despFin: number;
  _recFin: number;
  _depreciacao: number;
  _amortizacao: number;
  _resultado: number;
  resultadoLiquido: number;
  // Bases de dívida detalhadas
  _dividaTributaria: number;
  _dividaTrabalhista: number;
  _dividaFinanceira: number;
  _credoresRJ: number;
  // Readouts diretos
  isg: number;
  endividamentoGeral: number;
  indicators_status: Record<string, "AVAILABLE" | "NOT_AVAILABLE">;
  naROE: boolean;
  naImobilizacao: boolean;
  naCobertura: boolean;
}

export interface ISGResult {
  mesKey: string;
  mes: string;
  isg: number;
  status: "AVAILABLE" | "NOT_AVAILABLE";
  ativoTotal: number;
  capitalTerceiros: number;
  label: string;
  icon: string;
  color: string;
  reason?: string;
}

const div = (n: number, d: number): number => {
  if (!Number.isFinite(n) || isNaN(n)) return 0;
  if (!Number.isFinite(d) || d === 0 || isNaN(d)) return 0;
  return n / d;
};

export function computeIndicatorsForRow(r: BSDadosRow): IndicatorRow {
  const ac = r.ativo_circulante;
  const anc = r.ativo_nao_circulante;
  const rlp = r.realizavel_longo_prazo;
  const at = ac + anc;
  const pc = r.passivo_circulante;
  const pnc = r.passivo_nao_circulante;
  const pt = pc + pnc;
  const pl = r.patrimonio_liquido;
  const estoque = r.estoques;
  const caixa = r.disponivel;
  const imob = r.imobilizado;
  const contasReceber = r.contas_receber;
  const receita = r.receita_liquida;
  const cmvAbs = Math.abs(r.cmv);
  const despFinAbs = Math.abs(r.despesas_financeiras);
  const recFinAbs = Math.abs(r.receitas_financeiras);
  const depAbs = Math.abs(r.depreciacao);
  const amortAbs = Math.abs(r.amortizacao);
  const resultado = r.resultado;

  const resAcumulado = r.resultado_acumulado ?? resultado;
  const resCompetencia = r.resultado_competencia ?? resultado;
  const resParaCalculo = (resCompetencia !== undefined && resCompetencia !== 0) ? resCompetencia : resAcumulado;

  // §P07 — Derived SSOT: unificação absoluta da Cobertura de Juros e EBITDA via snapshot residual
  const lajir = r.residual_facts?.lajir?.status === "AVAILABLE" ? r.residual_facts.lajir.value : NaN;
  const ebitdaCertificado = r.residual_facts?.ebitda?.status === "AVAILABLE";
  const ebitdaValue = ebitdaCertificado ? r.residual_facts?.ebitda.value : NaN;
  const coverageCertificada = r.residual_facts?.interest_coverage?.status === "AVAILABLE";
  const coberturaJuros = coverageCertificada ? r.residual_facts?.interest_coverage.value : NaN;

  const pmr = div(contasReceber * 30, receita);
  const pmp = receita !== 0 ? div(r.fornecedores * 30, (receita / 12) * 0.7) : div(r.fornecedores * 30, cmvAbs + Math.abs(r.despesas)); // Fallback PMP baseada em receita quando CMV indisponível
  const ime = div(estoque * 30, cmvAbs);

  const res: IndicatorRow = {
    mesKey: r.mesKey,
    mes: r.mes,
    resultadoAcumulado: resAcumulado,
    resultadoCompetencia: resCompetencia,
    liquidezCorrente: div(ac, pc),
    liquidezSeca: div(ac - estoque, pc),
    liquidezImediata: div(caixa, pc),
    liquidezGeral: div(ac + rlp, pc + pnc),
    endividamentoTotal: div(pt, at),
    grauEndividamentoPL: pl !== 0 ? pt / pl : 0,
    composicaoEndividamento: div(pc, pt),
    composicaoEndividamentoLP: div(pnc, pt),
    imobilizacaoPL: pl > 0 ? div(imob, pl) : 0,
    coberturaJuros,
    giroAtivo: div(receita, at),
    pmr,
    pmp,
    idadeMediaEstoque: ime,
    cicloOperacional: ime + pmr,
    cicloCaixa: ime + pmr - pmp,
    margemLiquida: div(resParaCalculo, receita),
    margemOperacional: div(lajir, receita),
    roa: div(resParaCalculo, at) * 12,
    roe: pl !== 0 ? div(resParaCalculo, pl) * 12 : 0,
    ebitda: ebitdaValue,
    ebitdaStatus: ebitdaCertificado ? "AVAILABLE" : "NOT_AVAILABLE",
    coberturaJurosStatus: coverageCertificada ? "AVAILABLE" : "NOT_AVAILABLE",
    isg: pt > 0 ? at / pt : 0,
    endividamentoGeral: at > 0 ? pt / at : 0,
    _ac: ac, _anc: anc, _at: at, _pc: pc, _pnc: pnc, _pt: pt, _pl: pl, _rlp: rlp,
    _caixa: caixa, _estoque: estoque, _imob: imob, _contasReceber: contasReceber,
    _fornecedores: r.fornecedores, _receita: receita, _cmv: cmvAbs,
    _despFin: despFinAbs, _recFin: recFinAbs, _depreciacao: depAbs, _amortizacao: amortAbs,
    _resultado: resParaCalculo,
    resultadoLiquido: resParaCalculo,
    _dividaTributaria: Math.abs(r.divida_tributaria),
    _dividaTrabalhista: Math.abs(r.divida_trabalhista),
    _dividaFinanceira: Math.abs(r.divida_financeira),
    _credoresRJ: Math.abs(r.credores_rj),
    indicators_status: {},
    naROE: pl <= 0,
    naImobilizacao: pl <= 0,
    naCobertura: !coberturaCertificada,
  };

  const s = r.facts_status;
  if (s) {
    res.indicators_status.liquidezCorrente = (s.ativo_circulante === "AVAILABLE" && s.passivo_circulante === "AVAILABLE") ? "AVAILABLE" : "NOT_AVAILABLE";
    res.indicators_status.liquidezSeca = (s.ativo_circulante === "AVAILABLE" && s.estoques === "AVAILABLE" && s.passivo_circulante === "AVAILABLE") ? "AVAILABLE" : "NOT_AVAILABLE";
    res.indicators_status.endividamentoTotal = (s.passivo_circulante === "AVAILABLE" && s.ativo_circulante === "AVAILABLE") ? "AVAILABLE" : "NOT_AVAILABLE";
    res.indicators_status.margemLiquida = (s.resultado === "AVAILABLE" && s.receita_liquida === "AVAILABLE") ? "AVAILABLE" : "NOT_AVAILABLE";
    res.indicators_status.ebitda = (s.resultado === "AVAILABLE" && s.despesas_financeiras === "AVAILABLE") ? "AVAILABLE" : "NOT_AVAILABLE";
  }
  
  return res;
}

export function buildIndicatorSeries(rows: BSDadosRow[] | null | undefined): Record<string, IndicatorRow> {
  if (!rows || rows.length === 0) return {};
  const out: Record<string, IndicatorRow> = {};
  for (const r of rows) out[r.mesKey] = computeIndicatorsForRow(r);
  return out;
}

export function buildISGSeries(rows: BSDadosRow[] | null | undefined): ISGResult[] {
  if (!rows || rows.length === 0) return [];
  return rows.map(r => {
    const at = r.ativo_circulante + r.ativo_nao_circulante;
    const pt = r.passivo_circulante + r.passivo_nao_circulante;
    const isg = pt > 0 ? at / pt : 0;
    
    let label = "Insolvente";
    let icon = "🔴";
    let color = "hsl(0,75%,55%)";
    
    if (isg >= 1.5) {
      label = "Solvente";
      icon = "🟢";
      color = "hsl(150,70%,42%)";
    } else if (isg >= 1.0) {
      label = "Atenção";
      icon = "🟡";
      color = "hsl(34,95%,55%)";
    }
    
    return {
      mesKey: r.mesKey,
      mes: r.mes,
      isg,
      ativoTotal: at,
      capitalTerceiros: pt,
      label,
      icon,
      color,
      status: (r.facts_status.ativo_circulante === "AVAILABLE" && r.facts_status.passivo_circulante === "AVAILABLE") ? "AVAILABLE" : "NOT_AVAILABLE",
      reason: (r.patrimonio_liquido <= 0) ? "Patrimônio Líquido negativo — ISG é o principal indicador de solvência." : undefined
    };
  });
}
