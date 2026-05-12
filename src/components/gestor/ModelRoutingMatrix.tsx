import { Badge } from "@/components/ui/badge";
import { GitBranch, Sparkles, Cpu, AlertTriangle, ShieldAlert, Activity, Zap } from "lucide-react";

// Espelha supabase/functions/_shared/model-router.ts (fonte: backend)
type Criticality = "low" | "medium" | "high";

interface ProcessRow {
  process: string;
  description: string;
  models: Record<Criticality, { model: string; provider: "google" | "openai" }>;
  triggerForGpt5: string | null;
}

const ROWS: ProcessRow[] = [
  {
    process: "OCR / Parse de Documento",
    description: "Leitura de PDF, balancete, DRE, extratos.",
    models: {
      low: { model: "gemini-2.5-flash-lite", provider: "google" },
      medium: { model: "gemini-3-flash-preview", provider: "google" },
      high: { model: "gemini-2.5-pro", provider: "google" },
    },
    triggerForGpt5: null,
  },
  {
    process: "Estruturação Document AI",
    description: "Conversão de OCR bruto em JSON contábil.",
    models: {
      low: { model: "gemini-2.5-flash-lite", provider: "google" },
      medium: { model: "gemini-2.5-flash", provider: "google" },
      high: { model: "gemini-2.5-pro", provider: "google" },
    },
    triggerForGpt5: null,
  },
  {
    process: "Insights de Auditoria",
    description: "Resumo, pontos de atenção e recomendações.",
    models: {
      low: { model: "gemini-3-flash-preview", provider: "google" },
      medium: { model: "gemini-2.5-pro", provider: "google" },
      high: { model: "gpt-5", provider: "openai" },
    },
    triggerForGpt5: "2+ sinais críticos: PL≤0, LC<1, EG>80%, balanço desbalanceado",
  },
  {
    process: "Análise de Risco Avançado",
    description: "Recuperação Judicial, BEX-RJ, Kanitz, solvência.",
    models: {
      low: { model: "gpt-5-mini", provider: "openai" },
      medium: { model: "gpt-5", provider: "openai" },
      high: { model: "gpt-5", provider: "openai" },
    },
    triggerForGpt5: "Sempre — raciocínio profundo obrigatório",
  },
  {
    process: "Chat Auditor IA",
    description: "Assistente conversacional técnico.",
    models: {
      low: { model: "gemini-3-flash-preview", provider: "google" },
      medium: { model: "gemini-3-flash-preview", provider: "google" },
      high: { model: "gemini-2.5-pro", provider: "google" },
    },
    triggerForGpt5: null,
  },
  {
    process: "Embeddings",
    description: "Vetorização do dicionário contábil.",
    models: {
      low: { model: "text-embedding-004", provider: "google" },
      medium: { model: "text-embedding-004", provider: "google" },
      high: { model: "text-embedding-004", provider: "google" },
    },
    triggerForGpt5: null,
  },
  {
    process: "Geração de Relatório",
    description: "Relatório final A4, PDF/Word.",
    models: {
      low: { model: "gemini-3-flash-preview", provider: "google" },
      medium: { model: "gemini-2.5-pro", provider: "google" },
      high: { model: "gpt-5", provider: "openai" },
    },
    triggerForGpt5: "Empresa em risco crítico (RJ iminente)",
  },
];

const CRITICALITY_META: Record<Criticality, { label: string; color: string; icon: typeof Activity }> = {
  low: { label: "Baixa", color: "hsl(152,70%,45%)", icon: Activity },
  medium: { label: "Média", color: "hsl(38,90%,55%)", icon: AlertTriangle },
  high: { label: "Alta", color: "hsl(0,75%,55%)", icon: ShieldAlert },
};

