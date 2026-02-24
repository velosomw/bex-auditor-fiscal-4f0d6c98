export type AuditDepth = 'executive' | 'technical' | 'formal' | 'financial';
export type AuditPurpose = 'external' | 'internal' | 'fiscal' | 'defense' | 'review';
export type FindingType = 'inconsistency' | 'omission' | 'impropriety' | 'control_weakness';
export type ImpactType = 'patrimonial' | 'result' | 'disclosure';
export type DocumentType = 'balanco' | 'dre' | 'dfc' | 'notas' | 'outro';
export type DocumentTag = 'carregado' | 'parcial' | 'pendente' | 'risco';
export type AuditStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type ScopeIssueType = 'issue' | 'desvio' | 'risco' | 'problema_tecnico';
export type ValidationStatus = 'validado' | 'com_ressalva' | 'inconsistente';

export interface UploadedDocument {
  id: string;
  fileName: string;
  fileSize: number;
  type: DocumentType;
  parsed: boolean;
  tags: DocumentTag[];
}

export interface CompanyData {
  ativoCirculante: number;
  ativoNaoCirculante: number;
  passivoCirculante: number;
  passivoNaoCirculante: number;
  patrimonioLiquido: number;
  receitaLiquida: number;
  lucroLiquido: number;
  duplicatasDescontadas: number;
  estoques: number;
  custoMercadoriasVendidas: number;
  contasReceber: number;
  fornecedores: number;
  resultadoOperacional: number;
  despesasFinanceiras: number;
  imobilizado: number;
  caixaEquivalentes: number;
}

export interface CompanyDataMultiYear {
  [year: string]: CompanyData;
}

export interface AuditConfig {
  files: UploadedDocument[];
  depth: AuditDepth;
  purpose: AuditPurpose;
  entityData: CompanyDataMultiYear;
}

export interface ScopeCheckItem {
  id: string;
  category: 'patrimonial' | 'resultado' | 'fluxo_caixa';
  name: string;
  description: string;
  enabled: boolean;
  issueType?: ScopeIssueType;
  normReference?: string;
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
  materiality?: string;
}

export interface BalancoRow {
  conta: string;
  descricao: string;
  values: { [year: string]: number };
  tag?: DocumentTag;
  adjusted?: boolean;
  hasRisk?: boolean;
}

export interface FinancialIndicators {
  liquidezCorrente: number;
  liquidezSeca: number;
  liquidezGeral: number;
  liquidezImediata: number;
  endividamentoGeral: number;
  composicaoEndividamento: number;
  imobilizacaoPL: number;
  giroAtivo: number;
  pmr: number;
  pmp: number;
  margemLiquida: number;
  margemOperacional: number;
  roa: number;
  roe: number;
  idadeMediaEstoque: number;
  cicloOperacional: number;
  cicloCaixa: number;
  coberturaJuros: number;
}

export interface HorizontalAnalysis {
  rows: Array<{
    conta: string;
    descricao: string;
    baseValue: number;
    currentValue: number;
    variation: number;
    alert?: boolean;
  }>;
}

export interface VerticalAnalysis {
  rows: Array<{
    conta: string;
    descricao: string;
    value: number;
    percentage: number;
    alert?: boolean;
  }>;
}

export interface FinancialAnalysis {
  indicators: { [year: string]: FinancialIndicators };
  horizontalAnalysis: HorizontalAnalysis;
  verticalAnalysis: VerticalAnalysis;
  insolvencyScore: number;
  insolvencyClassification: 'insolvencia' | 'atencao' | 'solidez';
  solvencyConclusion: string;
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
  scopeChecks: ScopeCheckItem[];
  findings: AuditFinding[];
  balancoRows: BalancoRow[];
  dreRows: BalancoRow[];
  financialAnalysis: FinancialAnalysis;
  reportSections: ReportSection[];
  onDemandContents: OnDemandContent[];
  dreValidation: ValidationStatus;
}
