import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Layers, Database, Filter, X, Check, ChevronDown } from "lucide-react";
import type { ParsedFinancialData } from "@/services/auditAIService";
import { inferRefByCode } from "@/services/auditAIService";
import { periodToMesKey, mesKeyToLabel, type BalanceteEntry } from "@/services/bsDadosBuilder";
import { cn } from "@/lib/utils";

interface Props {
  parsedData: ParsedFinancialData | null;
  entries?: BalanceteEntry[];
}

const fmt = (n: number) =>
  n === 0 ? "—" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));

/**
 * MultiSelect — popover com checkboxes para múltipla seleção + busca interna.
 * Usado para filtrar Mês e Código contábil de forma combinada.
 */
function MultiSelect({
  label, icon: Icon, options, selected, onChange, getLabel, width = "w-72",
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  options: string[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
  getLabel?: (v: string) => string;
  width?: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return options;
    const f = q.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(f) || (getLabel?.(o) ?? "").toLowerCase().includes(f));
  }, [options, q, getLabel]);

  const toggle = (v: string) => {
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange(next);
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every(o => selected.has(o));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allFilteredSelected) filtered.forEach(o => next.delete(o));
    else filtered.forEach(o => next.add(o));
    onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs justify-between min-w-[160px]">
          <span className="flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5" />
            {label}
            {selected.size > 0 && (
              <Badge className="h-4 px-1.5 text-[10px] bg-[hsl(258,90%,66%)]/15 text-[hsl(258,90%,66%)] border-0">
                {selected.size}
              </Badge>
            )}
          </span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0", width)} align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder={`Buscar ${label.toLowerCase()}…`}
              value={q}
              onChange={e => setQ(e.target.value)}
              className="pl-7 h-7 text-xs"
            />
          </div>
        </div>
        <div className="flex items-center justify-between px-2 py-1.5 border-b text-[11px]">
          <button onClick={toggleAll} className="text-[hsl(258,90%,66%)] hover:underline">
            {allFilteredSelected ? "Limpar filtrados" : "Selecionar filtrados"}
          </button>
          {selected.size > 0 && (
            <button onClick={() => onChange(new Set())} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
              <X className="w-3 h-3" /> Limpar tudo
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum resultado</p>
          ) : (
            filtered.map(o => (
              <label
                key={o}
                className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox
                  checked={selected.has(o)}
                  onCheckedChange={() => toggle(o)}
                  className="h-3.5 w-3.5"
                />
                <span className="font-mono text-[10px] text-muted-foreground min-w-0 truncate">{o}</span>
                {getLabel && getLabel(o) !== o && (
                  <span className="ml-auto text-[10px] text-muted-foreground truncate">{getLabel(o)}</span>
                )}
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Aba Pivot — visualização granular linha-a-linha do balancete consolidado.
 * Filtros combinados (AND): Mês × Código contábil + busca livre.
 */
export default function TabPivotBalancete({ parsedData, entries = [] }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const parseSet = (k: string) => {
    const v = searchParams.get(k);
    return new Set(v ? v.split(",").filter(Boolean) : []);
  };
  const [textFilter, setTextFilter] = useState(searchParams.get("pq") ?? "");
  const [selMeses, setSelMeses] = useState<Set<string>>(parseSet("pm"));
  const [selCodigos, setSelCodigos] = useState<Set<string>>(parseSet("pc"));

  // Serializa estado atual para comparação idempotente.
  const serialize = (s: Set<string>) => Array.from(s).sort().join(",");
  const currentSig = `${textFilter.trim()}|${serialize(selMeses)}|${serialize(selCodigos)}`;
  const urlSig = `${searchParams.get("pq") ?? ""}|${searchParams.get("pm") ?? ""}|${searchParams.get("pc") ?? ""}`;

  // Estado → URL (preserva outros params). Só escreve se houver divergência.
  useEffect(() => {
    if (currentSig === urlSig) return;
    const next = new URLSearchParams(searchParams);
    const setOrDel = (k: string, v: string) => v ? next.set(k, v) : next.delete(k);
    setOrDel("pq", textFilter.trim());
    setOrDel("pm", serialize(selMeses));
    
    setOrDel("pc", serialize(selCodigos));
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textFilter, selMeses, selCodigos]);

  // URL → estado (popstate: voltar/avançar do navegador). Só atualiza se houver divergência.
  useEffect(() => {
    if (currentSig === urlSig) return;
    setTextFilter(searchParams.get("pq") ?? "");
    setSelMeses(parseSet("pm"));
    
    setSelCodigos(parseSet("pc"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { meses, linhas, refs, codigos } = useMemo(() => {
    if (!parsedData) return { meses: [] as string[], linhas: [] as any[], refs: [] as string[], codigos: [] as string[] };

    const userMesKeys = entries.map(e => e.mesReferencia).filter((k): k is string => !!k);
    const periods = parsedData.years ?? [];
    const useUser = userMesKeys.length > 0 && periods.length <= 1;

    const allRows = [...(parsedData.dre ?? []), ...(parsedData.balanco ?? [])];
    const mesSet = new Set<string>();
    const map = new Map<string, any>();

    for (const r of allRows as any[]) {
      const conta = String(r.conta || "").trim();
      if (!conta) continue;
      const ref1 = (r.ref1 as string) || inferRefByCode(conta) || "";
      const valuesObj = r.values || {};
      const periodKeys = Object.keys(valuesObj);

      const targetMeses: string[] = useUser && periodKeys.length <= 1 && userMesKeys.length > 0
        ? userMesKeys
        : periodKeys.map(periodToMesKey);

      const key = conta;
      if (!map.has(key)) {
        map.set(key, { conta, descricao: r.descricao || "", ref1, byMes: {} as Record<string, number> });
      }
      const entry = map.get(key)!;
      if (!entry.ref1 && ref1) entry.ref1 = ref1;

      periodKeys.forEach(p => {
        const v = Number(valuesObj[p]) || 0;
        const mesKeys = useUser && periodKeys.length <= 1 ? targetMeses : [periodToMesKey(p)];
        for (const mk of mesKeys) {
          mesSet.add(mk);
          entry.byMes[mk] = (entry.byMes[mk] || 0) + v;
        }
      });
    }

    const meses = Array.from(mesSet).sort();
    const linhas = Array.from(map.values()).sort((a, b) => String(a.conta).localeCompare(String(b.conta)));
    const refs = Array.from(new Set(linhas.map(l => l.ref1).filter(Boolean) as string[])).sort();
    const codigos = linhas.map(l => l.conta as string);
    return { meses, linhas, refs, codigos };
  }, [parsedData, entries]);

  // Aplicação combinada (AND) de todos os filtros.
  const filtered = useMemo(() => {
    const f = textFilter.trim().toLowerCase();
    return linhas.filter(l => {
      
      if (selCodigos.size > 0 && !selCodigos.has(l.conta)) return false;
      if (f && !(
        String(l.conta).toLowerCase().includes(f) ||
        String(l.descricao).toLowerCase().includes(f) ||
        String(l.ref1).toLowerCase().includes(f)
      )) return false;
      // Filtro por mês: mantém a linha se houver pelo menos 1 mês selecionado com valor != 0
      if (selMeses.size > 0) {
        const hasAny = Array.from(selMeses).some(m => Number(l.byMes[m] || 0) !== 0);
        if (!hasAny) return false;
      }
      return true;
    });
  }, [linhas, textFilter, selMeses, selCodigos]);

  const visibleMeses = selMeses.size > 0 ? meses.filter(m => selMeses.has(m)) : meses;
  const totalActiveFilters = selMeses.size + selCodigos.size + (textFilter.trim() ? 1 : 0);

  const clearAll = () => {
    setTextFilter(""); setSelMeses(new Set()); setSelCodigos(new Set());
  };

  if (!linhas.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Database className="w-10 h-10 mx-auto mb-3 opacity-40" />
          Nenhum balancete carregado para visualização pivot.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[hsl(258,90%,66%)]/20">
      <CardHeader className="pb-3 space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="w-5 h-5 text-[hsl(258,90%,66%)]" />
              Pivot — Balancete Consolidado (linha-a-linha)
            </CardTitle>
            <CardDescription className="text-xs">
              Filtros combinados (AND): <strong>Mês</strong> × <strong>Ref Capital</strong> × <strong>Código</strong> + busca livre.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{filtered.length}/{linhas.length} contas</Badge>
            <Badge variant="outline" className="text-xs">{visibleMeses.length}/{meses.length} meses</Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect
            label="Mês"
            icon={Filter}
            options={meses}
            selected={selMeses}
            onChange={setSelMeses}
            getLabel={mesKeyToLabel}
          />
          <MultiSelect
            label="Código"
            icon={Filter}
            options={codigos}
            selected={selCodigos}
            onChange={setSelCodigos}
            width="w-80"
            getLabel={(c) => linhas.find(l => l.conta === c)?.descricao ?? ""}
          />
          <div className="relative">
            <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Busca livre…"
              value={textFilter}
              onChange={e => setTextFilter(e.target.value)}
              className="pl-7 h-8 w-56 text-xs"
            />
          </div>
          {totalActiveFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="h-8 text-xs gap-1 text-muted-foreground">
              <X className="w-3.5 h-3.5" /> Limpar ({totalActiveFilters})
            </Button>
          )}
        </div>

        {totalActiveFilters > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {Array.from(selMeses).sort().map(m => (
              <Badge key={`m-${m}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer"
                onClick={() => { const n = new Set(selMeses); n.delete(m); setSelMeses(n); }}>
                {mesKeyToLabel(m)} <X className="w-2.5 h-2.5" />
              </Badge>
            ))}
            {Array.from(selRefs).sort().map(r => (
              <Badge key={`r-${r}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer font-mono"
                onClick={() => { const n = new Set(selRefs); n.delete(r); setSelRefs(n); }}>
                Ref {r} <X className="w-2.5 h-2.5" />
              </Badge>
            ))}
            {Array.from(selCodigos).sort().slice(0, 6).map(c => (
              <Badge key={`c-${c}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer font-mono"
                onClick={() => { const n = new Set(selCodigos); n.delete(c); setSelCodigos(n); }}>
                {c} <X className="w-2.5 h-2.5" />
              </Badge>
            ))}
            {selCodigos.size > 6 && (
              <Badge variant="outline" className="text-[10px]">+{selCodigos.size - 6} códigos</Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-bold whitespace-nowrap">Código</TableHead>
              <TableHead className="font-bold">Descrição</TableHead>
              <TableHead className="font-bold">Ref</TableHead>
              {visibleMeses.map(m => (
                <TableHead key={m} className="text-right whitespace-nowrap">{mesKeyToLabel(m)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 500).map(l => (
              <TableRow key={l.conta}>
                <TableCell className="font-mono text-[10px]">{l.conta}</TableCell>
                <TableCell className="max-w-[280px] truncate">{l.descricao}</TableCell>
                <TableCell>
                  {l.ref1 ? (
                    <Badge variant="outline" className="text-[10px] font-mono">{l.ref1}</Badge>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                {visibleMeses.map(m => (
                  <TableCell key={m} className="text-right tabular-nums">{fmt(l.byMes[m] || 0)}</TableCell>
                ))}
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={3 + visibleMeses.length} className="text-center text-muted-foreground py-8 text-xs">
                  Nenhuma linha corresponde aos filtros selecionados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {filtered.length > 500 && (
          <p className="text-[10px] text-muted-foreground mt-2 text-right">
            Exibindo 500 de {filtered.length} linhas — refine os filtros para ver mais.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
