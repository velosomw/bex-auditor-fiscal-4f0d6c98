import { useEffect, useMemo, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Save, Trash2, FileBarChart, Building2, Globe2, FileText, FileStack, CalendarClock, Loader2 } from "lucide-react";
import {
  getGlobalLimits, setGlobalLimits,
  getPerCompanyExtras, setPerCompanyExtra, removePerCompanyExtra,
  getAllCompaniesMonthlyUsage,
  type GlobalLimits, type PerCompanyExtra,
} from "@/services/reportLimitsService";
import { listCompanies, type Company } from "@/services/companiesService";

const DEFAULT_GLOBAL: GlobalLimits = { resumido: 1, completo: 10, empresas: 3, arquivos_por_auditoria: 3, meses_extracao_gratuito: 3, meses_extracao_pago: 12 };

const TabReportLimits = () => {
  const [global, setGlobal] = useState<GlobalLimits>(DEFAULT_GLOBAL);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [perLimits, setPerLimits] = useState<PerCompanyExtra[]>([]);
  const [usageMap, setUsageMap] = useState<Map<string, { resumido: number; completo: number }>>(new Map());
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [extraResumido, setExtraResumido] = useState<string>("0");
  const [extraCompleto, setExtraCompleto] = useState<string>("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [g, extras, comps, usage] = await Promise.all([
        getGlobalLimits(),
        getPerCompanyExtras(),
        listCompanies().catch(() => [] as Company[]),
        getAllCompaniesMonthlyUsage(),
      ]);
      setGlobal(g);
      setPerLimits(extras);
      setCompanies(comps);
      setUsageMap(usage);
    } catch (e: any) {
      toast.error("Falha ao carregar cotas: " + (e?.message ?? "erro desconhecido"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const sectors = useMemo(() => {
    const set = new Set<string>();
    companies.forEach(c => c.sector && set.add(c.sector));
    return Array.from(set).sort();
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter(c => {
      if (stateFilter !== "all" && c.sector !== stateFilter) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.cnpj || "").toLowerCase().includes(q);
    });
  }, [companies, search, stateFilter]);

  const totals = useMemo(() => {
    let totalResumidos = 0, totalCompletos = 0;
    usageMap.forEach(v => { totalResumidos += v.resumido; totalCompletos += v.completo; });
    return { totalResumidos, totalCompletos, companiesWithReports: usageMap.size };
  }, [usageMap]);

  const handleSaveGlobal = async () => {
    setSaving(true);
    try {
      await setGlobalLimits(global);
      toast.success(`Cotas salvas: ${global.empresas} empresas · ${global.arquivos_por_auditoria} arq/auditoria · ${global.resumido} gratuitos · ${global.completo} kanitz por mês`);
      await reload();
    } catch (e: any) {
      toast.error("Erro ao salvar cotas: " + (e?.message ?? "verifique se você é Gestor IA"));
    } finally {
      setSaving(false);
    }
  };

  const handleAddPerCompany = async () => {
    const c = companies.find(x => x.id === selectedCompanyId);
    if (!c) return toast.error("Selecione uma empresa");
    const r = Math.max(0, parseInt(extraResumido, 10) || 0);
    const co = Math.max(0, parseInt(extraCompleto, 10) || 0);
    if (r === 0 && co === 0) return toast.error("Informe ao menos 1 unidade extra");
    setSaving(true);
    try {
      await setPerCompanyExtra(c.id, c.name, { resumido: r, completo: co });
      toast.success(`Extras atribuídos a ${c.name}: +${r} gratuitos · +${co} kanitz`);
      await reload();
    } catch (e: any) {
      toast.error("Erro ao salvar extras: " + (e?.message ?? "permissão negada"));
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePer = async (id: string) => {
    try {
      await removePerCompanyExtra(id);
      toast.info("Cota extra removida");
      await reload();
    } catch (e: any) {
      toast.error("Erro ao remover: " + (e?.message ?? "permissão negada"));
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
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Building2 className="w-3.5 h-3.5" /> Empresas / Contabilidade</div>
          <div className="text-3xl font-bold mt-2">{global.empresas}</div>
          <div className="text-xs text-muted-foreground">limite de cadastro</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileStack className="w-3.5 h-3.5" /> Arquivos / Auditoria</div>
          <div className="text-3xl font-bold mt-2">{global.arquivos_por_auditoria}</div>
          <div className="text-xs text-muted-foreground">upload por auditoria</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileText className="w-3.5 h-3.5" /> Cota Gratuitos</div>
          <div className="text-3xl font-bold mt-2">{global.resumido}</div>
          <div className="text-xs text-muted-foreground">/empresa/mês</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileStack className="w-3.5 h-3.5" /> Cota Kanitz</div>
          <div className="text-3xl font-bold mt-2">{global.completo}</div>
          <div className="text-xs text-muted-foreground">/empresa/mês</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileBarChart className="w-3.5 h-3.5" /> Emitidos</div>
          <div className="text-3xl font-bold mt-2">{totals.totalResumidos + totals.totalCompletos}</div>
          <div className="text-xs text-muted-foreground">{totals.totalResumidos} gratuitos · {totals.totalCompletos} kanitz</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock className="w-3.5 h-3.5" /> Renovação</div>
          <div className="text-base font-semibold mt-2">Mensal</div>
          <div className="text-xs text-muted-foreground">Reseta no dia 1º</div>
        </div>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-xs text-amber-900 dark:text-amber-300">
        <strong>Regra de consumo:</strong> selecionar “Relatório Kanitz” gera o Kanitz + Gratuito, consumindo <b>1 kanitz + 1 gratuito</b> da cota.
        Selecionar “Relatório Gratuito” consome apenas <b>1 gratuito</b>. Cotas resetam todo dia 1º. O limite de <b>empresas</b> aplica-se ao cadastro feito pelo perfil Contabilidade.
      </div>

      {/* Limites globais por variante */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-base font-bold mb-1 flex items-center gap-2"><Globe2 className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Cotas Globais por Nível Técnico</h3>
        <p className="text-xs text-muted-foreground mb-4">Aplicadas ao perfil Contabilidade (acesso gratuito). Definem quantas empresas podem ser cadastradas, quantos arquivos podem ser enviados por auditoria e quantos relatórios podem ser baixados/impressos por mês.</p>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end max-w-5xl">
          <div>
            <Label className="text-xs">Empresas / contabilidade</Label>
            <Input
              type="number" min={0} max={9999}
              value={global.empresas}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setGlobal({ ...global, empresas: Number.isFinite(v) && v >= 0 ? v : 0 });
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Arquivos / auditoria</Label>
            <Input
              type="number" min={1} max={50}
              value={global.arquivos_por_auditoria}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setGlobal({ ...global, arquivos_por_auditoria: Number.isFinite(v) && v >= 1 ? v : 1 });
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Relatórios Gratuitos / mês</Label>
            <Input
              type="number" min={0} max={9999}
              value={global.resumido}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setGlobal({ ...global, resumido: Number.isFinite(v) && v >= 0 ? v : 0 });
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Relatórios Kanitz / mês</Label>
            <Input
              type="number" min={0} max={9999}
              value={global.completo}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setGlobal({ ...global, completo: Number.isFinite(v) && v >= 0 ? v : 0 });
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Meses extração (Gratuito)</Label>
            <Input
              type="number" min={1} max={60}
              value={global.meses_extracao_gratuito}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setGlobal({ ...global, meses_extracao_gratuito: Number.isFinite(v) && v >= 1 ? v : 1 });
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Meses extração (Pago)</Label>
            <Input
              type="number" min={1} max={120}
              value={global.meses_extracao_pago}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setGlobal({ ...global, meses_extracao_pago: Number.isFinite(v) && v >= 1 ? v : 1 });
              }}
            />
          </div>
          <Button onClick={handleSaveGlobal} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
          </Button>
        </div>
      </div>

      {/* Complemento por empresa */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-base font-bold mb-1">Complemento por Empresa</h3>
        <p className="text-xs text-muted-foreground mb-4">Adicione cota extra (acima da global) para uma empresa específica neste mês.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <Label className="text-xs">Empresa</Label>
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
              <SelectTrigger><SelectValue placeholder="Selecione empresa..." /></SelectTrigger>
              <SelectContent className="max-h-72">
                {companies.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.cnpj ? ` — ${c.cnpj}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">+ Gratuitos</Label>
            <Input type="number" min={0} max={999} value={extraResumido} onChange={e => setExtraResumido(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">+ Kanitz</Label>
            <Input type="number" min={0} max={999} value={extraCompleto} onChange={e => setExtraCompleto(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={handleAddPerCompany} disabled={saving}>Atribuir Cota Extra</Button>
        </div>

        {perLimits.length > 0 && (
          <div className="mt-5 border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-center">Gratuitos (Total)</TableHead>
                  <TableHead className="text-center">Kanitz (Total)</TableHead>
                  <TableHead className="text-center">Extras</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perLimits.map(l => (
                  <TableRow key={l.companyId}>
                    <TableCell className="font-medium">{l.companyName}</TableCell>
                    <TableCell className="text-center font-mono">{global.resumido + l.resumido}</TableCell>
                    <TableCell className="text-center font-mono">{global.completo + l.completo}</TableCell>
                    <TableCell className="text-center text-xs">
                      <Badge variant="secondary" className="mr-1">+{l.resumido} R</Badge>
                      <Badge variant="secondary">+{l.completo} C</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => handleRemovePer(l.companyId)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Consumo mensal por empresa */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-base font-bold">Consumo do Mês por Empresa</h3>
            <p className="text-xs text-muted-foreground">Cotas e relatórios emitidos no mês corrente, separados por variante.</p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8 w-56" placeholder="Buscar empresa ou CNPJ..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Setor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os setores</SelectItem>
                {sectors.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead className="text-center">Gratuitos</TableHead>
                <TableHead className="text-center">Kanitz</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompanies.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhuma empresa encontrada.</TableCell></TableRow>
              )}
              {filteredCompanies.map(c => {
                const extra = perLimits.find(p => p.companyId === c.id);
                const limR = global.resumido + (extra?.resumido ?? 0);
                const limC = global.completo + (extra?.completo ?? 0);
                const used = usageMap.get(c.id) || { resumido: 0, completo: 0 };
                const pctR = limR > 0 ? (used.resumido / limR) * 100 : 0;
                const pctC = limC > 0 ? (used.completo / limC) * 100 : 0;
                const worst = Math.max(pctR, pctC);
                const status = worst >= 100 ? "esgotado" : worst >= 80 ? "alerta" : "ok";
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.cnpj || "—"}</TableCell>
                    <TableCell className="text-center font-mono text-xs">{used.resumido}/{limR}</TableCell>
                    <TableCell className="text-center font-mono text-xs">{used.completo}/{limC}</TableCell>
                    <TableCell className="text-center">
                      {status === "esgotado" ? <Badge variant="destructive">Esgotado</Badge>
                        : status === "alerta" ? <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/20">Alerta</Badge>
                        : <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20">OK</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default TabReportLimits;
