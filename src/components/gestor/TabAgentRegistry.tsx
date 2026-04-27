import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plug, Plus, Database, Globe, Webhook, CreditCard, Upload,
  Bot, KeyRound, Trash2, Settings, CheckCircle2, XCircle, Pause,
  Cloud, FileSearch, Sparkles, Brain, Cpu,
} from "lucide-react";
import ImportValidatedReferenceDialog from "./ImportValidatedReferenceDialog";

// ─── Tipos ──────────────────────────────────────────────────
type Origem = "IA Gateway" | "Externa" | "Google Cloud" | "OpenAI" | "Personalizada";
type Cobranca = "Créditos AI" | "Pago por uso" | "Plano fixo" | "Gratuito";
type StatusInt = "active" | "inactive" | "paused";

interface AgentRow {
  id: string;
  nome: string;
  tipo: string;
  origem: Origem;
  secret: string; // ex.: API_Key, GOOGLE_DOCUMENT_AI_API_KEY
  cobranca: Cobranca;
  status: StatusInt;
}

interface IntegrationRow {
  id: string;
  name: string;
  type: string;
  status: StatusInt;
  endpoint?: string;
  secret?: string;
  origem: Origem;
  cobranca: Cobranca;
}

// ─── Catálogo inicial (resumo visual) ──────────────────────
const initialAgents: AgentRow[] = [
  { id: "a1", nome: "Agente Auditor Contábil", tipo: "Auditoria", origem: "IA Gateway", secret: "API_Key", cobranca: "Créditos AI", status: "active" },
  { id: "a2", nome: "Agente Financeiro", tipo: "Financeiro", origem: "IA Gateway", secret: "API_Key", cobranca: "Créditos AI", status: "active" },
  { id: "a3", nome: "Agente de Relatório", tipo: "Relatório", origem: "IA Gateway", secret: "API_Key", cobranca: "Créditos AI", status: "paused" },
  { id: "a4", nome: "Document AI (OCR)", tipo: "OCR / Parser", origem: "Google Cloud", secret: "GOOGLE_DOCUMENT_AI_API_KEY", cobranca: "Pago por uso", status: "active" },
];

const initialIntegrations: IntegrationRow[] = [
  { id: "i1", name: "BigQuery", type: "Data Warehouse", status: "active", origem: "Google Cloud", secret: "GCP_SERVICE_ACCOUNT", cobranca: "Pago por uso" },
  { id: "i2", name: "API Contábil", type: "ERP", status: "active", origem: "Externa", secret: "API_Key", cobranca: "Plano fixo" },
  { id: "i3", name: "Webhooks", type: "Notificações", status: "active", origem: "Externa", secret: "WEBHOOK_SECRET", cobranca: "Gratuito" },
  { id: "i4", name: "API Financeira", type: "Banking", status: "inactive", origem: "Externa", secret: "API_Key", cobranca: "Pago por uso" },
  { id: "i5", name: "Upload SFTP", type: "Arquivos", status: "paused", origem: "Externa", secret: "SFTP_PASSWORD", cobranca: "Plano fixo" },
];

const STORAGE_AGENTS = "bex.registry.agents";
const STORAGE_INTEGRATIONS = "bex.registry.integrations";

