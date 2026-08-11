// Item 7: Card "Reuso de cache" — mostra eficiência do cache de contas (audit_account_cache),
// dedup de documentos (pipeline_documents.content_hash) e cobertura de embeddings do dicionário.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database, Layers, Brain, TrendingUp } from "lucide-react";

type Stats = {
  cacheRows: number;
  totalHits: number;
  avgHits: number;
  layerBreakdown: { layer: string; count: number }[];
  dedupedDocs: number;
  totalDocsWithHash: number;
  dictTotal: number;
  dictWithEmbedding: number;
  costSavedUsd: number;
};

async function loadStats(): Promise<Stats> {
  const [cacheAgg, layers, dedupRows, dictAgg] = await Promise.all([
    supabase
      .from("audit_account_cache")
      .select("hits", { count: "exact" })
      .limit(2000),
    supabase
      .from("audit_account_cache")
      .select("layer")
      .limit(2000),
    supabase
      .from("pipeline_documents")
      // content_hash recém-criado; cast porque types podem estar atrasados
      .select("content_hash, created_by" as never)
      .not("content_hash" as never, "is", null)
      .limit(2000),
    supabase.from("contabil_dictionary").select("embedding").limit(2000),
  ]);

  const cacheRowsArr = (cacheAgg.data ?? []) as Array<{ hits: number | null }>;
  const cacheRows = cacheRowsArr.length;
  const totalHits = cacheRowsArr.reduce((s, r) => s + (Number(r.hits) || 0), 0);
  const avgHits = cacheRows > 0 ? totalHits / cacheRows : 0;

  const layerCount = new Map<string, number>();
  for (const r of (layers.data ?? []) as Array<{ layer: string | null }>) {
    const k = r.layer || "unknown";
    layerCount.set(k, (layerCount.get(k) ?? 0) + 1);
  }
  const layerBreakdown = Array.from(layerCount.entries())
    .map(([layer, count]) => ({ layer, count }))
    .sort((a, b) => b.count - a.count);

  // Dedup: agrupar por (created_by, content_hash) e contar grupos com mais de 1 ocorrência
  const docs = ((dedupRows.data ?? []) as unknown) as Array<{
    content_hash: string | null;
    created_by: string | null;
  }>;
  const totalDocsWithHash = docs.length;
  const groups = new Map<string, number>();
  for (const d of docs) {
    if (!d.content_hash) continue;
    const k = `${d.created_by ?? ""}::${d.content_hash}`;
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  let dedupedDocs = 0;
  for (const v of groups.values()) if (v > 1) dedupedDocs += v - 1;

  const dictRows = (dictAgg.data ?? []) as Array<{ embedding: unknown }>;
  const dictTotal = dictRows.length;
  const dictWithEmbedding = dictRows.filter((r) => r.embedding).length;

  // Estimativa: cada hit de cache evita ~$0.0001 de embedding + ~$0.00002 de LLM
  const costSavedUsd = totalHits * 0.00012;

  return {
    cacheRows,
    totalHits,
    avgHits,
    layerBreakdown,
    dedupedDocs,
    totalDocsWithHash,
    dictTotal,
    dictWithEmbedding,
    costSavedUsd,
  };
}

export const CacheReuseCard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [running, setRunning] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  useEffect(() => {
    loadStats().then(setStats).catch(() => setStats(null));
  }, []);

  const runBackfill = async () => {
    setRunning(true);
    setBackfillResult(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "dictionary-backfill-embeddings",
        { body: { limit: 600 } },
      );
      if (error) throw error;
      const ok = (data as { ok?: number })?.ok ?? 0;
      const fail = (data as { fail?: number })?.fail ?? 0;
      const cost = (data as { estimatedCostUsd?: number })?.estimatedCostUsd ?? 0;
      setBackfillResult(`✅ ${ok} embeddings gerados (${fail} falhas) — custo estimado US$ ${cost.toFixed(4)}`);
      const s = await loadStats();
      setStats(s);
    } catch (e) {
      setBackfillResult(`❌ ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  if (!stats) {
    return (
      <div className="bg-card rounded-xl border border-border p-5 mb-4">
        <div className="text-xs text-muted-foreground">Carregando métricas de reuso...</div>
      </div>
    );
  }

  const dictPct = stats.dictTotal > 0 ? (stats.dictWithEmbedding / stats.dictTotal) * 100 : 0;
  const dedupPct =
    stats.totalDocsWithHash > 0 ? (stats.dedupedDocs / stats.totalDocsWithHash) * 100 : 0;

  return (
    <div className="bg-card rounded-xl border border-border p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Layers className="w-4 h-4 text-[hsl(217,91%,50%)]" />
          Reuso de Cache & Dedup
        </h4>
        <span className="text-xs text-muted-foreground">
          Economia estimada:{" "}
          <span className="font-semibold text-[hsl(152,70%,45%)]">
            US$ {stats.costSavedUsd.toFixed(4)}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Metric
          icon={<Database className="w-4 h-4" />}
          color="hsl(217,91%,50%)"
          label="Contas em cache"
          value={stats.cacheRows.toLocaleString("pt-BR")}
          sub={`${stats.totalHits.toLocaleString("pt-BR")} hits totais`}
        />
        <Metric
          icon={<TrendingUp className="w-4 h-4" />}
          color="hsl(152,70%,45%)"
          label="Hits médios / conta"
          value={stats.avgHits.toFixed(1)}
          sub="quanto maior, melhor"
        />
        <Metric
          icon={<Layers className="w-4 h-4" />}
          color="#8B5CF6"
          label="Docs deduplicados"
          value={stats.dedupedDocs.toLocaleString("pt-BR")}
          sub={`${dedupPct.toFixed(1)}% do total`}
        />
        <Metric
          icon={<Brain className="w-4 h-4" />}
          color="hsl(38,90%,55%)"
          label="Dicionário c/ embedding"
          value={`${stats.dictWithEmbedding}/${stats.dictTotal}`}
          sub={`${dictPct.toFixed(0)}% cobertura`}
        />
      </div>

      {stats.layerBreakdown.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-muted-foreground mb-1.5">Por camada</div>
          <div className="flex flex-wrap gap-1.5">
            {stats.layerBreakdown.map((l) => (
              <span
                key={l.layer}
                className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-foreground"
              >
                {l.layer}: <span className="font-semibold">{l.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {dictPct < 100 && (
        <div className="border-t border-border pt-3 mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {stats.dictTotal - stats.dictWithEmbedding} termos sem embedding —
            executar backfill habilita as camadas L1/L2 do RAG.
          </div>
          <button
            onClick={runBackfill}
            disabled={running}
            className="text-xs px-3 py-1.5 rounded-md bg-[hsl(217,91%,50%)] text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {running ? "Processando..." : "Rodar backfill"}
          </button>
        </div>
      )}
      {backfillResult && (
        <div className="mt-2 text-xs text-muted-foreground">{backfillResult}</div>
      )}
    </div>
  );
};

const Metric = ({
  icon,
  color,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: string;
  sub?: string;
}) => (
  <div className="rounded-lg border border-border p-3">
    <div
      className="w-7 h-7 rounded-md flex items-center justify-center mb-2"
      style={{ background: `${color}15`, color }}
    >
      {icon}
    </div>
    <div className="text-lg font-bold text-foreground">{value}</div>
    <div className="text-[11px] text-muted-foreground">{label}</div>
    {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
  </div>
);
