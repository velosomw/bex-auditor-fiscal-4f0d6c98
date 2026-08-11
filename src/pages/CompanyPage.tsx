import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, FileText, Plus, TrendingUp, AlertTriangle, CheckCircle2, Eye, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import PlatformLayout from "@/components/PlatformLayout";
import { getCompany, type Company } from "@/services/companiesService";
import {
  getReportsByCompany,
  getDocsByCompany,
  type GeneratedReportEntry,
  type AuditHistoryEntry,
} from "@/services/auditHistoryService";
import { useUser } from "@/contexts/UserContext";

const sourceLabel: Record<string, { label: string; className: string }> = {
  auditor_chefe: { label: "Técnico Chefe", className: "bg-[hsl(217,91%,50%)]/15 text-[hsl(217,91%,50%)] border-[hsl(217,91%,50%)]/30" },
  usuario: { label: "Usuário", className: "bg-[hsl(200,98%,55%)]/15 text-[hsl(200,98%,55%)] border-[hsl(200,98%,55%)]/30" },
  empresa: { label: "Empresa", className: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30" },
};

const riskBadge: Record<string, { className: string; label: string }> = {
  baixo: { className: "bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30", label: "Baixo" },
  moderado: { className: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30", label: "Moderado" },
  elevado: { className: "bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)] border-[hsl(0,84%,60%)]/30", label: "Elevado" },
  critico: { className: "bg-foreground/15 text-foreground border-border", label: "Crítico" },
};

const formatFileSize = (bytes: number) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const CompanyPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useUser();
  const [company, setCompany] = useState<Company | null>(null);
  const [reports, setReports] = useState<GeneratedReportEntry[]>([]);
  const [docs, setDocs] = useState<AuditHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getCompany(id)
      .then(c => {
        setCompany(c);
        setReports(getReportsByCompany(id));
        setDocs(getDocsByCompany(id));
      })
      .finally(() => setLoading(false));
  }, [id]);

  const stats = useMemo(() => {
    const totalReports = reports.length;
    const totalDocs = docs.length;
    const avgConformidade = reports.length
      ? Math.round(reports.reduce((s, r) => s + r.conformidade, 0) / reports.length)
      : 0;
    const totalRiscos = reports.reduce((s, r) => s + r.riscos, 0);
    const completedAudits = docs.filter(d => d.status === "completed").length;
    return { totalReports, totalDocs, avgConformidade, totalRiscos, completedAudits };
  }, [reports, docs]);

  const docsByBatch = useMemo(() => {
    const map = new Map<string, AuditHistoryEntry[]>();
    docs.forEach(d => {
      if (!d.batchId) return;
      const arr = map.get(d.batchId) || [];
      arr.push(d);
      map.set(d.batchId, arr);
    });
    return map;
  }, [docs]);

  const backRoute = role === "auditor_chefe" || role === "coordenadora" || role === "gestor_ia"
    ? "/dashboard"
    : "/user";

  if (loading) {
    return (
      <PlatformLayout>
        <div className="max-w-[1400px] mx-auto p-6">
          <p className="text-sm text-muted-foreground">Carregando empresa...</p>
        </div>
      </PlatformLayout>
    );
  }

  if (!company) {
    return (
      <PlatformLayout>
        <div className="max-w-[1400px] mx-auto p-6 space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(backRoute)} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Empresa não encontrada.</CardContent></Card>
        </div>
      </PlatformLayout>
    );
  }

  return (
    <PlatformLayout>
      <div className="max-w-[1400px] mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(backRoute)} className="gap-1.5 mt-1">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="w-12 h-12 rounded-xl bg-[hsl(217,91%,50%)]/10 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 text-[hsl(217,91%,50%)]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{company.name}</h1>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                {company.cnpj && <span>CNPJ: {company.cnpj}</span>}
                {company.sector && <span>• {company.sector}</span>}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => navigate(`/audit?company=${company.id}`)}
            className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-1.5"
          >
            <Plus className="w-4 h-4" /> Nova Auditoria
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Relatórios Gerados", value: stats.totalReports, icon: FileText, color: "#8B5CF6" },
            { label: "Documentos", value: stats.totalDocs, icon: FileText, color: "hsl(217,91%,50%)" },
            { label: "Conformidade Média", value: `${stats.avgConformidade}%`, icon: Shield, color: "hsl(142,76%,36%)" },
            { label: "Achados Totais", value: stats.totalRiscos, icon: AlertTriangle, color: "hsl(0,84%,60%)" },
          ].map(k => (
            <Card key={k.label} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{k.label}</span>
                  <k.icon className="w-4 h-4" style={{ color: k.color }} />
                </div>
                <p className="text-2xl font-bold text-foreground">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Relatórios */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#8B5CF6]" /> Relatórios da Empresa
            </CardTitle>
            <CardDescription>
              Inclui relatórios gerados pelo Técnico Chefe, Usuário e pela própria Empresa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reports.length === 0 ? (
              <div className="text-center py-10">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum relatório gerado ainda para esta empresa.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {reports.map(r => {
                  const rb = riskBadge[r.riskLevel] || riskBadge.moderado;
                  const src = sourceLabel[r.source || "usuario"];
                  return (
                    <div
                      key={r.id}
                      onClick={() => navigate(`/user/report/${r.id}`)}
                      className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer flex items-center gap-3 flex-wrap"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                          <Badge variant="outline" className="text-[10px]">{r.format}</Badge>
                          <Badge className={`text-[10px] border ${src.className}`}>{src.label}</Badge>
                          <Badge className={`text-[10px] border ${rb.className}`}>Risco: {rb.label}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span>{r.date}</span>
                          <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {r.conformidade}%</span>
                          <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {r.riscos} pendências</span>
                        </div>
                      </div>
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documentos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Documentos Analisados
            </CardTitle>
            <CardDescription>
              Arquivos carregados nas auditorias desta empresa, agrupados por sessão.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {docs.length === 0 ? (
              <div className="text-center py-10">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum documento analisado ainda.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Array.from(docsByBatch.entries()).map(([batchId, list]) => (
                  <div key={batchId} className="border border-border/50 rounded-lg p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Sessão • {list[0].date} • {list.length} doc{list.length > 1 ? "s" : ""}
                    </p>
                    <div className="space-y-1.5">
                      {list.map(d => (
                        <div key={d.id} className="flex items-center gap-3 p-2 rounded bg-muted/30">
                          <FileText className="w-3.5 h-3.5 text-[hsl(217,91%,50%)] shrink-0" />
                          <p className="text-xs font-medium text-foreground truncate flex-1">{d.fileName}</p>
                          <Badge variant="outline" className="text-[10px]">{d.format}</Badge>
                          <span className="text-[11px] text-muted-foreground">{formatFileSize(d.fileSize)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PlatformLayout>
  );
};

export default CompanyPage;
