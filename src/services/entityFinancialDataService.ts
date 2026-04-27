import { supabase } from "@/integrations/supabase/client";
import type { CompanyData, CompanyDataMultiYear } from "@/types/audit";

/**
 * Agrega valores reais do balancete (tabela balancete_data) por empresa
 * em uma estrutura CompanyData compatível com os modelos Kanitz / BEX.
 *
 * Estratégia:
 * 1. Busca os pipeline_documents vinculados à empresa (company_id).
 * 2. Lê balancete_data desses documentos.
 * 3. Soma valores por categoria/subcategoria contábil.
 * 4. Distribui em campos do CompanyData usados pelas fórmulas.
 *
 * Se a empresa não tiver documentos processados, retorna null
 * (a UI deve cair em fallback didático).
 */

export interface EntityRealData {
  data: CompanyDataMultiYear;
  source: "real" | "empty";
  documentsCount: number;
  years: string[];
}

const yearFromDate = (iso: string): string => {
  try {
    return new Date(iso).getFullYear().toString();
  } catch {
    return new Date().getFullYear().toString();
  }
};

const emptyCompanyData = (): CompanyData => ({
  ativoCirculante: 0,
  ativoNaoCirculante: 0,
  passivoCirculante: 0,
  passivoNaoCirculante: 0,
  patrimonioLiquido: 0,
  receitaLiquida: 0,
  lucroLiquido: 0,
  duplicatasDescontadas: 0,
  estoques: 0,
  custoMercadoriasVendidas: 0,
  contasReceber: 0,
  fornecedores: 0,
  resultadoOperacional: 0,
  despesasFinanceiras: 0,
  imobilizado: 0,
  caixaEquivalentes: 0,
});

const matches = (text: string | null | undefined, ...needles: string[]) => {
  if (!text) return false;
  const t = text.toLowerCase();
  return needles.some((n) => t.includes(n));
};

export async function loadRealEntityData(companyId: string): Promise<EntityRealData> {
  // 1. Documentos da empresa
  const { data: docs, error: docsErr } = await supabase
    .from("pipeline_documents")
    .select("id, created_at, status")
    .eq("company_id", companyId)
    .eq("status", "completed");

  if (docsErr) throw docsErr;
  if (!docs || docs.length === 0) {
    return { data: {}, source: "empty", documentsCount: 0, years: [] };
  }

  const docIds = docs.map((d) => d.id);
  const docYearMap = new Map<string, string>(
    docs.map((d) => [d.id, yearFromDate(d.created_at)])
  );

  // 2. Linhas de balancete
  const { data: rows, error: rowsErr } = await supabase
    .from("balancete_data")
    .select("document_id, conta_normalizada, conta_original, categoria, subcategoria, tipo, valor")
    .in("document_id", docIds);

  if (rowsErr) throw rowsErr;
  if (!rows || rows.length === 0) {
    return { data: {}, source: "empty", documentsCount: docs.length, years: [] };
  }

  // 3. Agrupa por ano e preenche CompanyData
  const byYear = new Map<string, CompanyData>();

  for (const r of rows) {
    const year = docYearMap.get(r.document_id) ?? new Date().getFullYear().toString();
    if (!byYear.has(year)) byYear.set(year, emptyCompanyData());
    const cd = byYear.get(year)!;
    const valor = Math.abs(Number(r.valor) || 0);
    const conta = r.conta_normalizada || r.conta_original || "";
    const cat = r.categoria || "";
    const sub = r.subcategoria || "";

    // Distribuição contábil
    if (cat === "ativo_circulante") {
      cd.ativoCirculante += valor;
      if (matches(conta, "estoque")) cd.estoques += valor;
      if (matches(conta, "caixa", "banco", "equivalente")) cd.caixaEquivalentes += valor;
      if (matches(conta, "duplicata", "cliente", "receber")) cd.contasReceber += valor;
      if (matches(conta, "duplicata desconta")) cd.duplicatasDescontadas += valor;
    } else if (cat === "ativo_nao_circulante") {
      cd.ativoNaoCirculante += valor;
      if (matches(conta, "imobilizado", "imobilizad")) cd.imobilizado += valor;
    } else if (cat === "passivo_circulante") {
      cd.passivoCirculante += valor;
      if (matches(conta, "fornecedor")) cd.fornecedores += valor;
    } else if (cat === "passivo_nao_circulante") {
      cd.passivoNaoCirculante += valor;
    } else if (cat === "patrimonio_liquido") {
      cd.patrimonioLiquido += valor;
    } else if (cat === "receita") {
      cd.receitaLiquida += valor;
    } else if (cat === "custo") {
      cd.custoMercadoriasVendidas += valor;
    } else if (cat === "despesa") {
      if (matches(conta, "financeira", "juros")) cd.despesasFinanceiras += valor;
    }
  }

  // 4. Resultado operacional / lucro líquido (estimados a partir dos totais)
  for (const [, cd] of byYear) {
    const totalCusto = cd.custoMercadoriasVendidas;
    const totalDesp = cd.despesasFinanceiras; // só financeiras conhecidas — proxy
    cd.resultadoOperacional = cd.receitaLiquida - totalCusto;
    cd.lucroLiquido = cd.resultadoOperacional - totalDesp;
  }

  const years = Array.from(byYear.keys()).sort();
  const data: CompanyDataMultiYear = {};
  for (const y of years) data[y] = byYear.get(y)!;

  return {
    data,
    source: years.length > 0 ? "real" : "empty",
    documentsCount: docs.length,
    years,
  };
}
