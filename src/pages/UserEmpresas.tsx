import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, Plus, Search, FileText, Eye, TrendingUp, AlertTriangle, Loader2, X, List, LayoutGrid, ChevronDown, Pencil, Save } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PlatformLayout from "@/components/PlatformLayout";
import { listCompanies, createCompany, updateCompany, type Company } from "@/services/companiesService";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/contexts/UserContext";
import {
  getReportsByCompany,
  getDocsByCompany,
  hydrateFromRemote,
  type GeneratedReportEntry,
  type AuditHistoryEntry,
} from "@/services/auditHistoryService";
import { canGenerateForCompany } from "@/services/reportLimitsService";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccountingFirm, type AccountingFirm } from "@/services/accountingFirmsService";

const SECTORS = ["Indústria", "Varejo", "Serviços", "Tecnologia", "Construção", "Agro", "Saúde", "Financeiro", "Educação", "Outro"];
const UF = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const riskBadge: Record<string, { className: string; label: string }> = {
  baixo: { className: "bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30", label: "Baixo" },
  moderado: { className: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30", label: "Moderado" },
  elevado: { className: "bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)] border-[hsl(0,84%,60%)]/30", label: "Elevado" },
  critico: { className: "bg-foreground/15 text-foreground border-border", label: "Crítico" },
};

const formatCNPJ = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  let out = digits;
  if (digits.length > 2) out = digits.slice(0, 2) + "." + digits.slice(2);
  if (digits.length > 5) out = out.slice(0, 6) + "." + out.slice(6);
  if (digits.length > 8) out = out.slice(0, 10) + "/" + out.slice(10);
  if (digits.length > 12) out = out.slice(0, 15) + "-" + out.slice(15);
  return out;
};

