import { supabase } from "@/integrations/supabase/client";

export interface LearningRow { original: string; padrao: string; freq: number; conf: number; }
export interface DatasetRow { doc: string; empresa: string; data: string; score: number; gold: boolean; }
export interface PerfStats {
  ocr: number;          // %
  mapping: number;      // %
  validation: number;   // %
  quality: number;      // %
  totalDocs: number;
  validatedCount: number;
  trend: { mes: string; precisao: number }[];
  errors: { mes: string; erros: number }[];
}

const monthLabel = (d: Date) => d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

export const loadLearningRows = async (limit = 100): Promise<LearningRow[]> => {
  const { data } = await supabase
    .from("contabil_dictionary")
    .select("termo_original, termo_padrao, frequencia")
    .order("frequencia", { ascending: false })
    .limit(limit);
  return (data ?? []).map(d => ({
    original: d.termo_original,
    padrao: d.termo_padrao,
    freq: d.frequencia ?? 1,
    conf: Math.min(99, 70 + (d.frequencia ?? 1)),
  }));
};

export const loadDatasetRows = async (limit = 50): Promise<DatasetRow[]> => {
  const { data: validated } = await supabase
    .from("dataset_validated")
    .select("id, document_id, created_at, notes")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!validated || validated.length === 0) return [];
  const docIds = validated.map(v => v.document_id).filter(Boolean) as string[];
  const { data: docs } = docIds.length
    ? await supabase.from("pipeline_documents").select("id, file_name, company_id").in("id", docIds)
    : { data: [] as any[] };
  const companyIds = (docs ?? []).map(d => d.company_id).filter(Boolean) as string[];
  const { data: companies } = companyIds.length
    ? await supabase.from("companies").select("id, name").in("id", companyIds)
    : { data: [] as any[] };
  const companyMap = new Map((companies ?? []).map(c => [c.id, c.name]));
  const docMap = new Map((docs ?? []).map(d => [d.id, d]));
  return validated.map(v => {
    const doc = v.document_id ? docMap.get(v.document_id) : null;
    return {
      doc: doc?.file_name ?? "documento",
      empresa: doc?.company_id ? (companyMap.get(doc.company_id) ?? "—") : "—",
      data: new Date(v.created_at).toLocaleDateString("pt-BR"),
      score: 90,
      gold: (v.notes ?? "").toLowerCase().includes("gold"),
    };
  });
};

export const loadPerfStats = async (): Promise<PerfStats> => {
  const [{ data: analyses }, { data: ocrRows }] = await Promise.all([
    supabase
      .from("pipeline_analysis_results")
      .select("ocr_score, mapping_score, validation_score, quality_score, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("ocr_results")
      .select("ocr_score, created_at, provider")
      .order("created_at", { ascending: false }),
  ]);
  const { count: totalDocs } = await supabase.from("pipeline_documents").select("id", { count: "exact", head: true });
  const { count: validatedCount } = await supabase.from("dataset_validated").select("id", { count: "exact", head: true });

  const arr = analyses ?? [];
  const ocrArr = ocrRows ?? [];

  // OCR % prefere histórico real de ocr_results; fallback para pipeline_analysis_results
  const ocrAvg = ocrArr.length
    ? Math.round((ocrArr.reduce((s, r: any) => s + (Number(r.ocr_score) || 0), 0) / ocrArr.length) * 100)
    : (arr.length ? Math.round((arr.reduce((s, a: any) => s + (a.ocr_score ?? 0), 0) / arr.length) * 100) : 0);

  const avg = (key: "mapping_score" | "validation_score" | "quality_score") =>
    arr.length ? Math.round((arr.reduce((s, a: any) => s + (a[key] ?? 0), 0) / arr.length) * 100) : 0;

  // Janela móvel de 7 meses
  const months: { key: string; label: string; vals: number[]; ocrVals: number[]; errs: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: monthLabel(d), vals: [], ocrVals: [], errs: 0 });
  }
  arr.forEach((a: any) => {
    const d = new Date(a.created_at);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    const m = months.find(x => x.key === k);
    if (!m) return;
    if (a.quality_score) m.vals.push(Math.round(a.quality_score * 100));
    if (a.validation_score && a.validation_score < 0.8) m.errs += 1;
  });
  ocrArr.forEach((r: any) => {
    const d = new Date(r.created_at);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    const m = months.find(x => x.key === k);
    if (!m) return;
    if (r.ocr_score) m.ocrVals.push(Math.round(Number(r.ocr_score) * 100));
  });

  // Tendência: combina precisão geral + OCR real quando disponível
  const trend = months
    .filter(m => m.vals.length > 0 || m.ocrVals.length > 0)
    .map(m => {
      const allVals = [...m.vals, ...m.ocrVals];
      return {
        mes: m.label,
        precisao: Math.round(allVals.reduce((a, b) => a + b, 0) / allVals.length),
      };
    });

  return {
    ocr: ocrAvg,
    mapping: avg("mapping_score"),
    validation: avg("validation_score"),
    quality: avg("quality_score"),
    totalDocs: totalDocs ?? 0,
    validatedCount: validatedCount ?? 0,
    trend,
    errors: months.map(m => ({ mes: m.label, erros: m.errs })),
  };
};
