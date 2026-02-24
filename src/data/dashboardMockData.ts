import type { DashboardStats, ComplianceData, RiskData, NormativeReference, CriticalArea, TrendDataPoint, AuditDistribution } from "@/types/dashboard";

export const mockStats: DashboardStats = {
  totalDocuments: 847,
  totalAudits: 156,
  auditsInProgress: 23,
  auditsCompleted: 133,
  opinionsIssued: 118,
};

export const mockCompliance: ComplianceData = {
  technicalEvaluation: 87.5,
  overallCompliance: 91.2,
  trend: "up",
  normsApplied: 42,
  normsWithDeviations: 8,
  consistencyIndex: 94.3,
  recognition: 89.1,
  measurement: 92.4,
  disclosure: 85.7,
};

export const mockRisks: RiskData = {
  auditPoints: 234,
  relevantRisks: 67,
  lowRisk: 156,
  mediumRisk: 58,
  highRisk: 20,
};

export const mockNormativeReferences: NormativeReference[] = [
  { id: "1", code: "CPC 47", type: "cpc", description: "Receita de Contrato com Cliente", auditsImpacted: 45, findingsRelated: 12 },
  { id: "2", code: "CPC 01", type: "cpc", description: "Redução ao Valor Recuperável", auditsImpacted: 38, findingsRelated: 8 },
  { id: "3", code: "CPC 27", type: "cpc", description: "Ativo Imobilizado", auditsImpacted: 42, findingsRelated: 6 },
  { id: "4", code: "CPC 25", type: "cpc", description: "Provisões, Passivos e Ativos Contingentes", auditsImpacted: 28, findingsRelated: 5 },
  { id: "5", code: "IFRS 15", type: "ifrs", description: "Revenue from Contracts with Customers", auditsImpacted: 45, findingsRelated: 12 },
  { id: "6", code: "IAS 36", type: "ifrs", description: "Impairment of Assets", auditsImpacted: 38, findingsRelated: 8 },
  { id: "7", code: "NBC TA 700", type: "nbcta", description: "Formação da Opinião e Emissão do Relatório", auditsImpacted: 118, findingsRelated: 0 },
  { id: "8", code: "NBC TA 315", type: "nbcta", description: "Identificação e Avaliação dos Riscos", auditsImpacted: 156, findingsRelated: 20 },
  { id: "9", code: "NBC TA 320", type: "nbcta", description: "Materialidade no Planejamento", auditsImpacted: 156, findingsRelated: 0 },
  { id: "10", code: "Lei 6.404/76", type: "legislation", description: "Lei das Sociedades por Ações", auditsImpacted: 156, findingsRelated: 4 },
];

export const mockCriticalAreas: CriticalArea[] = [
  { name: "Reconhecimento de Receita", riskLevel: 92, category: "Avaliação" },
  { name: "Imobilizado e Depreciação", riskLevel: 78, category: "Mensuração" },
  { name: "Provisões e Contingências", riskLevel: 85, category: "Estimativas" },
  { name: "Instrumentos Financeiros", riskLevel: 71, category: "Complexidade" },
  { name: "Controles Internos", riskLevel: 68, category: "Controle" },
  { name: "Partes Relacionadas", riskLevel: 64, category: "Divulgação" },
];

export const mockTrendData: TrendDataPoint[] = [
  { month: "Set", compliance: 85.2, risks: 28 },
  { month: "Out", compliance: 87.1, risks: 25 },
  { month: "Nov", compliance: 88.4, risks: 22 },
  { month: "Dez", compliance: 89.8, risks: 24 },
  { month: "Jan", compliance: 90.5, risks: 21 },
  { month: "Fev", compliance: 91.2, risks: 20 },
];

export const mockAuditDistribution: AuditDistribution[] = [
  { type: "Auditoria Externa", count: 62, percentage: 39.7 },
  { type: "Auditoria Interna", count: 41, percentage: 26.3 },
  { type: "Revisão Independente", count: 25, percentage: 16.0 },
  { type: "Fiscalização", count: 18, percentage: 11.5 },
  { type: "Defesa Técnica", count: 10, percentage: 6.4 },
];

export const mockUserAudits = [
  { id: "1", name: "DFs Q4 2024", status: "completed" as const, date: "2025-01-15", conformidade: 92, riscos: 3 },
  { id: "2", name: "Balanço Anual 2024", status: "completed" as const, date: "2025-02-01", conformidade: 88, riscos: 5 },
  { id: "3", name: "DRE Consolidada", status: "in_progress" as const, date: "2025-02-10", conformidade: 45, riscos: 2 },
  { id: "4", name: "Notas Explicativas", status: "pending" as const, date: "2025-02-20", conformidade: 0, riscos: 0 },
  { id: "5", name: "Relatório Trimestral Q1", status: "completed" as const, date: "2024-12-05", conformidade: 95, riscos: 1 },
  { id: "6", name: "Balancete Mensal Dez/24", status: "completed" as const, date: "2024-12-20", conformidade: 91, riscos: 2 },
  { id: "7", name: "DVA 2024", status: "completed" as const, date: "2025-01-25", conformidade: 87, riscos: 4 },
  { id: "8", name: "DMPL 2024", status: "in_progress" as const, date: "2025-02-15", conformidade: 60, riscos: 3 },
  { id: "9", name: "DFC Indireta", status: "in_progress" as const, date: "2025-02-18", conformidade: 30, riscos: 1 },
];