// Celular: (00) 00000-0000  — 11 dígitos
const formatPhoneMobile = (value: string) => {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

// Fixo: (00) 0000-0000 — 10 dígitos
const formatPhoneLandline = (value: string) => {
  const d = value.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
};

const formatFileSize = (bytes: number) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

interface CompanyAggregate {
  company: Company;
  reports: GeneratedReportEntry[];
  docs: AuditHistoryEntry[];
  avgConformidade: number;
  totalRiscos: number;
  lastDate: string | null;
}

const UserEmpresas = () => {
  const navigate = useNavigate();
  const { isReadOnly, role } = useUser();
  const isContabilidade = role === "contabilidade";
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [viewMode, setViewMode] = useState<"detail" | "table">("detail");
  const [myFirm, setMyFirm] = useState<AccountingFirm | null>(null);
  const [hiddenList, setHiddenList] = useState(false);

  const toggleHiddenList = () => setHiddenList(v => !v);

  // Form state (cadastro)
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);

  // Edição inline
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Company>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const reload = () => {
    setLoading(true);
    Promise.all([
      listCompanies({ ownedOnly: true }),
      hydrateFromRemote(),
    ])
      .then(([list]) => setCompanies(list))
      .catch(e => toast({ title: "Erro ao carregar empresas", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    getMyAccountingFirm().then(setMyFirm).catch(() => {});
  }, []);

  const aggregates: CompanyAggregate[] = useMemo(() => {
    return companies.map(c => {
      const reports = getReportsByCompany(c.id);
      const docs = getDocsByCompany(c.id);
      const avgConformidade = reports.length
        ? Math.round(reports.reduce((s, r) => s + r.conformidade, 0) / reports.length)
        : 0;
      const totalRiscos = reports.reduce((s, r) => s + r.riscos, 0);
      const lastDate = reports[0]?.date || docs[0]?.date || null;
      return { company: c, reports, docs, avgConformidade, totalRiscos, lastDate };
    });
  }, [companies]);

  // Ordena por mais recente: usa lastDate (relatório/doc) com fallback para created_at da empresa.
  const sortedByRecent = useMemo(() => {
    const ts = (a: CompanyAggregate) => {
      const d = a.lastDate || a.company.updated_at || a.company.created_at;
      const t = d ? new Date(d).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };
    return [...aggregates].sort((a, b) => ts(b) - ts(a));
  }, [aggregates]);

  const filteredAll = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedByRecent;
    return sortedByRecent.filter(a =>
      a.company.name.toLowerCase().includes(q) ||
      (a.company.cnpj || "").toLowerCase().includes(q) ||
      (a.company.city || "").toLowerCase().includes(q) ||
      (a.company.sector || "").toLowerCase().includes(q)
    );
  }, [sortedByRecent, search]);

  // Visão detalhada / lista suspensa: até 5 mais recentes.
  const filtered = useMemo(() => filteredAll.slice(0, 5), [filteredAll]);

  const selected = useMemo(() => aggregates.find(a => a.company.id === selectedId) || null, [aggregates, selectedId]);

  const totals = useMemo(() => ({
    empresas: companies.length,
    relatorios: aggregates.reduce((s, a) => s + a.reports.length, 0),
    documentos: aggregates.reduce((s, a) => s + a.docs.length, 0),
  }), [aggregates, companies]);

  const resetForm = () => {
    setName(""); setCnpj("");
    setContactName(""); setContactEmail("");
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { toast({ title: "Razão Social é obrigatória", variant: "destructive" }); return; }
    if (trimmedName.length > 200) { toast({ title: "Razão Social muito longa (máx. 200)", variant: "destructive" }); return; }
    const cnpjDigits = cnpj.replace(/\D/g, "");
    if (cnpjDigits && cnpjDigits.length !== 14) { toast({ title: "CNPJ inválido", description: "Informe os 14 dígitos.", variant: "destructive" }); return; }
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) { toast({ title: "E-mail inválido", variant: "destructive" }); return; }

    // Verifica sessão antes de tentar gravar (evita falha silenciosa por RLS)
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user?.id) {
      toast({
        title: "Sessão não encontrada",
        description: "Você precisa estar autenticado para cadastrar uma empresa. Faça login novamente.",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }

    setSaving(true);
    try {
      const c = await createCompany({
        name: trimmedName,
        cnpj: cnpj.trim() || undefined,
        contact_name: contactName.trim() || undefined,
        email: contactEmail.trim() || undefined,
        accounting_firm_id: myFirm?.id || null,
      });
      toast({ title: "Empresa cadastrada", description: c.name });
      resetForm();
      setShowRegister(false);
      reload();
      setSelectedId(c.id);
    } catch (e: any) {
      toast({ title: "Erro ao cadastrar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleNewAudit = async (c: Company) => {
    const { allowed, reason, quota } = await canGenerateForCompany(c.id, "resumido");
    if (!allowed) {
      toast({
        title: "Cota mensal esgotada",
        description: reason ?? `Resumidos: ${quota.resumido.used}/${quota.resumido.limit} · Completos: ${quota.completo.used}/${quota.completo.limit}. Solicite ao Gestor IA cota extra.`,
        variant: "destructive",
      });
      return;
    }
    navigate(`/audit?company=${c.id}`);
  };

  const startEdit = (c: Company) => {
    setEditForm({
      name: c.name,
      cnpj: c.cnpj || "",
      sector: c.sector || "",
      cnae: c.cnae || "",
      contact_name: c.contact_name || "",
      email: c.email || "",
      phone: c.phone || "",
      phone_fixed: c.phone_fixed || "",
      address: c.address || "",
      city: c.city || "",
      uf: c.uf || "",
      zip: c.zip || "",
      notes: c.notes || "",
    });
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    const trimmedName = (editForm.name || "").trim();
    if (!trimmedName) { toast({ title: "Razão Social é obrigatória", variant: "destructive" }); return; }
    const cnpjDigits = (editForm.cnpj || "").replace(/\D/g, "");
    if (cnpjDigits && cnpjDigits.length !== 14) { toast({ title: "CNPJ inválido", description: "Informe os 14 dígitos.", variant: "destructive" }); return; }
    if (editForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email)) { toast({ title: "E-mail inválido", variant: "destructive" }); return; }

    setSavingEdit(true);
    try {
      await updateCompany(selected.company.id, {
        name: trimmedName,
        cnpj: editForm.cnpj || undefined,
        sector: editForm.sector || undefined,
        cnae: editForm.cnae || undefined,
        contact_name: editForm.contact_name || undefined,
        email: editForm.email || undefined,
        phone: editForm.phone || undefined,
        phone_fixed: editForm.phone_fixed || undefined,
        address: editForm.address || undefined,
        city: editForm.city || undefined,
        uf: editForm.uf || undefined,
        zip: editForm.zip || undefined,
        notes: editForm.notes || undefined,
      });
      toast({ title: "Empresa atualizada", description: trimmedName });
      setEditing(false);
      reload();
    } catch (e: any) {
      toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <PlatformLayout>
      <div className="max-w-[1400px] mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/user")} className="gap-1.5 mt-1">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="w-12 h-12 rounded-xl bg-[hsl(217,91%,50%)]/10 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 text-[hsl(217,91%,50%)]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Empresas</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Empresas atendidas, cadastros e histórico de auditorias relacionados.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setViewMode(v => v === "table" ? "detail" : "table"); setShowRegister(false); setSelectedId(null); }}
              className="gap-1.5"
            >
              {viewMode === "table" ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
              {viewMode === "table" ? "Visão Detalhada" : "Lista de Empresas"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={toggleHiddenList}
              className="gap-1.5"
            >
              {hiddenList ? <Eye className="w-4 h-4" /> : <X className="w-4 h-4" />}
              {hiddenList ? "Exibir Empresas" : "Ocultar Empresas"}
            </Button>
            {!isReadOnly && (
              <Button
                size="sm"
                onClick={() => { setShowRegister(v => !v); setSelectedId(null); setViewMode("detail"); }}
                className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-1.5"
              >
                {showRegister ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {showRegister ? "Fechar Cadastro" : "Cadastrar Nova Empresa"}
              </Button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Empresas Cadastradas", value: totals.empresas, icon: Building2, color: "hsl(217,91%,50%)" },
            { label: "Relatórios Gerados", value: totals.relatorios, icon: FileText, color: "hsl(258,90%,66%)" },
            { label: "Documentos Analisados", value: totals.documentos, icon: FileText, color: "hsl(142,76%,36%)" },
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

        {/* Cadastro inline */}
        {showRegister && (
          <Card className="border-[hsl(217,91%,50%)]/40">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Cadastrar Nova Empresa
              </CardTitle>
              <CardDescription>Preencha os dados da empresa atendida. Ela ficará disponível para auditorias.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="rname">Razão Social *</Label>
                  <Input id="rname" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Acme Indústria S.A." />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rcnpj">CNPJ</Label>
                  <Input
                    id="rcnpj"
                    value={cnpj}
                    onChange={e => setCnpj(formatCNPJ(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rcontact">Responsável</Label>
                  <Input id="rcontact" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Nome do contato" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="remail">E-mail</Label>
                  <Input id="remail" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="contato@empresa.com.br" />
                </div>

              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={() => { resetForm(); setShowRegister(false); }}>Cancelar</Button>
                <Button onClick={handleSave} disabled={saving} className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white">
                  {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Cadastrar Empresa
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Visão em Tabela: lista todas as empresas cadastradas pelo login */}
        {viewMode === "table" && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <List className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Lista de Empresas Cadastradas
                  </CardTitle>
                  <CardDescription>Todas as empresas vinculadas ao seu login.</CardDescription>
                </div>
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, CNPJ, cidade..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {hiddenList ? (
                <div className="text-center py-10 px-4">
                  <Eye className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Lista de empresas oculta.</p>
                  <p className="text-xs text-muted-foreground mt-1">Clique em "Exibir Empresas" para visualizar.</p>
                </div>
              ) : loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                </div>
              ) : filteredAll.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {companies.length === 0 ? "Nenhuma empresa cadastrada." : "Nenhuma empresa encontrada."}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Razão Social</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Setor</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead className="text-center">Relatórios</TableHead>
                      <TableHead className="text-center">Docs</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAll.map(a => (
                      <TableRow key={a.company.id}>
                        <TableCell className="font-medium text-foreground">{a.company.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{a.company.cnpj || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{a.company.sector || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {a.company.city && a.company.uf ? `${a.company.city}/${a.company.uf}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{a.company.contact_name || "—"}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px]">{a.reports.length}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px]">{a.docs.length}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setSelectedId(a.company.id); setViewMode("detail"); }}
                              className="h-8 gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" /> Detalhes
                            </Button>
                            {!isReadOnly && (
                              <Button
                                size="sm"
                                onClick={() => handleNewAudit(a.company)}
                                className="h-8 bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-1"
                              >
                                <Plus className="w-3.5 h-3.5" /> Auditoria
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Layout: Lista + Detalhe */}
        {viewMode === "detail" && (
          hiddenList ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Eye className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Lista de empresas oculta.</p>
                <p className="text-xs text-muted-foreground mt-1">Clique em "Exibir Empresas" para visualizar.</p>
              </CardContent>
            </Card>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
          {/* Lista */}
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">Empresas Atendidas</CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {filtered.length} de {filteredAll.length} (mais recentes)
                </Badge>
              </div>

              {/* Lista suspensa para seleção rápida — exibe até 5 mais recentes */}
              <div className="mt-2">
                <Label className="text-[11px] text-muted-foreground">Selecionar empresa</Label>
                <Select
                  value={selectedId || ""}
                  onValueChange={(v) => { setSelectedId(v); setShowRegister(false); }}
                  disabled={loading || filtered.length === 0}
                >
                  <SelectTrigger className="h-9 mt-1">
                    <SelectValue placeholder={filtered.length === 0 ? "Nenhuma empresa encontrada" : "Selecione uma empresa"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    {filtered.map(a => (
                      <SelectItem key={a.company.id} value={a.company.id}>
                        <span className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-[hsl(217,91%,50%)]" />
                          <span className="font-medium">{a.company.name}</span>
                          {a.company.cnpj && <span className="text-[11px] text-muted-foreground">— {a.company.cnpj}</span>}
                        </span>
                      </SelectItem>
                    ))}
                    {filteredAll.length > filtered.length && (
                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground border-t mt-1">
                        Exibindo as 5 mais recentes. Refine a busca ou use a "Lista de Empresas" para ver todas.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="relative mt-3">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Ou buscar por nome, CNPJ, cidade..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent className="p-2">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {companies.length === 0 ? "Nenhuma empresa cadastrada." : "Nenhuma empresa encontrada."}
                  </p>
                </div>
              ) : (
                <div className="space-y-1 max-h-[600px] overflow-y-auto">
                  {filtered.map(a => {
                    const isActive = a.company.id === selectedId;
                    return (
                      <button
                        key={a.company.id}
                        onClick={() => { setSelectedId(a.company.id); setShowRegister(false); }}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          isActive
                            ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]/40"
                            : "bg-muted/20 hover:bg-muted/40 border-transparent"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="w-8 h-8 rounded-md bg-[hsl(217,91%,50%)]/15 flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4 text-[hsl(217,91%,50%)]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{a.company.name}</p>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                              {a.company.cnpj && <span>{a.company.cnpj}</span>}
                              {a.company.city && a.company.uf && <span>• {a.company.city}/{a.company.uf}</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">{a.reports.length} relatórios</Badge>
                              <Badge variant="outline" className="text-[10px]">{a.docs.length} docs</Badge>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detalhe */}
          <div className="space-y-4">
            {!selected ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Selecione uma empresa à esquerda para ver o histórico de auditorias e relatórios.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Cabeçalho da empresa */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold text-foreground">{selected.company.name}</h2>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                          {selected.company.cnpj && <span>CNPJ: {selected.company.cnpj}</span>}
                          {selected.company.sector && <span>• {selected.company.sector}</span>}
                          {selected.company.contact_name && <span>• Contato: {selected.company.contact_name}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isReadOnly && !editing && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEdit(selected.company)}
                            className="gap-1.5"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Editar
                          </Button>
                        )}
                        {!isReadOnly && (
                          <Button
                            size="sm"
                            onClick={() => handleNewAudit(selected.company)}
                            className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-1.5"
                          >
                            <Plus className="w-4 h-4" /> Fazer Auditoria
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                      <div className="p-3 rounded-lg bg-muted/30">
                        <p className="text-[11px] text-muted-foreground">Relatórios</p>
                        <p className="text-lg font-bold text-foreground">{selected.reports.length}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30">
                        <p className="text-[11px] text-muted-foreground">Documentos</p>
                        <p className="text-lg font-bold text-foreground">{selected.docs.length}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30">
                        <p className="text-[11px] text-muted-foreground">Conformidade Média</p>
                        <p className="text-lg font-bold text-foreground">{selected.avgConformidade}%</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30">
                        <p className="text-[11px] text-muted-foreground">Achados Totais</p>
                        <p className="text-lg font-bold text-foreground">{selected.totalRiscos}</p>
                      </div>
                    </div>

                    {/* Formulário de edição da empresa */}
                    {editing && (
                      <div className="mt-5 pt-5 border-t border-border/50">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Pencil className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Editar Cadastro da Empresa
                          </h3>
                          <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="h-7 gap-1 text-xs">
                            <X className="w-3.5 h-3.5" /> Cancelar
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1.5 md:col-span-2">
                            <Label htmlFor="ename" className="text-xs">Razão Social *</Label>
                            <Input id="ename" value={editForm.name || ""} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="ecnpj" className="text-xs">CNPJ</Label>
                            <Input id="ecnpj" value={editForm.cnpj || ""} onChange={e => setEditForm(f => ({ ...f, cnpj: formatCNPJ(e.target.value) }))} maxLength={18} inputMode="numeric" />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="ecnae" className="text-xs">CNAE</Label>
                            <Input id="ecnae" value={editForm.cnae || ""} onChange={e => setEditForm(f => ({ ...f, cnae: e.target.value }))} placeholder="0000-0/00" />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="esector" className="text-xs">Setor</Label>
                            <Select value={editForm.sector || ""} onValueChange={(v) => setEditForm(f => ({ ...f, sector: v }))}>
                              <SelectTrigger id="esector"><SelectValue placeholder="Selecione" /></SelectTrigger>
                              <SelectContent>{SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="econtact" className="text-xs">Responsável</Label>
                            <Input id="econtact" value={editForm.contact_name || ""} onChange={e => setEditForm(f => ({ ...f, contact_name: e.target.value }))} />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="eemail" className="text-xs">E-mail</Label>
                            <Input id="eemail" type="email" value={editForm.email || ""} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="ephone" className="text-xs">Celular</Label>
                            <Input id="ephone" value={editForm.phone || ""} onChange={e => setEditForm(f => ({ ...f, phone: formatPhoneMobile(e.target.value) }))} placeholder="(00) 00000-0000" />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="ephonef" className="text-xs">Telefone Fixo</Label>
                            <Input id="ephonef" value={editForm.phone_fixed || ""} onChange={e => setEditForm(f => ({ ...f, phone_fixed: formatPhoneLandline(e.target.value) }))} placeholder="(00) 0000-0000" />
                          </div>
                          <div className="space-y-1.5 md:col-span-2">
                            <Label htmlFor="eaddr" className="text-xs">Endereço</Label>
                            <Input id="eaddr" value={editForm.address || ""} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} placeholder="Rua, número, complemento" />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="ecity" className="text-xs">Cidade</Label>
                            <Input id="ecity" value={editForm.city || ""} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="euf" className="text-xs">UF</Label>
                              <Select value={editForm.uf || ""} onValueChange={(v) => setEditForm(f => ({ ...f, uf: v }))}>
                                <SelectTrigger id="euf"><SelectValue placeholder="UF" /></SelectTrigger>
                                <SelectContent>{UF.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="ezip" className="text-xs">CEP</Label>
                              <Input id="ezip" value={editForm.zip || ""} onChange={e => setEditForm(f => ({ ...f, zip: e.target.value }))} placeholder="00000-000" />
                            </div>
                          </div>
                          <div className="space-y-1.5 md:col-span-2">
                            <Label htmlFor="enotes" className="text-xs">Observações</Label>
                            <Textarea id="enotes" value={editForm.notes || ""} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Notas internas sobre a empresa..." />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
                          <Button
                            size="sm"
                            onClick={handleSaveEdit}
                            disabled={savingEdit}
                            className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-1.5"
                          >
                            {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Salvar Alterações
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Relatórios */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Histórico de Relatórios
                    </CardTitle>
                    <CardDescription>Relatórios de auditoria emitidos para esta empresa.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selected.reports.length === 0 ? (
                      <div className="text-center py-8">
                        <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Nenhum relatório gerado ainda.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selected.reports.map(r => {
                          const rb = riskBadge[r.riskLevel] || riskBadge.moderado;
                          return (
                            <div
                              key={r.id}
                              onClick={() => navigate(`/user/report/${r.id}`, { state: { from: "/user/empresas" } })}
                              className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer flex items-center gap-3 flex-wrap"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                                  <Badge variant="outline" className="text-[10px]">{r.format}</Badge>
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
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Documentos Relacionados
                    </CardTitle>
                    <CardDescription>Arquivos analisados nas auditorias desta empresa.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selected.docs.length === 0 ? (
                      <div className="text-center py-8">
                        <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Nenhum documento analisado ainda.</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {selected.docs.map(d => (
                          <div key={d.id} className="flex items-center gap-3 p-2 rounded bg-muted/30">
                            <FileText className="w-3.5 h-3.5 text-[hsl(217,91%,50%)] shrink-0" />
                            <p className="text-xs font-medium text-foreground truncate flex-1">{d.fileName}</p>
                            <Badge variant="outline" className="text-[10px]">{d.format}</Badge>
                            <span className="text-[11px] text-muted-foreground">{formatFileSize(d.fileSize)}</span>
                            <span className="text-[11px] text-muted-foreground">{d.date}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
        ))}
      </div>
    </PlatformLayout>
  );
};

export default UserEmpresas;
