/**
 * Cliente para a Edge Function `audit-bs-dados`.
 *
 * Persiste o snapshot consolidado em duas camadas:
 *  - `pipeline_analysis_results` (legacy / compat)
 *  - MD MASTER: `audits` + `balancetes` + `bs_dados` + `indicadores`
 *    (acionado quando `companyId` é informado)
 */
import { supabase } from "@/integrations/supabase/client";

export interface BSDadosLinhaInput {
  conta?: string;
  descricao?: string;
  ref1?: string | null;
  saldo: number;
}
export interface BSDadosBalanceteInput {
  mes: string;
  linhas: BSDadosLinhaInput[];
  /** Usuário marcou no upload que este balancete contém saldos YTD (acumulado desde Jan). */
  is_ytd?: boolean;
}
export interface BSDadosResponse {
  bsDados: any[];
  indicadores: any[];
  kanitz?: any[];
  insights?: {
    diagnostico: string;
    problemas: any[];
    riscos: any[];
    recomendacoes: any[];
    positivos: any[];
    tendencia: string;
    risk_level?: "baixo" | "moderado" | "elevado" | "critico";
    conformidade?: number;
    risk_score?: number;
  };
  summary: { meses: number; total_linhas: number; errors: number };
  persisted?: boolean;
  audit_id?: string | null;
}

export interface ConsolidateOptions {
  documentId?: string;
  companyId?: string;
  fileName?: string;
  variant?: "completo" | "resumido" | "kanitz";
  auditName?: string;
  contentHash?: string;
  processingRunId?: string;
}

export async function consolidateBSDadosOnServer(
  balancetes: BSDadosBalanceteInput[],
  opts: ConsolidateOptions = {},
): Promise<BSDadosResponse> {
  const { data, error } = await supabase.functions.invoke<BSDadosResponse>("audit-bs-dados", {
    body: {
      balancetes,
      document_id: opts.documentId,
      company_id: opts.companyId,
      file_name: opts.fileName,
      variant: opts.variant,
      audit_name: opts.auditName,
      content_hash: opts.contentHash,
      processing_run_id: opts.processingRunId,
    },
  });
  if (error) throw new Error(error.message || "valide o erro que está aparecendo do servidor");
  if (!data) throw new Error("valide o erro que está aparecendo do servidor");
  return data;
}
