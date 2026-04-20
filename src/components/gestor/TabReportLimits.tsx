import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Save, Trash2, FileBarChart, Building2, Globe2 } from "lucide-react";
import {
  getGlobalLimit, setGlobalLimit,
  getPerCompanyLimits, setPerCompanyLimit, removePerCompanyLimit,
  getCompanyReportCount, getCompanyLimit,
} from "@/services/reportLimitsService";
import { listCompanies, type Company } from "@/services/companiesService";
import { getGeneratedReports } from "@/services/auditHistoryService";

const TabReportLimits = () => {
  const [globalLimit, setGlobalLimitState] = useState<number>(getGlobalLimit());
  const [companies, setCompanies] = useState<Company[]>([]);
  const [perLimits, setPerLimits] = useState(getPerCompanyLimits());
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [extraQty, setExtraQty] = useState<string>("1");
  const [reports] = useState(getGeneratedReports());

  useEffect(() => {
    listCompanies().then(setCompanies).catch(() => setCompanies([]));
  }, []);

  const reportsByCompany = useMemo(() => {
    const map = new Map<string, number>();
    reports.forEach(r => {
      if (r.companyId) map.set(r.companyId, (map.get(r.companyId) || 0) + 1);
    });
    return map;
  }, [reports]);

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

  const totalReports = reports.length;
  const companiesWithReports = reportsByCompany.size;

  const handleSaveGlobal = () => {
    setGlobalLimit(globalLimit);
    toast.success(`Limite global definido para ${globalLimit} relatórios por empresa`);
  };

  const handleAddPerCompany = () => {
    const c = companies.find(x => x.id === selectedCompanyId);
    if (!c) return toast.error("Selecione uma empresa");
    const qty = parseInt(extraQty, 10) || 0;
    setPerCompanyLimit(c.id, c.name, qty);
    setPerLimits(getPerCompanyLimits());
    toast.success(`+${qty} relatórios extras atribuídos a ${c.name}`);
  };

  const handleRemovePer = (id: string) => {
    removePerCompanyLimit(id);
    setPerLimits(getPerCompanyLimits());
    toast.info("Regra removida");
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Globe2 className="w-3.5 h-3.5" /> Limite Global Atual</div>
          <div className="text-3xl font-bold mt-2">{getGlobalLimit()}</div>
          <div className="text-xs text-muted-foreground">relatórios / empresa</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileBarChart className="w-3.5 h-3.5" /> Total Emitidos</div>
          <div className="text-3xl font-bold mt-2">{totalReports}</div>
          <div className="text-xs text-muted-foreground">no portal</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Building2 className="w-3.5 h-3.5" /> Empresas Ativas</div>
          <div className="text-3xl font-bold mt-2">{companiesWithReports}</div>
          <div className="text-xs text-muted-foreground">com relatórios</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">Regras Específicas</div>
          <div className="text-3xl font-bold mt-2">{perLimits.length}</div>
          <div className="text-xs text-muted-foreground">empresas com extra</div>
        </div>
      </div>

      {/* Limite Global */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-base font-bold mb-1">Limite Global do Portal</h3>
        <p className="text-xs text-muted-foreground mb-4">Aplicado a todas as empresas cadastradas. Empresas listadas abaixo recebem quantidade adicional acima desse limite.</p>
        <div className="flex items-end gap-3 max-w-md">
          <div className="flex-1">
            <Label className="text-xs">Quantidade total por empresa</Label>
            <Input
              type="number"
              min={1}
              max={999}
              value={globalLimit}
              onChange={(e) => setGlobalLimitState(parseInt(e.target.value) || 1)}
            />
          </div>
          <Button onClick={handleSaveGlobal}><Save className="w-4 h-4" /> Salvar</Button>
        </div>
      </div>

      {/* Adicionar regra por empresa */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-base font-bold mb-1">Limite por Empresa Específica</h3>
        <p className="text-xs text-muted-foreground mb-4">Adicione uma quantidade adicional (acima do limite global) para uma empresa.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <Label className="text-xs">Pesquisar empresa</Label>
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
            <Label className="text-xs">Quantidade extra (1-10)</Label>
            <Select value={extraQty} onValueChange={setExtraQty}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <SelectItem key={n} value={String(n)}>+{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAddPerCompany}>Atribuir Limite Extra</Button>
        </div>

        {perLimits.length > 0 && (
          <div className="mt-5 border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-center">Limite Total</TableHead>
                  <TableHead className="text-center">Extra</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perLimits.map(l => (
                  <TableRow key={l.companyId}>
                    <TableCell className="font-medium">{l.companyName}</TableCell>
                    <TableCell className="text-center">{getGlobalLimit() + l.extra}</TableCell>
                    <TableCell className="text-center"><Badge variant="secondary">+{l.extra}</Badge></TableCell>
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

      {/* Relatórios por empresa */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-base font-bold">Relatórios Emitidos por Empresa</h3>
            <p className="text-xs text-muted-foreground">Visualize totais por empresa específica, todas, ou filtrando por setor.</p>
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
                <TableHead>Setor</TableHead>
                <TableHead className="text-center">Emitidos</TableHead>
                <TableHead className="text-center">Limite</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompanies.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhuma empresa encontrada.</TableCell></TableRow>
              )}
              {filteredCompanies.map(c => {
                const used = reportsByCompany.get(c.id) || 0;
                const limit = getCompanyLimit(c.id);
                const pct = limit > 0 ? (used / limit) * 100 : 0;
                const status = pct >= 100 ? "esgotado" : pct >= 80 ? "alerta" : "ok";
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.cnpj || "—"}</TableCell>
                    <TableCell className="text-xs">{c.sector || "—"}</TableCell>
                    <TableCell className="text-center font-mono">{used}</TableCell>
                    <TableCell className="text-center font-mono">{limit}</TableCell>
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
