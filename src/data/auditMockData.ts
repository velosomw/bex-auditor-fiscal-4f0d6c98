import type { AuditFinding, ScopeCheckItem, ReportSection, OnDemandContent, BalancoRow, CompanyDataMultiYear, FinancialAnalysis } from "@/types/audit";

export const defaultScopeChecks: ScopeCheckItem[] = [
  // Patrimonial
  { id: "p1", category: "patrimonial", name: "Classificação AC / ANC", description: "Verificar correta classificação entre circulante e não circulante", enabled: true, normReference: "CPC 26" },
  { id: "p2", category: "patrimonial", name: "Classificação PC / PNC", description: "Verificar correta classificação do passivo circulante e não circulante", enabled: true, normReference: "CPC 26" },
  { id: "p3", category: "patrimonial", name: "PL negativo", description: "Identificar patrimônio líquido negativo e implicações de continuidade", enabled: true, normReference: "CPC 26 / NBC TA 570" },
  { id: "p4", category: "patrimonial", name: "Duplicatas descontadas não evidenciadas", description: "Verificar se duplicatas descontadas estão devidamente evidenciadas", enabled: true, normReference: "CPC 48" },
  // Resultado
  { id: "r1", category: "resultado", name: "Reconhecimento de receita (CPC 47)", description: "Verificar critérios dos 5 passos de reconhecimento de receita", enabled: true, normReference: "CPC 47 / IFRS 15" },
  { id: "r2", category: "resultado", name: "Provisões (CPC 25)", description: "Verificar reconhecimento e mensuração de provisões", enabled: true, normReference: "CPC 25 / IAS 37" },
  { id: "r3", category: "resultado", name: "Impairment (CPC 01)", description: "Verificar teste de recuperabilidade de ativos", enabled: true, normReference: "CPC 01 / IAS 36" },
  { id: "r4", category: "resultado", name: "Depreciação (CPC 27)", description: "Verificar taxas e métodos de depreciação", enabled: true, normReference: "CPC 27 / IAS 16" },
  // Fluxo de Caixa
  { id: "f1", category: "fluxo_caixa", name: "Coerência lucro x caixa", description: "Analisar coerência entre lucro líquido e geração de caixa operacional", enabled: true, normReference: "CPC 03" },
  { id: "f2", category: "fluxo_caixa", name: "Classificação DFC", description: "Verificar correta classificação das atividades operacionais, investimento e financiamento", enabled: true, normReference: "CPC 03 / IAS 7" },
];

export const defaultFindings: AuditFinding[] = [
  {
    id: "1",
    description: "Receita cresce 40% sem aumento proporcional de caixa operacional",
    findingType: "inconsistency",
    normativeFramework: { cpc: "CPC 47", ifrs: "IFRS 15", nbcTa: "NBC TA 540" },
    riskLevel: "high",
    impactType: ["result", "disclosure"],
    technicalBasis: "A receita apresenta crescimento de 40% enquanto o caixa operacional permanece estável, indicando possível reconhecimento antecipado.",
    recommendation: "Revisar a política de reconhecimento de receita e aplicar os cinco passos do CPC 47/IFRS 15.",
    materiality: "Material",
    documentReference: "Balanço 2023 vs 2022",
  },
  {
    id: "2",
    description: "PL negativo identificado — risco de continuidade operacional",
    findingType: "impropriety",
    normativeFramework: { cpc: "CPC 26", nbcTa: "NBC TA 570", legislation: "Lei 6.404/76" },
    riskLevel: "high",
    impactType: ["patrimonial", "disclosure"],
    technicalBasis: "O patrimônio líquido consolidado apresenta saldo negativo, configurando passivo a descoberto conforme Lei 6.404/76.",
    recommendation: "Avaliar premissa de continuidade e evidenciar em nota explicativa conforme NBC TA 570.",
    materiality: "Material",
  },
  {
    id: "3",
    description: "Endividamento geral superior a 80% do ativo total",
    findingType: "control_weakness",
    normativeFramework: { cpc: "CPC 26", nbcTa: "NBC TA 315" },
    riskLevel: "medium",
    impactType: ["patrimonial"],
    technicalBasis: "O índice de endividamento geral excede 80%, indicando alta alavancagem e risco financeiro elevado.",
    recommendation: "Recomendar plano de reestruturação financeira e monitoramento contínuo dos indicadores.",
    materiality: "Material",
  },
  {
    id: "4",
    description: "Margem líquida caiu 60% no período analisado",
    findingType: "inconsistency",
    normativeFramework: { cpc: "CPC 26", ifrs: "IAS 1" },
    riskLevel: "medium",
    impactType: ["result"],
    technicalBasis: "Redução significativa da margem líquida sem justificativa operacional aparente nas demonstrações.",
    recommendation: "Investigar causas da deterioração e verificar adequação do reconhecimento de despesas.",
  },
  {
    id: "5",
    description: "Ausência de teste de impairment em ativos de longa duração",
    findingType: "omission",
    normativeFramework: { cpc: "CPC 01", ifrs: "IAS 36", nbcTa: "NBC TA 500" },
    riskLevel: "medium",
    impactType: ["patrimonial"],
    technicalBasis: "Não foram identificadas evidências de realização do teste de recuperabilidade anual para os ativos imobilizados.",
    recommendation: "Implementar procedimento anual de teste de recuperabilidade conforme CPC 01.",
  },
];

