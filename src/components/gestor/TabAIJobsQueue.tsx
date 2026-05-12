import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Inbox, RefreshCw,
  Loader2, PlayCircle, Trash2, Eye, ListChecks, TrendingUp,
} from "lucide-react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceDot,
} from "recharts";
import { toast } from "@/hooks/use-toast";

type JobStatus = "queued" | "processing" | "completed" | "failed" | "all";

interface AIJob {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  max_attempts: number;
  priority: number;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  payload: any;
  result: any;
  requested_by: string;
  company_id: string | null;
  document_id: string | null;
  pgmq_msg_id: number | null;
}

interface DLQEntry {
  msg_id: number;
  enqueued_at: string;
  read_ct: number;
  message: any;
}

interface QueueStats {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
  avg_duration_ms: number;
  last_24h_failed: number;
  last_24h_completed: number;
  pgmq_pending: number;
  dlq_pending: number;
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" }) : "—";

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { cls: string; label: string }> = {
    queued:     { cls: "bg-amber-500/15 text-amber-600 border-amber-500/30", label: "Na fila" },
    processing: { cls: "bg-blue-500/15 text-blue-600 border-blue-500/30",   label: "Processando" },
    completed:  { cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", label: "Concluído" },
    failed:     { cls: "bg-rose-500/15 text-rose-600 border-rose-500/30",   label: "Falha" },
  };
  const m = map[status] ?? { cls: "bg-muted text-muted-foreground", label: status };
  return <Badge variant="outline" className={`text-[10px] ${m.cls}`}>{m.label}</Badge>;
};

const StatCard = ({
  icon: Icon, label, value, tone = "default",
}: { icon: any; label: string; value: string | number; tone?: "default" | "warn" | "danger" | "ok" | "info" }) => {
  const colorMap = {
    default: "text-foreground",
    warn:    "text-amber-600",
    danger:  "text-rose-600",
    ok:      "text-emerald-600",
    info:    "text-blue-600",
  } as const;
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${colorMap[tone]}`}>{value}</p>
        </div>
        <div className={`p-2 rounded-lg bg-muted ${colorMap[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </CardContent>
    </Card>
  );
};

type TrendWindow = "24h" | "7d";
interface TrendPoint { bucket: string; enqueued: number; completed: number; failed: number; }

const TabAIJobsQueue = () => {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [jobs, setJobs] = useState<AIJob[]>([]);
  const [dlq, setDlq] = useState<DLQEntry[]>([]);
  const [filter, setFilter] = useState<JobStatus>("failed");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [detail, setDetail] = useState<AIJob | DLQEntry | null>(null);
  const [trendWindow, setTrendWindow] = useState<TrendWindow>("24h");
  const [trend, setTrend] = useState<TrendPoint[]>([]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [
        { data: statsData, error: statsErr },
        { data: dlqData, error: dlqErr },
        { data: trendData, error: trendErr },
      ] = await Promise.all([
        supabase.rpc("ai_jobs_queue_stats" as any),
        supabase.rpc("ai_jobs_dlq_peek" as any, { p_limit: 50 }),
        supabase.rpc("ai_jobs_timeseries" as any, { p_window: trendWindow }),
      ]);
      if (statsErr) throw statsErr;
      if (dlqErr) throw dlqErr;
      if (trendErr) throw trendErr;
      setStats(statsData as unknown as QueueStats);
      setDlq((dlqData as unknown as DLQEntry[]) || []);
      setTrend(((trendData as any[]) || []).map(r => ({
        bucket: r.bucket,
        enqueued: Number(r.enqueued),
        completed: Number(r.completed),
        failed: Number(r.failed),
      })));

      let q = supabase
        .from("ai_jobs")
        .select("*")
        .order("queued_at", { ascending: false })
        .limit(100);
      if (filter !== "all") q = q.eq("status", filter);
      if (kindFilter !== "all") q = q.eq("kind", kindFilter);
      const { data: jobsData, error: jobsErr } = await q;
      if (jobsErr) throw jobsErr;
      setJobs((jobsData as AIJob[]) || []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar fila", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, kindFilter, trendWindow]);

  useEffect(() => { load(); }, [load]);

  // Realtime: atualiza quando algum job muda de estado
  useEffect(() => {
    const ch = supabase
      .channel("ai_jobs_monitor")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_jobs" }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // Auto-refresh leve a cada 15s para stats + DLQ
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => load(), 15000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const kinds = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => set.add(j.kind));
    return Array.from(set);
  }, [jobs]);

  const handleRetry = async (jobId: string) => {
    const { error } = await supabase.rpc("ai_jobs_retry" as any, { p_job_id: jobId });
    if (error) {
      toast({ title: "Não foi possível reprocessar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Job reenfileirado", description: "O processamento será retomado em instantes." });
      // Aciona o worker imediatamente
      supabase.functions.invoke("process-ai-jobs-queue", { body: {} }).catch(() => {});
      load();
    }
  };

  const handlePurge = async (msgId: number) => {
    const { error } = await supabase.rpc("ai_jobs_dlq_purge" as any, { p_msg_id: msgId });
    if (error) {
      toast({ title: "Falha ao remover da DLQ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Mensagem removida da DLQ" });
      load();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Fila Assíncrona de IA — Monitoramento</h2>
          <p className="text-xs text-muted-foreground">
            Visibilidade em tempo real de jobs, tentativas e mensagens na Dead Letter Queue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(v => !v)}
            className="text-xs"
          >
            <Activity className={`w-3.5 h-3.5 mr-1.5 ${autoRefresh ? "text-emerald-500" : "text-muted-foreground"}`} />
            Auto-refresh {autoRefresh ? "ON" : "OFF"}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={refreshing} className="text-xs">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard icon={Clock} label="Na fila" value={stats.queued} tone="warn" />
          <StatCard icon={Loader2} label="Processando" value={stats.processing} tone="info" />
          <StatCard icon={CheckCircle2} label="Concluídos (24h)" value={stats.last_24h_completed} tone="ok" />
          <StatCard icon={AlertTriangle} label="Falhas (24h)" value={stats.last_24h_failed} tone="danger" />
          <StatCard icon={Inbox} label="pgmq pendentes" value={stats.pgmq_pending} tone="info" />
          <StatCard icon={AlertTriangle} label="DLQ" value={stats.dlq_pending} tone="danger" />
        </div>
      )}

      {stats && (
        <Card className="bg-card border-border">
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Total processado</p>
              <p className="font-semibold">{stats.total}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tempo médio (concluídos)</p>
              <p className="font-semibold">{(stats.avg_duration_ms / 1000).toFixed(1)}s</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Taxa de sucesso (24h)</p>
              <p className="font-semibold">
                {stats.last_24h_completed + stats.last_24h_failed === 0
                  ? "—"
                  : `${((stats.last_24h_completed / (stats.last_24h_completed + stats.last_24h_failed)) * 100).toFixed(1)}%`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saúde da fila</p>
              <p className="font-semibold">
                {stats.dlq_pending > 0 ? (
                  <span className="text-rose-600">⚠ Atenção</span>
                ) : stats.last_24h_failed > stats.last_24h_completed * 0.1 ? (
                  <span className="text-amber-600">● Instável</span>
                ) : (
                  <span className="text-emerald-600">● Saudável</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="jobs">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="jobs" className="text-xs gap-1.5">
            <ListChecks className="w-3.5 h-3.5" /> Jobs ({jobs.length})
          </TabsTrigger>
          <TabsTrigger value="dlq" className="text-xs gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Dead Letter Queue ({dlq.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filter} onValueChange={(v) => setFilter(v as JobStatus)}>
              <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="queued">Na fila</SelectItem>
                <SelectItem value="processing">Processando</SelectItem>
                <SelectItem value="completed">Concluídos</SelectItem>
                <SelectItem value="failed">Falhas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {kinds.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-center">Tentativas</TableHead>
                    <TableHead className="text-xs">Enfileirado</TableHead>
                    <TableHead className="text-xs">Finalizado</TableHead>
                    <TableHead className="text-xs">Erro</TableHead>
                    <TableHead className="text-xs text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                        Nenhum job para os filtros selecionados.
                      </TableCell>
                    </TableRow>
                  )}
                  {jobs.map(j => (
                    <TableRow key={j.id}>
                      <TableCell className="text-xs font-medium">{j.kind}</TableCell>
                      <TableCell><StatusBadge status={j.status} /></TableCell>
                      <TableCell className="text-xs text-center">
                        <span className={j.attempts >= j.max_attempts ? "text-rose-600 font-semibold" : ""}>
                          {j.attempts}/{j.max_attempts}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(j.queued_at)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(j.finished_at)}</TableCell>
                      <TableCell className="text-xs text-rose-600 max-w-[260px] truncate" title={j.error_message ?? ""}>
                        {j.error_message ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setDetail(j)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {j.status === "failed" && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-600" onClick={() => handleRetry(j.id)}>
                              <PlayCircle className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dlq" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                Mensagens não processáveis (após {jobs.length > 0 ? jobs[0].max_attempts : 3} tentativas)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">msg_id</TableHead>
                    <TableHead className="text-xs">Enviado para DLQ</TableHead>
                    <TableHead className="text-xs text-center">Leituras</TableHead>
                    <TableHead className="text-xs">Job ID</TableHead>
                    <TableHead className="text-xs text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dlq.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                        DLQ vazia. Nenhuma mensagem morta. ✅
                      </TableCell>
                    </TableRow>
                  )}
                  {dlq.map(d => {
                    const jobId = d.message?.job_id;
                    return (
                      <TableRow key={d.msg_id}>
                        <TableCell className="text-xs font-mono">{d.msg_id}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(d.enqueued_at)}</TableCell>
                        <TableCell className="text-xs text-center">{d.read_ct}</TableCell>
                        <TableCell className="text-xs font-mono truncate max-w-[240px]" title={jobId}>
                          {jobId ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setDetail(d)}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {jobId && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-600"
                                      onClick={() => handleRetry(jobId)}>
                                <PlayCircle className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-rose-600"
                                    onClick={() => handlePurge(d.msg_id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">Detalhes do registro</DialogTitle>
          </DialogHeader>
          <pre className="text-[11px] bg-muted rounded-lg p-3 overflow-auto whitespace-pre-wrap break-all">
            {JSON.stringify(detail, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TabAIJobsQueue;
