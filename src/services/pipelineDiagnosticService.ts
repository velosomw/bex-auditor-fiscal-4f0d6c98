// Orquestrador frontend do Diagnóstico do Pipeline IA
// Encadeia 6 etapas: snapshot KPIs → seed (edge service_role) → audit-pipeline-process
// → validar persistência em pipeline_analysis_results → snapshot KPIs depois.
import { supabase } from "@/integrations/supabase/client";
import { fetchGestorIaIndicators, type GestorIaIndicators } from "./gestorIaIndicatorsService";

export type StepStatus = "pending" | "running" | "ok" | "fail";

export interface DiagnosticStep {
  name: string;
  status: StepStatus;
  detail?: string;
  duration_ms?: number;
}

export interface DiagnosticResult {
  success: boolean;
  steps: DiagnosticStep[];
  before?: GestorIaIndicators;
  after?: GestorIaIndicators;
  document_id?: string;
  analysis_id?: string;
  quality_score?: number;
  error?: string;
}

const STEP_NAMES = [
  "KPIs (antes)",
  "Criar documento sintético",
  "Injetar OCR pronto",
  "Invocar pipeline IA (classify → extração → validação)",
  "Validar persistência (pipeline_analysis_results)",
  "KPIs (depois) — atualização",
];

function makeSteps(): DiagnosticStep[] {
  return STEP_NAMES.map((name) => ({ name, status: "pending" as StepStatus }));
}

// Payload sintético — espelha o OCR injetado pela edge seed.
// Mesma equação contábil (Ativo = Passivo + PL = R$ 1.500.000,00)
const SYNTHETIC_BALANCO = [
  { conta: "1.1.01", descricao: "Caixa e Equivalentes", values: { atual: 150000 } },
  { conta: "1.1.02", descricao: "Contas a Receber",     values: { atual: 320000 } },
  { conta: "1.1.03", descricao: "Estoques",             values: { atual: 180000 } },
  { conta: "1.2.01", descricao: "Imobilizado",          values: { atual: 850000 } },
  { conta: "2.1.01", descricao: "Fornecedores",         values: { atual: 280000 } },
  { conta: "2.2.01", descricao: "Empréstimos",          values: { atual: 420000 } },
  { conta: "2.3.01", descricao: "Patrimônio Líquido",   values: { atual: 800000 } },
];

const SYNTHETIC_DRE = [
  { conta: "3.1.01", descricao: "Receita Bruta de Vendas", values: { atual: 1200000 } },
  { conta: "4.1.01", descricao: "Custo dos Produtos Vendidos", values: { atual: 720000 } },
  { conta: "4.2.01", descricao: "Despesas Operacionais", values: { atual: 280000 } },
];

export async function runPipelineDiagnostic(
  onStep?: (steps: DiagnosticStep[]) => void,
): Promise<DiagnosticResult> {
  const steps = makeSteps();
  const emit = () => onStep?.(steps.map((s) => ({ ...s })));
  let before: GestorIaIndicators | undefined;
  let after: GestorIaIndicators | undefined;
  let document_id: string | undefined;
  let analysis_id: string | undefined;
  let quality_score: number | undefined;

  const run = async <T,>(idx: number, fn: () => Promise<T>): Promise<T> => {
    steps[idx].status = "running";
    emit();
    const t0 = performance.now();
    try {
      const result = await fn();
      steps[idx].duration_ms = Math.round(performance.now() - t0);
      steps[idx].status = "ok";
      emit();
      return result;
    } catch (e) {
      steps[idx].duration_ms = Math.round(performance.now() - t0);
      steps[idx].status = "fail";
      steps[idx].detail = e instanceof Error ? e.message : String(e);
      emit();
      throw e;
    }
  };

  try {
    // 1. KPIs (antes)
    before = await run(0, () => fetchGestorIaIndicators(12));

    // 2 + 3. Seed sintético (1 chamada → cria doc + ocr)
    const seed = await run(1, async () => {
      const { data, error } = await supabase.functions.invoke("pipeline-diagnostic-seed");
      if (error) throw new Error(error.message || "Falha no seed");
      if (!data?.document_id) throw new Error("Seed não retornou document_id");
      return data as { document_id: string };
    });
    document_id = seed.document_id;
    // marca etapa 3 como ok (mesma chamada injetou OCR)
    steps[2].status = "ok";
    steps[2].detail = "OCR sintético injetado junto ao documento";
    emit();

    // 4. Pipeline real (audit-pipeline-process)
    await run(3, async () => {
      const { data, error } = await supabase.functions.invoke("audit-pipeline-process", {
        body: {
          document_id,
          file_name: `DIAG-${Date.now()}.txt`,
          ocr_score: 0.95,
          balanco: SYNTHETIC_BALANCO,
          dre: SYNTHETIC_DRE,
          documentInfo: {
            empresa: "BEx Diagnóstico LTDA",
            periodo: "2024-12-31",
            tipo: "diagnostic",
          },
        },
      });
      if (error) throw new Error(error.message || "Falha no pipeline IA");
      if (data?.error) throw new Error(String(data.error));
      return data;
    });

    // 5. Verifica persistência
    await run(4, async () => {
      const { data, error } = await supabase
        .from("pipeline_analysis_results")
        .select("id, quality_score, validation_score, mapping_score, ocr_score")
        .eq("document_id", document_id!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Nenhum registro em pipeline_analysis_results");
      analysis_id = data.id;
      quality_score = Number(data.quality_score || 0);
      steps[4].detail = `quality_score=${(quality_score * 100).toFixed(1)}% · id=${data.id.slice(0, 8)}…`;
      return data;
    });

    // 6. KPIs (depois) — exige crescimento
    after = await run(5, async () => {
      const next = await fetchGestorIaIndicators(12);
      const beforeCount = before!.kpis.documentosAuditados;
      const afterCount = next.kpis.documentosAuditados;
      if (afterCount <= beforeCount) {
        throw new Error(`KPIs não atualizaram (antes=${beforeCount} · depois=${afterCount})`);
      }
      steps[5].detail = `runs ${beforeCount} → ${afterCount} · acurácia ${before!.kpis.acuraciaIA}% → ${next.kpis.acuraciaIA}%`;
      return next;
    });

    return {
      success: true,
      steps,
      before,
      after,
      document_id,
      analysis_id,
      quality_score,
    };
  } catch (e) {
    return {
      success: false,
      steps,
      before,
      after,
      document_id,
      analysis_id,
      quality_score,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
