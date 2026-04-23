import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Cloud, FileSearch, Sparkles, Brain, Cpu, CheckCircle2,
  XCircle, Eye, EyeOff, KeyRound, Settings2, Zap,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────
type ProviderId = "lovable_cloud" | "google_document_ai" | "gemini" | "vertex_ai" | "openai_gpt";
type Capability = "ocr" | "reasoning" | "report" | "embeddings";

interface ProviderConfig {
  id: ProviderId;
  enabled: boolean;
  apiKey: string;
  // Provider-specific extras
  projectId?: string;     // Google Cloud project (Document AI, Vertex)
  location?: string;      // Region (us, eu, southamerica-east1...)
  processorId?: string;   // Document AI processor ID
  model?: string;         // Default model to use (gemini-2.5-flash, gpt-5-mini...)
}

interface PipelineConfig {
  ocr: ProviderId;        // Document reading
  reasoning: ProviderId;  // Analysis
  report: ProviderId;     // Final report generation
}

// ─── Provider catalog ────────────────────────────────────────
const PROVIDERS: {
  id: ProviderId;
  name: string;
  vendor: string;
  icon: typeof Cloud;
  color: string;
  description: string;
  capabilities: Capability[];
  fields: Array<"apiKey" | "projectId" | "location" | "processorId" | "model">;
  models?: string[];
  managed?: boolean;
}[] = [
  {
    id: "lovable_cloud",
    name: "Lovable AI Gateway",
    vendor: "Lovable Cloud (managed)",
    icon: Cloud,
    color: "hsl(258,90%,66%)",
    description: "API key gerenciada pela plataforma. Sem configuração — usa Gemini e GPT via gateway seguro.",
    capabilities: ["reasoning", "report"],
    fields: ["model"],
    models: [
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash-lite",
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
    ],
    managed: true,
  },
  {
    id: "google_document_ai",
    name: "Google Cloud Document AI",
    vendor: "Google Cloud",
    icon: FileSearch,
    color: "hsl(200,90%,50%)",
    description: "OCR + parser estruturado para PDFs, balancetes e demonstrativos contábeis.",
    capabilities: ["ocr"],
    fields: ["apiKey", "projectId", "location", "processorId"],
  },
  {
    id: "gemini",
    name: "Gemini API",
    vendor: "Google AI Studio",
    icon: Sparkles,
    color: "hsl(38,90%,55%)",
    description: "Modelos Gemini 2.5 (Pro/Flash) para análise contábil e geração de relatórios.",
    capabilities: ["reasoning", "report", "embeddings"],
    fields: ["apiKey", "model"],
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-flash-preview"],
  },
  {
    id: "vertex_ai",
    name: "Vertex AI",
    vendor: "Google Cloud",
    icon: Brain,
    color: "hsl(280,80%,60%)",
    description: "Vertex AI para deploy de modelos Gemini com isolamento empresarial e SLA.",
    capabilities: ["reasoning", "report", "embeddings"],
    fields: ["apiKey", "projectId", "location", "model"],
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "text-embedding-004"],
  },
  {
    id: "openai_gpt",
    name: "OpenAI GPT",
    vendor: "OpenAI",
    icon: Cpu,
    color: "hsl(152,70%,45%)",
    description: "GPT-5 e variantes para fallback e validação cruzada (cross-checking).",
    capabilities: ["reasoning", "report"],
    fields: ["apiKey", "model"],
    models: ["gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-4.1"],
  },
];

const CAPABILITY_LABELS: Record<Capability, string> = {
  ocr: "OCR / Leitura de PDF",
  reasoning: "Raciocínio / Análise",
  report: "Geração de Relatório",
  embeddings: "Embeddings",
};

const STORAGE_KEY = "bex.gestor-ia.ai-providers";
const PIPELINE_KEY = "bex.gestor-ia.ai-pipeline";

// ─── Defaults ────────────────────────────────────────────────
const DEFAULT_CONFIGS: Record<ProviderId, ProviderConfig> = {
  lovable_cloud: { id: "lovable_cloud", enabled: true, apiKey: "", model: "google/gemini-2.5-flash" },
  google_document_ai: { id: "google_document_ai", enabled: true, apiKey: "••• armazenada como secret •••", projectId: "", location: "us", processorId: "" },
  gemini: { id: "gemini", enabled: false, apiKey: "", model: "gemini-2.5-flash" },
  vertex_ai: { id: "vertex_ai", enabled: false, apiKey: "", projectId: "", location: "us-central1", model: "gemini-2.5-pro" },
  openai_gpt: { id: "openai_gpt", enabled: false, apiKey: "", model: "gpt-5-mini" },
};