// ─── UI helpers ────────────────────────────────────────────
const StatusBadge = ({ status }: { status: StatusInt }) => {
  const map: Record<StatusInt, { cls: string; icon: typeof CheckCircle2; label: string }> = {
    active: { cls: "bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)]", icon: CheckCircle2, label: "Ativo" },
    inactive: { cls: "bg-[hsl(0,70%,55%)]/10 text-[hsl(0,70%,55%)]", icon: XCircle, label: "Inativo" },
    paused: { cls: "bg-[hsl(38,90%,55%)]/10 text-[hsl(38,90%,55%)]", icon: Pause, label: "Pausado" },
  };
  const { cls, icon: Icon, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
};

const OrigemBadge = ({ origem }: { origem: Origem }) => (
  <Badge variant="outline" className="text-[10px] font-medium">{origem}</Badge>
);

// ─── Componente principal ──────────────────────────────────
const TabAgentRegistry = () => {
  const [agents, setAgents] = useState<AgentRow[]>(initialAgents);
  const [integrations, setIntegrations] = useState<IntegrationRow[]>(initialIntegrations);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<IntegrationRow, "id">>({
    name: "", type: "API", status: "active", endpoint: "", secret: "API_Key",
    origem: "Externa", cobranca: "Pago por uso",
  });

  useEffect(() => {
    try {
      const a = localStorage.getItem(STORAGE_AGENTS);
      const i = localStorage.getItem(STORAGE_INTEGRATIONS);
      if (a) setAgents(JSON.parse(a));
      if (i) setIntegrations(JSON.parse(i));
    } catch { /* ignore */ }
  }, []);

  const persistIntegrations = (list: IntegrationRow[]) => {
    setIntegrations(list);
    try { localStorage.setItem(STORAGE_INTEGRATIONS, JSON.stringify(list)); } catch { /* ignore */ }
  };

  const persistAgents = (list: AgentRow[]) => {
    setAgents(list);
    try { localStorage.setItem(STORAGE_AGENTS, JSON.stringify(list)); } catch { /* ignore */ }
  };

  const addIntegration = () => {
    if (!form.name.trim()) return toast.error("Informe o nome da integração.");
    const newItem: IntegrationRow = { ...form, id: `i_${Date.now()}` };
    persistIntegrations([...integrations, newItem]);
    setOpen(false);
    setForm({ name: "", type: "API", status: "active", endpoint: "", secret: "API_Key", origem: "Externa", cobranca: "Pago por uso" });
    toast.success(`Integração "${newItem.name}" cadastrada.`);
  };

  const removeIntegration = (id: string) => {
    persistIntegrations(integrations.filter(i => i.id !== id));
    toast.success("Integração removida.");
  };

  const toggleIntegrationStatus = (id: string) => {
    persistIntegrations(integrations.map(i =>
      i.id === id ? { ...i, status: i.status === "active" ? "paused" : "active" } : i
    ));
  };

  const toggleAgentStatus = (id: string) => {
    persistAgents(agents.map(a =>
      a.id === id ? { ...a, status: a.status === "active" ? "paused" : "active" } : a
    ));
  };

  return (
    <div className="space-y-8">
      {/* ── Resumo visual ────────────────────────────────── */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Agentes IA", value: agents.length, icon: Bot, color: "hsl(258,90%,66%)" },
          { label: "Integrações", value: integrations.length, icon: Plug, color: "hsl(200,90%,50%)" },
          { label: "Ativos", value: [...agents, ...integrations].filter(x => x.status === "active").length, icon: CheckCircle2, color: "hsl(152,70%,45%)" },
          { label: "Standby", value: [...agents, ...integrations].filter(x => x.status !== "active").length, icon: Pause, color: "hsl(38,90%,55%)" },
        ].map((k, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-5">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: `${k.color}15` }}>
              <k.icon className="w-5 h-5" style={{ color: k.color }} />
            </div>
            <div className="text-2xl font-bold text-foreground">{k.value}</div>
            <div className="text-xs text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabela: Agentes ──────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bot className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Agentes registrados
          </h4>
          <span className="text-xs text-muted-foreground">{agents.length} agentes</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Nome</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Origem</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Secret</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Cobrança</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium text-foreground text-xs">{a.nome}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.tipo}</td>
                  <td className="px-4 py-2.5"><OrigemBadge origem={a.origem} /></td>
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><KeyRound className="w-3 h-3" /> {a.secret}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.cobranca}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleAgentStatus(a.id)}>
                      {a.status === "active" ? "Pausar" : "Ativar"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Integrações ──────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Plug className="w-4 h-4 text-[hsl(200,90%,50%)]" /> Integrações & APIs externas
          </h4>
          <div className="flex items-center gap-2">
            <ImportValidatedReferenceDialog />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Nova Integração / API
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Plug className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Cadastrar API externa
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: API Receita Federal" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo</Label>
                    <Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="ERP, Banking, Webhook..." />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Endpoint (opcional)</Label>
                  <Input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="https://api.exemplo.com/v1" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Origem</Label>
                    <Select value={form.origem} onValueChange={(v) => setForm({ ...form, origem: v as Origem })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IA Gateway">IA Gateway</SelectItem>
                        <SelectItem value="Externa">Externa</SelectItem>
                        <SelectItem value="Google Cloud">Google Cloud</SelectItem>
                        <SelectItem value="OpenAI">OpenAI</SelectItem>
                        <SelectItem value="Personalizada">Personalizada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Secret</Label>
                    <Input value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="API_Key" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cobrança</Label>
                    <Select value={form.cobranca} onValueChange={(v) => setForm({ ...form, cobranca: v as Cobranca })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Créditos AI">Créditos AI</SelectItem>
                        <SelectItem value="Pago por uso">Pago por uso</SelectItem>
                        <SelectItem value="Plano fixo">Plano fixo</SelectItem>
                        <SelectItem value="Gratuito">Gratuito</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  💡 Dica: use o nome do secret (ex.: <code className="bg-muted px-1 rounded">API_Key</code>) que será cadastrado nas variáveis seguras da plataforma.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white" onClick={addIntegration}>
                  Cadastrar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Nome</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Origem</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Secret</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Cobrança</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {integrations.map((i) => (
                <tr key={i.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium text-foreground text-xs">{i.name}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{i.type}</td>
                  <td className="px-4 py-2.5"><OrigemBadge origem={i.origem} /></td>
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><KeyRound className="w-3 h-3" /> {i.secret || "—"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{i.cobranca}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={i.status} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleIntegrationStatus(i.id)}>
                      {i.status === "active" ? "Pausar" : "Ativar"}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeIntegration(i.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {integrations.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                    Nenhuma integração cadastrada. Clique em "Nova Integração / API" para adicionar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TabAgentRegistry;
