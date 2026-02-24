export interface DashboardStats {
  totalDocuments: number;
  totalAudits: number;
  auditsInProgress: number;
  auditsCompleted: number;
  opinionsIssued: number;
}

export interface ComplianceData {
  technicalEvaluation: number;
  overallCompliance: number;
  trend: 'up' | 'down' | 'stable';
  normsApplied: number;
  normsWithDeviations: number;
  consistencyIndex: number;
  recognition: number;
  measurement: number;
  disclosure: number;
}

export interface RiskData {
  auditPoints: number;
  relevantRisks: number;
  lowRisk: number;
  mediumRisk: number;
  highRisk: number;
}

export interface NormativeReference {
  id: string;
  code: string;
  type: 'cpc' | 'ifrs' | 'nbcta' | 'legislation';
  description: string;
  auditsImpacted: number;
  findingsRelated: number;
}

export interface CriticalArea {
  name: string;
  riskLevel: number;
  category: string;
}

export interface TrendDataPoint {
  month: string;
  compliance: number;
  risks: number;
}

export interface AuditDistribution {
  type: string;
  count: number;
  percentage: number;
}
