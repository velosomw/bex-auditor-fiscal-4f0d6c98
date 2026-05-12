import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AIJobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface AIJob {
  id: string;
  kind: "insight" | "report" | "custom";
  status: AIJobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  document_id: string | null;
  company_id: string | null;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface EnqueueAIJobInput {
  kind: "insight" | "report" | "custom";
  payload: Record<string, unknown>;
  document_id?: string | null;
  company_id?: string | null;
  /** 1 (baixa) – 10 (alta), default 5 */
  priority?: number;
}

/**
 * Enfileira um job assíncrono de IA. Retorna { job_id } imediatamente (HTTP 202).
 * Use o hook `useAIJob(jobId)` para acompanhar o status em tempo real.
 */
export async function enqueueAIJob(
  input: EnqueueAIJobInput,
): Promise<{ job_id: string; status: "queued" }> {
  const { data, error } = await supabase.functions.invoke<{ job_id: string; status: "queued" }>(
    "enqueue-ai-job",
    { body: input },
  );
  if (error) throw new Error(error.message || "enqueue_failed");
  if (!data?.job_id) throw new Error("invalid_response");
  return data;
}

/**
 * Cancela um job que ainda está na fila (não em processamento).
 * Apenas o requisitante (ou gestor) consegue cancelar via RLS.
 */
export async function cancelAIJob(jobId: string): Promise<void> {
  const { error } = await supabase
    .from("ai_jobs")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "queued");
  if (error) throw new Error(error.message);
}

/**
 * Hook React: assina o job_id via Realtime e expõe status/result/erro.
 * Faz um fetch inicial para o estado atual e atualiza incrementalmente.
 */
export function useAIJob(jobId: string | null | undefined) {
  const [job, setJob] = useState<AIJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    // 1) snapshot inicial
    supabase
      .from("ai_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setJob((data as AIJob) ?? null);
        setLoading(false);
      });

    // 2) realtime (UPDATE no row específico)
    const channel = supabase
      .channel(`ai_job_${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ai_jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          if (!cancelled) setJob(payload.new as AIJob);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  const isTerminal = job?.status === "completed" || job?.status === "failed" || job?.status === "cancelled";

  return { job, loading, error, isTerminal };
}
