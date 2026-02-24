import type { AuditFinding, AuditTopic, ReportSection, OnDemandContent } from "@/types/audit";

export const defaultTopics: AuditTopic[] = [
  { id: "1", name: "Avaliação técnica contábil", description: "Análise dos critérios e práticas contábeis adotadas", enabled: true, category: "evaluation" },
  { id: "2", name: "Conformidade CPC/IFRS", description: "Verificação de aderência aos pronunciamentos", enabled: true, category: "compliance" },
  { id: "3", name: "Consistência de saldos", description: "Análise da consistência entre períodos e demonstrações", enabled: true, category: "evaluation" },
  { id: "4", name: "Critérios de mensuração", description: "Avaliação dos critérios de mensuração aplicados", enabled: true, category: "evaluation" },
  { id: "5", name: "Reconhecimento contábil", description: "Verificação do reconhecimento de ativos, passivos e resultados", enabled: true, category: "evaluation" },
  { id: "6", name: "Evidenciação", description: "Qualidade e completude das divulgações", enabled: true, category: "compliance" },
  { id: "7", name: "Pontos de auditoria", description: "Identificação de pontos relevantes para o auditor", enabled: true, category: "risks" },
  { id: "8", name: "Materialidade", description: "Definição e aplicação dos níveis de materialidade", enabled: true, category: "risks" },
  { id: "9", name: "Estimativas contábeis", description: "Razoabilidade das estimativas contábeis", enabled: true, category: "risks" },
  { id: "10", name: "Controles internos", description: "Eficácia dos controles internos relevantes", enabled: true, category: "controls" },
  { id: "11", name: "Inconsistências e omissões", description: "Identificação de inconsistências e omissões materiais", enabled: true, category: "controls" },
  { id: "12", name: "Pontos de ressalva", description: "Pontos que podem impactar o tipo de parecer", enabled: true, category: "risks" },
];

export const defaultFindings: AuditFinding[] = [
  {
    id: "1",
    description: "Reconhecimento de receita antes da transferência de controle",
    findingType: "impropriety",
    normativeFramework: { cpc: "CPC 47", ifrs: "IFRS 15", nbcTa: "NBC TA 540" },
    riskLevel: "high",
    impactType: ["result", "disclosure"],
    technicalBasis: "A receita foi reconhecida no momento da emissão da nota fiscal, sem considerar os critérios de transferência de controle previstos no CPC 47.",
    recommendation: "Revisar a política de reconhecimento de receita e aplicar os cinco passos do CPC 47/IFRS 15.",
    documentReference: "Página 12, Nota 5.2",
  },
  {
    id: "2",
    description: "Ausência de teste de impairment em ativos de longa duração",
    findingType: "omission",
    normativeFramework: { cpc: "CPC 01", ifrs: "IAS 36", nbcTa: "NBC TA 500" },
    riskLevel: "medium",
    impactType: ["patrimonial"],
    technicalBasis: "Não foram identificadas evidências de realização do teste de recuperabilidade anual para os ativos imobilizados.",
    recommendation: "Implementar procedimento anual de teste de recuperabilidade conforme CPC 01.",
    documentReference: "Página 8, Imobilizado",
  },
  {
    id: "3",
    description: "Divergência no critério de depreciação",
    findingType: "inconsistency",
    normativeFramework: { cpc: "CPC 27", ifrs: "IAS 16" },
    riskLevel: "low",
    impactType: ["result"],
    technicalBasis: "Taxas de depreciação aplicadas diferem das taxas usuais do setor, sem justificativa técnica documentada.",
    recommendation: "Documentar a justificativa técnica para as taxas de depreciação utilizadas.",
    documentReference: "Página 9, Nota 4.1",
  },
  {
    id: "4",
    description: "Fragilidade no controle de contas a receber",
    findingType: "control_weakness",
    normativeFramework: { nbcTa: "NBC TA 315", legislation: "Lei 6.404/76" },
    riskLevel: "medium",
    impactType: ["patrimonial", "disclosure"],
    technicalBasis: "Ausência de conciliação mensal entre razão contábil e sistema de gestão de recebíveis.",
    recommendation: "Implementar rotina mensal de conciliação com evidência documental.",
    documentReference: "Página 6, Nota 3.1",
  },
];

export const defaultReportSections: ReportSection[] = [
  { id: "1", title: "Resumo Executivo", content: "A análise das demonstrações financeiras revela conformidade geral com os pronunciamentos contábeis vigentes, com ressalvas pontuais identificadas nos achados técnicos.", includeOpinion: false },
  { id: "2", title: "Escopo e Metodologia", content: "O trabalho foi conduzido com base nas Normas Brasileiras de Contabilidade (NBC TA), abrangendo procedimentos substantivos e de conformidade.", includeOpinion: false },
  { id: "3", title: "Achados e Recomendações", content: "Foram identificados 4 achados técnicos, classificados por tipo, risco e impacto. As recomendações visam a correção tempestiva e o fortalecimento dos controles internos.", includeOpinion: true },
  { id: "4", title: "Conclusão", content: "Com base nos procedimentos aplicados e nas evidências obtidas, apresentamos nossa opinião sobre as demonstrações financeiras examinadas.", includeOpinion: true },
];

export const defaultOnDemandContents: OnDemandContent[] = [
  { id: "1", type: "opinion", title: "Parecer Especializado", description: "Opinião técnica detalhada sobre os achados identificados", generated: false },
  { id: "2", type: "conclusion", title: "Conclusão de Auditoria", description: "Conclusão formal conforme NBC TA 700/705", generated: false },
  { id: "3", type: "financial_impact", title: "Impactos Financeiros e Compliance", description: "Quantificação dos impactos financeiros e conformidade regulatória", generated: false },
  { id: "4", type: "user_risk", title: "Riscos para Usuários", description: "Análise dos riscos para usuários das demonstrações financeiras", generated: false },
];
