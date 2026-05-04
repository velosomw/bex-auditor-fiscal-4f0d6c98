import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Layers, Database } from "lucide-react";
import type { ParsedFinancialData } from "@/services/auditAIService";
import { inferRefByCode } from "@/services/auditAIService";
import { periodToMesKey, mesKeyToLabel, type BalanceteEntry } from "@/services/bsDadosBuilder";

interface Props {
  parsedData: ParsedFinancialData | null;
  entries?: BalanceteEntry[];
}

const fmt = (n: number) =>
  n === 0 ? "—" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));

/**
 * Aba Pivot — visualização granular linha-a-linha do balancete consolidado.
 * Agrupa por código contábil (Extenso) com colunas dinâmicas por mês de referência.
 * Permite auditoria do mapeamento Ref Capital → BS & Dados.
 */
export default function TabPivotBalancete({ parsedData, entries = [] }: Props) {
  const [filter, setFilter] = useState("");

  const { meses, linhas } = useMemo(() => {
    if (!parsedData) return { meses: [] as string[], linhas: [] as any[] };

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

      periodKeys.forEach((p, idx) => {
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
    return { meses, linhas };
  }, [parsedData, entries]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return linhas;
    const f = filter.toLowerCase();
    return linhas.filter(l =>
      String(l.conta).toLowerCase().includes(f) ||
      String(l.descricao).toLowerCase().includes(f) ||
      String(l.ref1).toLowerCase().includes(f)
    );
  }, [linhas, filter]);

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
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="w-5 h-5 text-[hsl(258,90%,66%)]" />
              Pivot — Balancete Consolidado (linha-a-linha)
            </CardTitle>
            <CardDescription className="text-xs">
              Visualização granular por <strong>código contábil</strong> com colunas por mês de referência.
              Use para auditar o mapeamento <em>Código → Ref Capital → BS &amp; Dados</em>.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{linhas.length} contas</Badge>
            <Badge variant="outline" className="text-xs">{meses.length} meses</Badge>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Filtrar conta, descrição ou ref…"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="pl-7 h-8 w-64 text-xs"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-bold whitespace-nowrap">Código</TableHead>
              <TableHead className="font-bold">Descrição</TableHead>
              <TableHead className="font-bold">Ref</TableHead>
              {meses.map(m => (
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
                {meses.map(m => (
                  <TableCell key={m} className="text-right tabular-nums">{fmt(l.byMes[m] || 0)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length > 500 && (
          <p className="text-[10px] text-muted-foreground mt-2 text-right">
            Exibindo 500 de {filtered.length} linhas — refine o filtro para ver mais.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