export const defaultBalancoRows: BalancoRow[] = [
  { conta: "1", descricao: "Ativo Total", values: { "2021": 350418897, "2022": 616845748, "2023": 599149983 }, tag: "carregado" },
  { conta: "1.01", descricao: "Ativo Circulante", values: { "2021": 74373574, "2022": 105902186, "2023": 121163683 }, tag: "carregado" },
  { conta: "1.01.01", descricao: "Caixa e Equivalentes", values: { "2021": 29034228, "2022": 29416189, "2023": 35747240 }, tag: "carregado" },
  { conta: "1.01.02", descricao: "Aplicações Financeiras", values: { "2021": 123824, "2022": 26013381, "2023": 16808467 }, tag: "carregado" },
  { conta: "1.01.03", descricao: "Contas a Receber", values: { "2021": 14062355, "2022": 17776638, "2023": 21974701 }, tag: "carregado" },
  { conta: "1.01.04", descricao: "Estoques", values: { "2021": 19447693, "2022": 19675123, "2023": 28446924 }, tag: "carregado" },
  { conta: "1.01.06", descricao: "Tributos a Recuperar", values: { "2021": 7022538, "2022": 8766979, "2023": 12845667 }, tag: "carregado" },
  { conta: "1.01.08", descricao: "Outros Ativos Circulantes", values: { "2021": 3394313, "2022": 3266635, "2023": 4012266 }, tag: "carregado" },
  { conta: "1.02", descricao: "Ativo Não Circulante", values: { "2021": 276045323, "2022": 510943562, "2023": 477986300 }, tag: "carregado" },
  { conta: "1.02.01", descricao: "Realizável a Longo Prazo", values: { "2021": 34923056, "2022": 37718356, "2023": 41187318 }, tag: "carregado" },
  { conta: "1.02.02", descricao: "Investimentos", values: { "2021": 5771979, "2022": 11591644, "2023": 12248080 }, tag: "carregado" },
  { conta: "1.02.03", descricao: "Imobilizado", values: { "2021": 227079424, "2022": 280094834, "2023": 342266918 }, tag: "carregado" },
  { conta: "1.02.04", descricao: "Intangível", values: { "2021": 8270864, "2022": 81538728, "2023": 82283984 }, tag: "carregado" },
  // Passivo
  { conta: "2", descricao: "Passivo Total", values: { "2021": 350418897, "2022": 616845748, "2023": 599149983 }, tag: "carregado" },
  { conta: "2.01", descricao: "Passivo Circulante", values: { "2021": 55161927, "2022": 55947631, "2023": 68212334 }, tag: "carregado" },
  { conta: "2.01.02", descricao: "Fornecedores", values: { "2021": 17081600, "2022": 116710444, "2023": 21417528 }, tag: "risco", hasRisk: true },
  { conta: "2.01.04", descricao: "Empréstimos CP", values: { "2021": 15555787, "2022": 15089475, "2023": 18966329 }, tag: "carregado" },
  { conta: "2.02", descricao: "Passivo Não Circulante", values: { "2021": 128363834, "2022": 151069842, "2023": 198714038 }, tag: "carregado" },
  { conta: "2.02.01", descricao: "Empréstimos LP", values: { "2021": 86894761, "2022": 100857665, "2023": 136588365 }, tag: "carregado" },
  { conta: "2.03", descricao: "Patrimônio Líquido", values: { "2021": 166893136, "2022": 309828275, "2023": 332223611 }, tag: "carregado" },
];