const DEFAULT_PIPELINE: PipelineConfig = {
  ocr: "google_document_ai",
  reasoning: "lovable_cloud",
  report: "lovable_cloud",
};

// ─── Component ───────────────────────────────────────────────
const AIProvidersConfig = () => {
  const [configs, setConfigs] = useState<Record<ProviderId, ProviderConfig>>(DEFAULT_CONFIGS);
  const [pipeline, setPipeline] = useState<PipelineConfig>(DEFAULT_PIPELINE);
  const [expanded, setExpanded] = useState<ProviderId | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setConfigs({ ...DEFAULT_CONFIGS, ...JSON.parse(raw) });
      const rawPipe = localStorage.getItem(PIPELINE_KEY);
      if (rawPipe) setPipeline({ ...DEFAULT_PIPELINE, ...JSON.parse(rawPipe) });
    } catch (e) {
      console.warn("AIProvidersConfig: failed to restore", e);
    }
  }, []);

  const updateConfig = (id: ProviderId, patch: Partial<ProviderConfig>) => {
    setConfigs((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const saveAll = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
      localStorage.setItem(PIPELINE_KEY, JSON.stringify(pipeline));
      toast.success("Configurações de APIs salvas com sucesso!");
    } catch (e) {
      toast.error("Não foi possível salvar as configurações.");
    }
  };

  const testProvider = (id: ProviderId) => {
    const cfg = configs[id];
    const provider = PROVIDERS.find((p) => p.id === id)!;
    if (provider.managed) {
      toast.success(`${provider.name} está pronto (gerenciado).`);
      return;
    }
    if (!cfg.apiKey) {
      toast.error(`Informe a API Key de ${provider.name} antes de testar.`);
      return;
    }
    toast.success(`Conexão simulada com ${provider.name} bem-sucedida.`);
  };

  const enabledProvidersFor = (cap: Capability) =>
    PROVIDERS.filter((p) => p.capabilities.includes(cap) && configs[p.id]?.enabled);

  return (
    <div className="space-y-6">
      {/* ── Pipeline Configuration ─────────────────────────── */}
      <div className="bg-gradient-to-br from-[hsl(258,90%,66%)]/8 to-[hsl(200,90%,50%)]/5 rounded-xl border border-border p-5">
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h4 className="text-base font-bold text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Pipeline de Processamento
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Defina qual API processa cada etapa: leitura do documento → análise → geração do relatório.
            </p>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {(["ocr", "reasoning", "report"] as Capability[]).map((cap) => {
            const opts = enabledProvidersFor(cap);
            return (
              <div key={cap} className="bg-card rounded-lg border border-border p-3">
                <Label className="text-xs font-semibold text-muted-foreground">
                  {CAPABILITY_LABELS[cap]}
                </Label>
                <Select
                  value={pipeline[cap as keyof PipelineConfig]}
                  onValueChange={(v) => setPipeline((p) => ({ ...p, [cap]: v as ProviderId }))}
                >
                  <SelectTrigger className="mt-1.5 h-9 text-sm">
                    <SelectValue placeholder="Selecione um provedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {opts.length === 0 && (
                      <SelectItem value="__none" disabled>
                        Nenhum provedor habilitado
                      </SelectItem>
                    )}
                    {opts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Provider Cards ─────────────────────────────────── */}
      <div className="grid gap-3">
        {PROVIDERS.map((provider) => {
          const cfg = configs[provider.id];
          const isExpanded = expanded === provider.id;
          const Icon = provider.icon;

          return (
            <div key={provider.id} className="bg-card rounded-xl border border-border overflow-hidden">
              {/* Header */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${provider.color}15` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: provider.color }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm text-foreground">{provider.name}</h4>
                      {provider.managed && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[hsl(258,90%,66%)]/10 text-[hsl(258,90%,66%)]">
                          Gerenciado
                        </span>
                      )}
                      {cfg.enabled ? (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-[hsl(152,70%,45%)]">
                          <CheckCircle2 className="w-3 h-3" /> Ativo
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                          <XCircle className="w-3 h-3" /> Inativo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{provider.description}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {provider.capabilities.map((c) => (
                        <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {CAPABILITY_LABELS[c]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Switch
                    checked={cfg.enabled}
                    onCheckedChange={(v) => updateConfig(provider.id, { enabled: v })}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setExpanded(isExpanded ? null : provider.id)}
                  >
                    <Settings2 className="w-3 h-3" /> {isExpanded ? "Fechar" : "Configurar"}
                  </Button>
                </div>
              </div>

              {/* Expanded fields */}
              {isExpanded && (
                <div className="border-t border-border bg-muted/20 p-5 space-y-4">
                  {provider.managed && (
                    <div className="text-xs text-muted-foreground bg-[hsl(258,90%,66%)]/5 border border-[hsl(258,90%,66%)]/20 rounded-md p-3">
                      ✨ Esta opção usa a chave <code className="bg-muted px-1 rounded">LOVABLE_API_KEY</code> já provisionada. Não requer cadastro.
                    </div>
                  )}

                  {provider.id === "google_document_ai" && (
                    <div className="text-xs text-muted-foreground bg-[hsl(200,90%,50%)]/5 border border-[hsl(200,90%,50%)]/20 rounded-md p-3">
                      🔐 A API Key já está armazenada com segurança como secret <code className="bg-muted px-1 rounded">GOOGLE_DOCUMENT_AI_API_KEY</code>. Preencha apenas <strong>Project ID</strong>, <strong>Location</strong> e <strong>Processor ID</strong> abaixo para ativar o pipeline OCR.
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-4">
                    {provider.fields.includes("apiKey") && (
                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs font-semibold flex items-center gap-1.5">
                          <KeyRound className="w-3 h-3" /> API Key
                        </Label>
                        <div className="relative">
                          <Input
                            type={showSecrets[provider.id] ? "text" : "password"}
                            placeholder="Cole sua chave aqui"
                            value={cfg.apiKey}
                            onChange={(e) => updateConfig(provider.id, { apiKey: e.target.value })}
                            className="pr-10 font-mono text-xs"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowSecrets((s) => ({ ...s, [provider.id]: !s[provider.id] }))
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showSecrets[provider.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {provider.fields.includes("projectId") && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">GCP Project ID</Label>
                        <Input
                          placeholder="meu-projeto-gcp"
                          value={cfg.projectId || ""}
                          onChange={(e) => updateConfig(provider.id, { projectId: e.target.value })}
                          className="text-xs"
                        />
                      </div>
                    )}

                    {provider.fields.includes("location") && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Região / Location</Label>
                        <Input
                          placeholder="us, eu, southamerica-east1..."
                          value={cfg.location || ""}
                          onChange={(e) => updateConfig(provider.id, { location: e.target.value })}
                          className="text-xs"
                        />
                      </div>
                    )}

                    {provider.fields.includes("processorId") && (
                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs font-semibold">Processor ID (Document AI)</Label>
                        <Input
                          placeholder="ex: 1a2b3c4d5e6f7g8h"
                          value={cfg.processorId || ""}
                          onChange={(e) => updateConfig(provider.id, { processorId: e.target.value })}
                          className="text-xs font-mono"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          ID do processor configurado no console do Google Cloud Document AI.
                        </p>
                      </div>
                    )}

                    {provider.fields.includes("model") && provider.models && (
                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs font-semibold">Modelo padrão</Label>
                        <Select
                          value={cfg.model}
                          onValueChange={(v) => updateConfig(provider.id, { model: v })}
                        >
                          <SelectTrigger className="text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {provider.models.map((m) => (
                              <SelectItem key={m} value={m} className="text-xs font-mono">
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => testProvider(provider.id)}
                    >
                      <Zap className="w-3 h-3" /> Testar conexão
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Save Bar ───────────────────────────────────────── */}
      <div className="sticky bottom-0 bg-background/80 backdrop-blur-sm border-t border-border -mx-1 px-1 py-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          As chaves são armazenadas localmente no navegador. Para uso em produção, conecte via Lovable Cloud.
        </p>
        <Button
          size="sm"
          className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5"
          onClick={saveAll}
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Salvar Configurações
        </Button>
      </div>
    </div>
  );
};

export default AIProvidersConfig;
