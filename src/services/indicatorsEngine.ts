/**
 * INDICATORS ENGINE — Engine única de indicadores econômico-financeiros.
 *
 * Consome BSDadosRow[] (SSOT — saída do bsDadosBuilder) e produz, por mês,
 * o conjunto canônico de indicadores usados em todas as abas do Diagnóstico
 * (Indicadores, Endividamento, Patrimonial, Kanitz, Gráficos).
 *
 * Princípios:
 *  - Determinística: mesmas entradas ⇒ mesmas saídas (sem IA, sem fallback opaco).
 *  - Transparente: cada indicador carrega as contas/refs que o alimentam.
 *  - À prova de divisão por zero: retorna 0 e marca `na: true` quando indefinido.
 *
 * Fórmulas (referência: template BEX):
 *   Liquidez Corrente   = AC / PC
 *   Liquidez Seca       = (AC − Estoques) / PC
 *   Liquidez Imediata   = Disponível / PC
 *   Liquidez Geral      = (AC + RLP) / (PC + PNC)   [planilha Kanitz — RLP, não ANC inteiro; fallback ANC]
 *   Endividamento Geral = (PC + PNC) / (AC + ANC)   [ETA — Endividamento Total sobre Ativos]
 *   Grau Endiv. PL      = (PC + PNC) / PL           [Kanitz X5; N/A se PL ≤ 0]
 *   Composição Endiv.   = PC / (PC + PNC)
 *   Imobilização do PL  = Imobilizado / PL          [N/A se PL ≤ 0]
 *   Cobertura de Juros  = (Resultado + |DespFin|) / |DespFin|
 *   Giro do Ativo       = Receita / (AC + ANC)
 *   PMR  = (ContasReceber × 30) / ReceitaMensal     [base mensal, planilha BEX]
 *   PMP  = (Fornecedores   × 30) / |CMV mensal|
 *   IME  = (Estoques       × 30) / |CMV mensal|
 *   Margem Líquida      = Resultado / Receita
 *   Margem Operacional  = (Resultado + |DespFin|) / Receita   [proxy LAJIR]
 *   ROA (anual)         = (Resultado / (AC + ANC)) × 12
 *   ROE (anual)         = (Resultado / PL) × 12               [N/A se PL ≤ 0]
 *   EBITDA              = (Resultado + |DespFin|) + |Depreciação| + |Amortização|
 */
import type { BSDadosRow } from "@/services/bsDadosBuilder";

export interface IndicatorRow {
  mesKey: string;
  mes: string;
  // Liquidez
  liquidezCorrente: number;
  liquidezSeca: number;
  liquidezImediata: number;
  liquidezGeral: number;
  // Endividamento
  endividamentoGeral: number;
  grauEndividamentoPL: number;           // GE = (PC + PNC) / PL — Kanitz X5 (N/A se PL ≤ 0)
  composicaoEndividamento: number;       // PC / PT (CECP)
  composicaoEndividamentoLP: number;     // PNC / PT (CELP) — NOVO
  imobilizacaoPL: number;
  coberturaJuros: number;
  // Atividade (anualizado ×360 conforme planilha BEX)
  giroAtivo: number;
  pmr: number;                           // PMC — Período Médio de Cobrança
  pmp: number;                           // Período Médio de Pagamento
  idadeMediaEstoque: number;             // IME
  cicloOperacional: number;              // CO = IME + PMC — NOVO
  cicloCaixa: number;                    // CC = CO − PMP — NOVO
  // Rentabilidade
  margemLiquida: number;
  margemOperacional: number;
  roa: number;
  roe: number;
  // EBITDA
  ebitda: number;
  // Bases (para drill-down / memória de cálculo)
  _ac: number;
  _anc: number;
  _at: number;
  _pc: number;
  _pnc: number;
  _pt: number;
  _pl: number;
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
  // Flags
  naROE: boolean;
  naImobilizacao: boolean;
  naCobertura: boolean;
}

const div = (n: number, d: number): number =>
  !Number.isFinite(d) || d === 0 ? 0 : n / d;