const ProviderBadge = ({ provider, model }: { provider: "google" | "openai"; model: string }) => {
  const isOpenAI = provider === "openai";
  return (
    <div className="flex items-center gap-1.5">
      {isOpenAI ? (
        <Cpu className="w-3 h-3 text-[hsl(152,70%,45%)] shrink-0" />
      ) : (
        <Sparkles className="w-3 h-3 text-[hsl(38,90%,55%)] shrink-0" />
      )}
      <code
        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
          isOpenAI
            ? "bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)]"
            : "bg-[hsl(38,90%,55%)]/10 text-[hsl(38,90%,55%)]"
        }`}
      >
        {model}
      </code>
    </div>
  );
};

const ModelRoutingMatrix = () => {
  return (
    <div className="space-y-5">
      {/* ── Header explicativo ─────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-[hsl(217,91%,50%)]/8 to-[hsl(258,90%,66%)]/5 rounded-xl border border-border p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[hsl(217,91%,50%)]/15 flex items-center justify-center shrink-0">
            <GitBranch className="w-5 h-5 text-[hsl(217,91%,50%)]" />
          </div>
          <div className="flex-1">
            <h4 className="text-base font-bold text-foreground flex items-center gap-2">
              Roteamento Automático de Modelos por Criticidade
              <Badge className="bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)] text-[10px] uppercase border-0">
                Ativo
              </Badge>
            </h4>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              O portal seleciona automaticamente o modelo de IA para cada processo com base na{" "}
              <strong>criticidade dos sinais financeiros</strong>. <strong>Gemini é o padrão</strong> (custo
              ~5–10× menor, contexto 1M tokens, multimodal nativo). <strong>OpenAI GPT-5 é acionado
              apenas para análise de risco avançado</strong> ou quando 2+ sinais críticos forem detectados.
            </p>
          </div>
        </div>
      </div>

      {/* ── Critérios de criticidade ───────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h4 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-[hsl(258,90%,66%)]" />
          Definição funcional por criticidade
        </h4>
        <div className="grid md:grid-cols-3 gap-3">
          {(Object.keys(CRITICALITY_META) as Criticality[]).map((k) => {
            const meta = CRITICALITY_META[k];
            const Icon = meta.icon;
            return (
              <div
                key={k}
                className="rounded-lg border border-border p-3"
                style={{ background: `${meta.color}08` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4" style={{ color: meta.color }} />
                  <span className="text-sm font-bold" style={{ color: meta.color }}>
                    Criticidade {meta.label}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {k === "low" && "Nenhum sinal de risco. Indicadores normais. Modelo mais barato (Flash-Lite/Flash)."}
                  {k === "medium" && "1 sinal de risco isolado (ex.: liquidez baixa). Gemini Pro para precisão extra."}
                  {k === "high" && "2+ sinais críticos: PL≤0, balanço desbalanceado, liquidez<1, endividamento>80%, Kanitz<−3. Escala para GPT-5."}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Matriz de roteamento ───────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/20">
          <h4 className="text-sm font-bold text-foreground">Matriz Processo × Criticidade → Modelo</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Tabela usada pelo router em <code className="bg-muted px-1 rounded font-mono">_shared/model-router.ts</code> e
            carregada por todas as Edge Functions de IA.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Processo</th>
                <th className="text-left px-4 py-3 font-semibold">Baixa</th>
                <th className="text-left px-4 py-3 font-semibold">Média</th>
                <th className="text-left px-4 py-3 font-semibold">Alta</th>
                <th className="text-left px-4 py-3 font-semibold">Trigger GPT-5</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr key={row.process} className={i % 2 === 0 ? "bg-background" : "bg-muted/10"}>
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-foreground">{row.process}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{row.description}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <ProviderBadge {...row.models.low} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <ProviderBadge {...row.models.medium} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <ProviderBadge {...row.models.high} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    {row.triggerForGpt5 ? (
                      <span className="text-[10px] text-foreground/80 leading-snug">
                        {row.triggerForGpt5}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">— Gemini sempre</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Override de ambiente ───────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h4 className="text-xs font-bold text-foreground uppercase tracking-wide mb-2">
          Override emergencial (controle de custos)
        </h4>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Para forçar todo o pipeline em um único provedor (útil em incidente de billing), defina a secret de
          ambiente <code className="bg-muted px-1 rounded font-mono">BEX_FORCE_PROVIDER</code> com o valor{" "}
          <code className="bg-muted px-1 rounded font-mono">google</code> ou{" "}
          <code className="bg-muted px-1 rounded font-mono">openai</code>. O router aplica fallback equivalente
          automaticamente, sem alterar código.
        </p>
      </div>
    </div>
  );
};

export default ModelRoutingMatrix;