export const defaultDreRows: BalancoRow[] = [
  { conta: "3.01", descricao: "Receita Líquida", values: { "2021": 182833794, "2022": 211841891, "2023": 244176142 }, tag: "carregado" },
  { conta: "3.02", descricao: "Custo dos Produtos Vendidos", values: { "2021": -108706571, "2022": -135617039, "2023": -166939260 }, tag: "carregado" },
  { conta: "3.03", descricao: "Resultado Bruto", values: { "2021": 74127223, "2022": 76224852, "2023": 77236882 }, tag: "carregado" },
  { conta: "3.04", descricao: "Despesas Operacionais", values: { "2021": -29689814, "2022": -30936698, "2023": -33008162 }, tag: "carregado" },
  { conta: "3.05", descricao: "LAJIR", values: { "2021": 44437409, "2022": 45288154, "2023": 44228720 }, tag: "carregado" },
  { conta: "3.06", descricao: "Resultado Financeiro", values: { "2021": -162383, "2022": 2620560, "2023": 122220 }, tag: "carregado" },
  { conta: "3.07", descricao: "LAIR", values: { "2021": 44275026, "2022": 47908714, "2023": 44350940 }, tag: "carregado" },
  { conta: "3.08", descricao: "IR/CSLL", values: { "2021": -10930954, "2022": -12027382, "2023": -11241328 }, tag: "carregado" },
  { conta: "3.11", descricao: "Lucro Líquido", values: { "2021": 33344072, "2022": 35881332, "2023": 33109612 }, tag: "carregado" },
];

export const defaultEntityData: CompanyDataMultiYear = {
  "2021": {
    ativoCirculante: 74373574, ativoNaoCirculante: 276045323,
    passivoCirculante: 55161927, passivoNaoCirculante: 128363834,
    patrimonioLiquido: 166893136, receitaLiquida: 182833794,
    lucroLiquido: 33344072, duplicatasDescontadas: 1000000,
    estoques: 19447693, custoMercadoriasVendidas: 108706571,
    contasReceber: 14062355, fornecedores: 17081600,
    resultadoOperacional: 44437409, despesasFinanceiras: 3671349,
    imobilizado: 227079424, caixaEquivalentes: 29034228,
  },
  "2022": {
    ativoCirculante: 105902186, ativoNaoCirculante: 510943562,
    passivoCirculante: 55947631, passivoNaoCirculante: 151069842,
    patrimonioLiquido: 309828275, receitaLiquida: 211841891,
    lucroLiquido: 35881332, duplicatasDescontadas: 1500000,
    estoques: 19675123, custoMercadoriasVendidas: 135617039,
    contasReceber: 17776638, fornecedores: 116710444,
    resultadoOperacional: 45288154, despesasFinanceiras: 3144887,
    imobilizado: 280094834, caixaEquivalentes: 29416189,
  },
  "2023": {
    ativoCirculante: 121163683, ativoNaoCirculante: 477986300,
    passivoCirculante: 68212334, passivoNaoCirculante: 198714038,
    patrimonioLiquido: 332223611, receitaLiquida: 244176142,
    lucroLiquido: 33109612, duplicatasDescontadas: 2500000,
    estoques: 28446924, custoMercadoriasVendidas: 166939260,
    contasReceber: 21974701, fornecedores: 21417528,
    resultadoOperacional: 44228720, despesasFinanceiras: 6420417,
    imobilizado: 342266918, caixaEquivalentes: 35747240,
  },
};