export function computeIndicatorsForRow(r: BSDadosRow): IndicatorRow {
  const ac = r.ativo_circulante || 0;
  const anc = r.ativo_nao_circulante || 0;
  const rlp = r.realizavel_longo_prazo || 0;
  const at = ac + anc;
  const pc = r.passivo_circulante || 0;
  const pnc = r.passivo_nao_circulante || 0;
  const pt = pc + pnc;
  const pl = r.patrimonio_liquido || 0;
  const estoque = r.estoques || 0;
  const caixa = r.disponivel || 0;
  const imob = r.imobilizado || 0;
  const contasReceber = r.contas_receber || 0;
  const receita = r.receita_liquida || 0;
  const cmvAbs = Math.abs(r.cmv || 0);
  const despFinAbs = Math.abs(r.despesas_financeiras || 0);
  const recFinAbs = Math.abs(r.receitas_financeiras || 0);
  const depAbs = Math.abs(r.depreciacao || 0);
  const amortAbs = Math.abs(r.amortizacao || 0);
  const resultado = r.resultado || 0;

  // LAJIR (proxy): resultado + despesas financeiras − receitas financeiras
  // Reconcilia com a planilha BEX/Kanitz que isola o resultado financeiro líquido.
  const lajir = resultado + despFinAbs - recFinAbs;

  // Prazos em DIAS sobre base mensal (×30) — bate com planilha BEX p/ meses isolados e séries
  const pmr = div(contasReceber * 30, receita);
  const pmp = div(r.fornecedores * 30, cmvAbs);
  const ime = div(estoque * 30, cmvAbs);

  // Liquidez Geral — fórmula planilha Kanitz: (AC + RLP) / (PC + PNC).
  // RLP é subset de ANC: quando ausente (parser não populou), fallback para ANC
  // mantém compatibilidade — mas o ideal é ter RLP discriminado via Refs P..Z.
  const rlpEff = rlp > 0 ? rlp : anc;

  return {
    mesKey: r.mesKey,
    mes: r.mes,
    // Liquidez
    liquidezCorrente: div(ac, pc),
    liquidezSeca: div(ac - estoque, pc),
    liquidezImediata: div(caixa, pc),
    liquidezGeral: div(ac + rlpEff, pc + pnc),
    // Endividamento
    endividamentoGeral: div(pt, at),
    // Kanitz X5: exibe sinal negativo quando PL é negativo (passivo a descoberto)
    grauEndividamentoPL: pl !== 0 ? pt / pl : 0,
    composicaoEndividamento: div(pc, pt),
    composicaoEndividamentoLP: div(pnc, pt),
    imobilizacaoPL: pl > 0 ? div(imob, pl) : 0,
    coberturaJuros: despFinAbs > 0 ? div(lajir, despFinAbs) : 0,
    // Atividade — DIAS sobre base mensal (×30); CO=IME+PMR, CC=CO−PMP
    giroAtivo: div(receita, at),
    pmr,
    pmp,
    idadeMediaEstoque: ime,
    cicloOperacional: ime + pmr,
    cicloCaixa: ime + pmr - pmp,
    // Rentabilidade — ROA/ROE ANUALIZADOS (×12) a partir do resultado mensal
    margemLiquida: div(resultado, receita),
    margemOperacional: div(lajir, receita),
    roa: div(resultado, at) * 12,
    roe: pl > 0 ? div(resultado, pl) * 12 : 0,
    // EBITDA = Resultado + |DespFin| + |Depreciação| + |Amortização|
    ebitda: lajir + depAbs + amortAbs,
    // Bases
    _ac: ac, _anc: anc, _at: at, _pc: pc, _pnc: pnc, _pt: pt, _pl: pl,
    _caixa: caixa, _estoque: estoque, _imob: imob, _contasReceber: contasReceber,
    _fornecedores: r.fornecedores || 0, _receita: receita, _cmv: cmvAbs,
    _despFin: despFinAbs, _recFin: recFinAbs, _depreciacao: depAbs, _amortizacao: amortAbs,
    _resultado: resultado,
    naROE: pl <= 0,
    naImobilizacao: pl <= 0,
    naCobertura: despFinAbs === 0,
  };
}

/** Constrói série indexada por mesKey, pronta para consumo pelas abas. */
export function buildIndicatorSeries(rows: BSDadosRow[] | null | undefined): Record<string, IndicatorRow> {
  if (!rows || rows.length === 0) return {};
  const out: Record<string, IndicatorRow> = {};
  for (const r of rows) out[r.mesKey] = computeIndicatorsForRow(r);
  return out;
}

/**
 * ISG — Índice de Solvência Geral.
 * Mede capacidade do Ativo Total cobrir o Capital de Terceiros (PC + PNC).
 * Útil quando PL ≤ 0 (Kanitz com restrições — ver MD).
 *
 * Fórmula:  ISG = Ativo Total / (PC + PNC)
 * Faixas:   > 1,5 Solvente | 1,0–1,5 Atenção | < 1,0 Insolvente
 */
export type ISGClassification = "solvente" | "atencao" | "insolvente" | "indefinido";

export interface ISGResult {
  mesKey: string;
  mes: string;
  isg: number;
  ativoTotal: number;
  capitalTerceiros: number;
  classificacao: ISGClassification;
  label: string;
  icon: string;
  color: string;
  reason?: string;
}

export const ISG_META: Record<ISGClassification, { label: string; icon: string; color: string }> = {
  solvente:   { label: "Solvente",   icon: "🟢", color: "hsl(150,70%,42%)" },
  atencao:    { label: "Atenção",    icon: "🟡", color: "hsl(48,96%,53%)"  },
  insolvente: { label: "Insolvente", icon: "🔴", color: "hsl(0,75%,55%)"   },
  indefinido: { label: "Indefinido", icon: "⛔", color: "hsl(220,10%,55%)" },
};

export function classifyISG(isg: number): ISGClassification {
  if (!Number.isFinite(isg) || isg <= 0) return "indefinido";
  if (isg > 1.5) return "solvente";
  if (isg >= 1.0) return "atencao";
  return "insolvente";
}

export function computeISG(r: BSDadosRow): ISGResult {
  const ativoTotal = (r.ativo_circulante || 0) + (r.ativo_nao_circulante || 0);
  const capitalTerceiros = (r.passivo_circulante || 0) + (r.passivo_nao_circulante || 0);
  const isg = capitalTerceiros > 0 ? ativoTotal / capitalTerceiros : 0;
  const classificacao = classifyISG(isg);
  const meta = ISG_META[classificacao];
  return {
    mesKey: r.mesKey,
    mes: r.mes,
    isg,
    ativoTotal,
    capitalTerceiros,
    classificacao,
    label: meta.label,
    icon: meta.icon,
    color: meta.color,
    reason: capitalTerceiros === 0
      ? "Capital de terceiros (PC + PNC) não capturado — ISG indefinido."
      : undefined,
  };
}

export function buildISGSeries(rows: BSDadosRow[] | null | undefined): ISGResult[] {
  if (!rows || rows.length === 0) return [];
  return [...rows]
    .sort((a, b) => a.mesKey.localeCompare(b.mesKey))
    .map(computeISG);
}
