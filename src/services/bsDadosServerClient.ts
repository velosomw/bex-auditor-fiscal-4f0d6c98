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
}
export interface BSDadosResponse {
  bsDados: any[];
  indicadores: any[];
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
    },
  });
  if (error) throw new Error(error.message || "Falha ao consolidar BS & Dados no servidor");
  if (!data) throw new Error("Resposta vazia do servidor");
  return data;
}
