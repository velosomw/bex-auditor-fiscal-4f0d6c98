/**
 * Cliente para a Edge Function `audit-bs-dados`.
 *
 * Uso recomendado:
 *  - Geração de relatórios PDF/server-side (snapshot persistido em pipeline_analysis_results).
 *  - Revalidação dos números BS & Dados pelo backend (auditabilidade).
 *
 * O frontend continua usando `bsDadosBuilder.ts` para a UI em tempo real (offline-first).
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
}

export async function consolidateBSDadosOnServer(
  balancetes: BSDadosBalanceteInput[],
  documentId?: string,
): Promise<BSDadosResponse> {
  const { data, error } = await supabase.functions.invoke<BSDadosResponse>("audit-bs-dados", {
    body: { balancetes, document_id: documentId },
  });
  if (error) throw new Error(error.message || "Falha ao consolidar BS & Dados no servidor");
  if (!data) throw new Error("Resposta vazia do servidor");
  return data;
}
