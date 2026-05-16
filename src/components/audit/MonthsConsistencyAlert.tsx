/**
 * MonthsConsistencyAlert
 * Compara os meses vinculados ao balancete carregado (entries) com os meses
 * efetivamente usados pelo motor de gráficos (dataset). Exibe aviso quando:
 *  - Há meses esperados (entries) ausentes no dataset → "colunas faltando"
 *  - Há meses no dataset que não foram selecionados pelo usuário → "extras"
 *  - Há duplicatas entre arquivos
 */
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { periodToMesKey, mesKeyToLabel } from "@/services/mesNormalizer";
import type { BalanceteEntry } from "@/services/bsDadosBuilder";

interface Props {
  entries: BalanceteEntry[];
  datasetMesKeys: string[]; // ex: ["2024-01", "2024-02"]
}

const MonthsConsistencyAlert: React.FC<Props> = ({ entries, datasetMesKeys }) => {
  const expectedKeys = entries
    .map(e => (e.mesReferencia ? periodToMesKey(e.mesReferencia) : null))
    .filter((k): k is string => !!k);

  if (!expectedKeys.length && !datasetMesKeys.length) return null;

  const expSet = new Set(expectedKeys);
  const dsSet = new Set(datasetMesKeys);

  // Só consideramos inconsistência quando um mês do balancete não tem dados.
  // Meses presentes apenas no dataset (fora do balancete) são ignorados — a análise
  // considera somente os meses efetivamente carregados pelo usuário.
  const missing = expSet.size > 0 ? [...expSet].filter(k => !dsSet.has(k)) : [];
  const dupCount = expectedKeys.length - expSet.size;

  const ok = !missing.length && !dupCount;

  if (ok && expSet.size > 0) {
    return (
      <Alert className="border-emerald-500/40 bg-emerald-500/5">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        <AlertTitle className="text-xs">Períodos consistentes</AlertTitle>
        <AlertDescription className="text-xs flex flex-wrap gap-1.5 mt-1">
          {[...expSet].sort().map(k => (
            <Badge key={k} variant="outline" className="text-[10px]">{mesKeyToLabel(k)}</Badge>
          ))}
        </AlertDescription>
      </Alert>
    );
  }

  if (ok) return null;

  return (
    <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/10">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="text-xs">Inconsistência de períodos detectada</AlertTitle>
      <AlertDescription className="text-xs space-y-2 mt-1">
        {missing.length > 0 && (
          <div>
            <span className="font-semibold">Colunas faltando no balancete</span> (selecionadas mas sem dados):
            <div className="flex flex-wrap gap-1 mt-1">
              {missing.sort().map(k => (
                <Badge key={k} variant="destructive" className="text-[10px]">{mesKeyToLabel(k)}</Badge>
              ))}
            </div>
          </div>
        )}
        {dupCount > 0 && (
          <div className="font-semibold">{dupCount} mês(es) duplicado(s) entre arquivos.</div>
        )}
      </AlertDescription>
    </Alert>
  );
};

export default MonthsConsistencyAlert;
