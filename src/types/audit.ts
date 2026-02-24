export type AuditDepth = 'executive' | 'technical' | 'formal';
export type AuditPurpose = 'external' | 'internal' | 'fiscal' | 'defense' | 'review';
export type FindingType = 'inconsistency' | 'omission' | 'impropriety' | 'control_weakness';
export type ImpactType = 'patrimonial' | 'result' | 'disclosure';
export type AuditStep = 1 | 2 | 3 | 4 | 5;

export interface AuditConfig {
  file: File | null;
  depth: AuditDepth;
  purpose: AuditPurpose;
}

export interface AuditTopic {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: 'evaluation' | 'compliance' | 'risks' | 'controls';
}

export interface AuditFinding {
  id: string;
  description: string;
  findingType: FindingType;
  normativeFramework: {
    cpc?: string;
    ifrs?: string;
    nbcTa?: string;
    legislation?: string;
  };
  riskLevel: 'low' | 'medium' | 'high';
  impactType: ImpactType[];
  technicalBasis: string;
  recommendation?: string;
  documentReference?: string;
}

export interface ReportSection {
  id: string;
  title: string;
  content: string;
  includeOpinion: boolean;
  suggestions?: string[];
}

export interface OnDemandContent {
  id: string;
  type: 'opinion' | 'conclusion' | 'financial_impact' | 'user_risk';
  title: string;
  description: string;
  content?: string;
  generated: boolean;
}

export interface AuditState {
  currentStep: AuditStep;
  config: AuditConfig;
  topics: AuditTopic[];
  findings: AuditFinding[];
  reportSections: ReportSection[];
  onDemandContents: OnDemandContent[];
}