function calcIndicators(d: import("@/types/audit").CompanyData): import("@/types/audit").FinancialIndicators {
  const at = d.ativoCirculante + d.ativoNaoCirculante;
  const pt = d.passivoCirculante + d.passivoNaoCirculante;
  return {
    liquidezCorrente: d.passivoCirculante ? d.ativoCirculante / d.passivoCirculante : 0,
    liquidezSeca: d.passivoCirculante ? (d.ativoCirculante - d.estoques) / d.passivoCirculante : 0,
    liquidezGeral: (d.passivoCirculante + d.passivoNaoCirculante) ? (d.ativoCirculante + d.ativoNaoCirculante * 0.1) / (d.passivoCirculante + d.passivoNaoCirculante) : 0,
    liquidezImediata: d.passivoCirculante ? d.caixaEquivalentes / d.passivoCirculante : 0,
    endividamentoGeral: at ? pt / at : 0,
    composicaoEndividamento: pt ? d.passivoCirculante / pt : 0,
    imobilizacaoPL: d.patrimonioLiquido ? d.imobilizado / d.patrimonioLiquido : 0,
    giroAtivo: at ? d.receitaLiquida / at : 0,
    pmr: d.receitaLiquida ? (d.contasReceber * 360) / d.receitaLiquida : 0,
    pmp: d.custoMercadoriasVendidas ? (d.fornecedores * 360) / d.custoMercadoriasVendidas : 0,
    margemLiquida: d.receitaLiquida ? d.lucroLiquido / d.receitaLiquida : 0,
    margemOperacional: d.receitaLiquida ? d.resultadoOperacional / d.receitaLiquida : 0,
    roa: at ? d.lucroLiquido / at : 0,
    roe: d.patrimonioLiquido ? d.lucroLiquido / d.patrimonioLiquido : 0,
    idadeMediaEstoque: d.custoMercadoriasVendidas ? (d.estoques * 360) / d.custoMercadoriasVendidas : 0,
    cicloOperacional: 0,
    cicloCaixa: 0,
    coberturaJuros: d.despesasFinanceiras ? d.resultadoOperacional / d.despesasFinanceiras : 0,
  };
}

export const defaultFinancialAnalysis: FinancialAnalysis = (() => {
  const ind: { [y: string]: import("@/types/audit").FinancialIndicators } = {};
  for (const y of Object.keys(defaultEntityData)) {
    const i = calcIndicators(defaultEntityData[y]);
    i.cicloOperacional = i.idadeMediaEstoque + i.pmr;
    i.cicloCaixa = i.cicloOperacional - i.pmp;
    ind[y] = i;
  }

  // Insolvency (Kanitz simplified)
  const d23 = defaultEntityData["2023"];
  const lg = (d23.ativoCirculante + d23.ativoNaoCirculante * 0.1) / (d23.passivoCirculante + d23.passivoNaoCirculante);
  const rent = d23.lucroLiquido / (d23.ativoCirculante + d23.ativoNaoCirculante);
  const endiv = (d23.passivoCirculante + d23.passivoNaoCirculante) / (d23.ativoCirculante + d23.ativoNaoCirculante);
  const score = lg * 0.4 + rent * 0.3 - endiv * 0.3;

  return {
    indicators: ind,
    horizontalAnalysis: { rows: [] },
    verticalAnalysis: { rows: [] },
    insolvencyScore: score,
    insolvencyClassification: score < 0 ? "insolvencia" : score <= 1 ? "atencao" : "solidez",
    solvencyConclusion: "Análise de solvência requer avaliação complementar das duplicatas descontadas e dívida onerosa.",
  };
})();

export const defaultReportSections: ReportSection[] = [
  { id: "1", title: "Resumo Executivo", content: "A análise das demonstrações financeiras revela conformidade geral com os pronunciamentos contábeis vigentes, com ressalvas pontuais identificadas nos achados técnicos.", includeOpinion: false },
  { id: "2", title: "Escopo e Metodologia", content: "O trabalho foi conduzido com base nas Normas Brasileiras de Contabilidade (NBC TA), abrangendo procedimentos substantivos e de conformidade.", includeOpinion: false },
  { id: "3", title: "Achados e Recomendações", content: "Foram identificados achados técnicos classificados por tipo, risco e impacto. As recomendações visam a correção tempestiva e o fortalecimento dos controles internos.", includeOpinion: true },
  { id: "4", title: "Seção Financeira", content: "Indicadores financeiros, análise horizontal e vertical, índice de insolvência e análise de solvência consolidados.", includeOpinion: true },
  { id: "5", title: "Conclusão", content: "Com base nos procedimentos aplicados e nas evidências obtidas, apresentamos nossa opinião sobre as demonstrações financeiras examinadas.", includeOpinion: true },
];

export const defaultOnDemandContents: OnDemandContent[] = [
  { id: "1", type: "opinion", title: "Parecer Especializado", description: "Opinião técnica detalhada sobre os achados identificados", generated: false },
  { id: "2", type: "conclusion", title: "Conclusão de Auditoria", description: "Conclusão formal conforme NBC TA 700/705", generated: false },
  { id: "3", type: "financial_impact", title: "Impactos Financeiros e Compliance", description: "Quantificação dos impactos financeiros e conformidade regulatória", generated: false },
  { id: "4", type: "user_risk", title: "Riscos para Usuários", description: "Análise dos riscos para usuários das demonstrações financeiras", generated: false },
];
