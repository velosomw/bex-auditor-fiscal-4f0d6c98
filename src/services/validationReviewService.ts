import { supabase } from "@/integrations/supabase/client";

export interface ReviewBalancete {
  id: string;
  file_name: string;
  mes_referencia: string;
  total_linhas: number;
  company_id: string | null;
  company_name: string | null;
}

export interface ReviewLine {
  id: string;
  conta: string;
  descricao: string | null;
  ref1: string | null;
  categoria: string | null;
  subcategoria: string | null;
  saldo: number;
  confidence: number;
  status: "ok" | "duvida" | "erro";
}

const toStatus = (conf: number, categoria: string | null): ReviewLine["status"] => {
  if (!categoria || !categoria.trim()) return "erro";
  if (conf >= 0.85) return "ok";
  if (conf >= 0.6) return "duvida";
  return "erro";
};

export async function listRecentBalancetes(limit = 25): Promise<ReviewBalancete[]> {
  const { data: bs, error } = await supabase
    .from("balancetes")
    .select("id, file_name, mes_referencia, total_linhas, audit_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !bs?.length) return [];

  const auditIds = Array.from(new Set(bs.map((b: any) => b.audit_id).filter(Boolean)));
  const { data: audits } = auditIds.length
    ? await supabase.from("audits").select("id, company_id").in("id", auditIds)
    : { data: [] as any[] };
  const auditMap = new Map((audits ?? []).map((a: any) => [a.id, a.company_id]));

  const companyIds = Array.from(new Set((audits ?? []).map((a: any) => a.company_id).filter(Boolean)));
  const { data: companies } = companyIds.length
    ? await supabase.from("companies").select("id, name").in("id", companyIds)
    : { data: [] as any[] };
  const compMap = new Map((companies ?? []).map((c: any) => [c.id, c.name]));

  return bs.map((b: any) => {
    const company_id = auditMap.get(b.audit_id) ?? null;
    return {
      id: b.id,
      file_name: b.file_name,
      mes_referencia: b.mes_referencia,
      total_linhas: b.total_linhas,
      company_id,
      company_name: company_id ? (compMap.get(company_id) ?? null) : null,
    };
  });
}

export async function loadBalanceteLines(balanceteId: string, limit = 200): Promise<ReviewLine[]> {
  const { data, error } = await supabase
    .from("balancete_lines")
    .select("id, conta, descricao, ref1, categoria, subcategoria, saldo, confidence")
    .eq("balancete_id", balanceteId)
    .order("conta", { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r: any) => ({
    id: r.id,
    conta: r.conta,
    descricao: r.descricao,
    ref1: r.ref1,
    categoria: r.categoria,
    subcategoria: r.subcategoria,
    saldo: Number(r.saldo ?? 0),
    confidence: Number(r.confidence ?? 0),
    status: toStatus(Number(r.confidence ?? 0), r.categoria),
  }));
}

export async function updateLine(id: string, patch: Partial<Pick<ReviewLine, "categoria" | "subcategoria" | "ref1">>) {
  const { error } = await supabase
    .from("balancete_lines")
    .update({ ...patch, confidence: 1 })
    .eq("id", id);
  if (error) throw error;
}

export async function teachMapping(line: ReviewLine) {
  const normalized = (line.descricao || line.conta)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const { error } = await supabase
    .from("account_mapping")
    .upsert(
      {
        original_name: line.descricao || line.conta,
        original_normalized: normalized,
        ref1: line.ref1,
        categoria: line.categoria || "Outros",
        subcategoria: line.subcategoria,
        confidence: 1,
        source: "human",
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "original_normalized" },
    );
  if (error) throw error;
}
