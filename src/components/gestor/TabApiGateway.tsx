import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  ShieldCheck, CloudCog, KeyRound, Mail, Webhook, PlayCircle,
  Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Activity,
} from "lucide-react";

interface GatewayConfig {
  mode: "lovable" | "gcp";
  default_model: string;
  gcp_model: string;
  gcp_endpoint: string;
  webhook_signature_enabled: boolean;
  notes?: string | null;
}

interface StatusResp {
  ok: boolean;
  config: GatewayConfig;
  secrets: Record<string, boolean>;
  queueStats: any;
  recentJobs: any[];
  activeMode: "lovable" | "gcp";
  gcpReady: boolean;
}

const SecretBadge = ({ ok, label }: { ok: boolean; label: string }) => (
  <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
    <span className="text-sm font-medium">{label}</span>
    {ok
      ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">configurado</Badge>
      : <Badge variant="outline" className="text-amber-400 border-amber-500/40">ausente</Badge>}
  </div>
);

export default function TabApiGateway() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"lovable" | "gcp" | null>(null);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [draft, setDraft] = useState<GatewayConfig | null>(null);
  const [prompt, setPrompt] = useState("Responda em uma frase: o gateway está respondendo?");
  const [testResult, setTestResult] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-gateway-status");
      if (error) throw error;
      setStatus(data as StatusResp);
      setDraft((data as StatusResp).config);
    } catch (e: any) {
      toast.error("Falha ao carregar status: " + (e?.message ?? "erro"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: ai_jobs inserts/updates as live diagnostics feed
  useEffect(() => {
    const ch = supabase
      .channel("ai_gateway_events")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_jobs" }, (payload) => {
        setEvents((prev) => [
          { ts: new Date().toISOString(), kind: payload.eventType, row: payload.new ?? payload.old },
          ...prev,
        ].slice(0, 25));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("ai_gateway_config")
        .update({
          mode: draft.mode,
          default_model: draft.default_model,
          gcp_model: draft.gcp_model,
          gcp_endpoint: draft.gcp_endpoint,
          webhook_signature_enabled: draft.webhook_signature_enabled,
          notes: draft.notes ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true);
      if (error) throw error;
      toast.success("Configuração salva.");
      refresh();
    } catch (e: any) {
      toast.error("Falha ao salvar: " + (e?.message ?? "erro"));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async (mode: "lovable" | "gcp") => {
    setTesting(mode);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-gateway-test", {
        body: { prompt, mode },
      });
      if (error) throw error;
      setTestResult(data);
    } catch (e: any) {
      setTestResult({ ok: false, error: e?.message ?? "erro" });
    } finally {
      setTesting(null);
    }
  };

  if (loading || !status || !draft) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando gateway...
      </div>
    );
  }

  const activeBadge = status.activeMode === "gcp"
    ? <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30">GCP Gemini ativo</Badge>
    : <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Orange AI ativo (padrão)</Badge>;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CloudCog className="w-5 h-5" /> Modo de operação do Gateway
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Padrão <strong>Orange</strong> — zero impacto. Ative <strong>GCP Gemini</strong> como failover quando o
              secret <code>GEMINI_API_KEY</code> estiver configurado.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeBadge}
            <Button size="sm" variant="outline" onClick={refresh}><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status.gcpReady && draft.mode === "gcp" && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertTitle>GEMINI_API_KEY ausente</AlertTitle>
              <AlertDescription>
                Configure o secret <code>GEMINI_API_KEY</code> nas Funções para ativar o gateway GCP.
                Enquanto ausente, o sistema continua roteando via Orange (failover seguro).
              </AlertDescription>
            </Alert>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Modo</Label>
              <div className="flex items-center gap-3 rounded-md border border-border p-3">
                <Switch
                  checked={draft.mode === "gcp"}
                  onCheckedChange={(c) => setDraft({ ...draft, mode: c ? "gcp" : "lovable" })}
                />
                <span className="text-sm">
                  {draft.mode === "gcp" ? "GCP Gemini (failover)" : "Orange AI (padrão)"}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Webhook auth-email-hook — verificar assinatura</Label>
              <div className="flex items-center gap-3 rounded-md border border-border p-3">
                <Switch
                  checked={draft.webhook_signature_enabled}
                  onCheckedChange={(c) => setDraft({ ...draft, webhook_signature_enabled: c })}
                />
                <span className="text-sm">{draft.webhook_signature_enabled ? "Ativada" : "Desativada"}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Modelo padrão (Orange)</Label>
              <Input value={draft.default_model} onChange={(e) => setDraft({ ...draft, default_model: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Modelo GCP</Label>
              <Input value={draft.gcp_model} onChange={(e) => setDraft({ ...draft, gcp_model: e.target.value })} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Endpoint GCP</Label>
              <Input value={draft.gcp_endpoint} onChange={(e) => setDraft({ ...draft, gcp_endpoint: e.target.value })} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Notas internas</Label>
              <Textarea rows={2} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar configuração
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5" /> Secrets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <SecretBadge ok={status.secrets.LOVABLE_API_KEY} label="ORANGE_API_KEY" />
            <SecretBadge ok={status.secrets.GEMINI_API_KEY} label="GEMINI_API_KEY (GCP)" />
            <SecretBadge ok={status.secrets.GOOGLE_DOCUMENT_AI_API_KEY} label="GOOGLE_DOCUMENT_AI_API_KEY" />
            <SecretBadge ok={status.secrets.SEND_EMAIL_HOOK_SECRET} label="SEND_EMAIL_HOOK_SECRET (webhook)" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" /> Fila de e-mails & Webhooks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>process-email-queue</span>
              <Badge variant="outline" className="text-emerald-400 border-emerald-500/40">ativo (cron)</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>auth-email-hook</span>
              <Badge variant="outline" className={status.secrets.SEND_EMAIL_HOOK_SECRET ? "text-emerald-400 border-emerald-500/40" : "text-amber-400 border-amber-500/40"}>
                {status.secrets.SEND_EMAIL_HOOK_SECRET ? "assinado" : "sem secret"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1"><Webhook className="w-3.5 h-3.5" /> Verificação de assinatura</span>
              <Badge variant="outline">{draft.webhook_signature_enabled ? "ON" : "OFF"}</Badge>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              Operação atual preservada. Toda mudança aqui só afeta novas execuções.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><PlayCircle className="w-5 h-5" /> Teste ao vivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={() => runTest("lovable")} disabled={!!testing} variant="outline">
              {testing === "lovable" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Testar Orange
            </Button>
            <Button onClick={() => runTest("gcp")} disabled={!!testing || !status.secrets.GEMINI_API_KEY}>
              {testing === "gcp" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Testar GCP Gemini
            </Button>
          </div>
          {testResult && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1">
              <div className="flex items-center gap-2">
                {testResult.ok
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  : <XCircle className="w-4 h-4 text-destructive" />}
                <span>modo: {testResult.mode} • status: {testResult.status} • latência: {testResult.latency_ms}ms</span>
              </div>
              <pre className="whitespace-pre-wrap break-words text-muted-foreground">{testResult.body ?? testResult.error}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5" /> Diagnóstico realtime</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0
            ? <p className="text-sm text-muted-foreground">Aguardando eventos da fila de jobs...</p>
            : (
              <ul className="space-y-1 text-xs font-mono max-h-72 overflow-y-auto">
                {events.map((e, i) => (
                  <li key={i} className="border-b border-border/40 py-1">
                    <span className="text-muted-foreground">{new Date(e.ts).toLocaleTimeString()}</span>
                    {" "}<Badge variant="outline" className="text-[10px]">{e.kind}</Badge>
                    {" "}{e.row?.kind ?? "-"} → <strong>{e.row?.status ?? "?"}</strong>
                    {e.row?.error_message ? <span className="text-destructive"> • {e.row.error_message}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          {status.queueStats && (
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-md border border-border p-2"><div className="text-muted-foreground">queued</div><div className="font-semibold">{status.queueStats.queued ?? 0}</div></div>
              <div className="rounded-md border border-border p-2"><div className="text-muted-foreground">processing</div><div className="font-semibold">{status.queueStats.processing ?? 0}</div></div>
              <div className="rounded-md border border-border p-2"><div className="text-muted-foreground">completed</div><div className="font-semibold">{status.queueStats.completed ?? 0}</div></div>
              <div className="rounded-md border border-border p-2"><div className="text-muted-foreground">failed</div><div className="font-semibold">{status.queueStats.failed ?? 0}</div></div>
            </div>
          )}
        </CardContent>
      </Card>

      <Alert>
        <ShieldCheck className="w-4 h-4" />
        <AlertTitle>Failover seguro</AlertTitle>
        <AlertDescription>
          O fluxo atual (Orange AI) permanece operacional. A virada para GCP só ocorre após salvar modo = GCP
          e ter <code>GEMINI_API_KEY</code> configurada. Funções de auditoria e e-mail continuam usando
          o roteador atual até a virada manual.
        </AlertDescription>
      </Alert>
    </div>
  );
}
