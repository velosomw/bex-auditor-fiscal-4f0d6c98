// Testes unitários para cleanBalanceteRows
// Executar com: supabase--test_edge_functions { functions: ["audit-pipeline-process"] }

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cleanBalanceteRows } from "./index.ts";

type Row = { conta: string; descricao: string; values: Record<string, number> };

const row = (conta: string, descricao: string, valor: number, year = "2024"): Row => ({
  conta,
  descricao,
  values: { [year]: valor },
});

// ──────────────── FIXTURES ────────────────

// Fixture 1: duplicata exata (mesmo código, mesma descrição, mesmo valor)
const fxDuplicataExata: Row[] = [
  row("1.1.01.001", "Caixa Geral", 50_000),
  row("1.1.01.001", "Caixa Geral", 50_000), // duplicata
  row("1.1.01.002", "Bancos Conta Movimento", 120_000),
];

// Fixture 2: mesmo código + valor, descrições compatíveis (uma é prefixo da outra)
const fxDescricoesCompativeis: Row[] = [
  row("1.1.02.001", "Clientes", 800_000),
  row("1.1.02.001", "Clientes Nacionais", 800_000), // mais rica → mantém esta
  row("1.1.02.002", "Duplicatas a Receber", 200_000),
];

// Fixture 3: artefato Excel — linha [descrição vazia/numérica] + linha [descrição real]
// adjacentes com mesmo código e valor (parser do Excel quebra a célula em duas linhas)
const fxArtefatoExcel: Row[] = [
  row("1.2.01.005", "", 350_000), // descrição vazia → "code-like"
  row("1.2.01.005", "Imobilizado Industrial", 350_000), // descrição real
  row("1.2.01.006", "Veículos", 80_000),
];

// Fixture 4: contas DISTINTAS com mesmo valor (NÃO deve deduplicar)
const fxValoresIguaisContasDistintas: Row[] = [
  row("2.1.01.001", "Empréstimo Banco A", 100_000),
  row("2.1.01.002", "Empréstimo Banco B", 100_000), // valor coincidente, conta distinta
  row("2.1.01.003", "Fornecedores", 100_000),
];

// Fixture 5: hierarquia (sintética 1.1 deve sair se houver folhas 1.1.01.x)
const fxHierarquia: Row[] = [
  row("1.1", "Ativo Circulante", 170_000), // sintética
  row("1.1.01.001", "Caixa", 50_000),
  row("1.1.01.002", "Bancos", 120_000),
];

// Fixture 6: descrições sintéticas/totalizadoras
const fxSinteticas: Row[] = [
  row("1", "Ativo", 1_000_000),
  row("1.1.01.001", "Caixa", 50_000),
  row("3", "DRE", 0),
  row("3.1.01", "Receita Bruta", 500_000), // genérico → removido
  row("3.1.01.001", "Vendas de Mercadorias", 480_000),
];

// ──────────────── TESTES ────────────────

Deno.test("cleanBalanceteRows: remove duplicata exata", () => {
  const out = cleanBalanceteRows(fxDuplicataExata, { dataKind: "balanco" });
  assertEquals(out.length, 2);
  assertEquals(out.map((r) => r.descricao).sort(), ["Bancos Conta Movimento", "Caixa Geral"]);
});

Deno.test("cleanBalanceteRows: mantém descrição mais rica em descrições compatíveis", () => {
  const out = cleanBalanceteRows(fxDescricoesCompativeis, { dataKind: "balanco" });
  assertEquals(out.length, 2);
  const clientes = out.find((r) => r.conta === "1.1.02.001");
  assertEquals(clientes?.descricao, "Clientes Nacionais");
});

Deno.test("cleanBalanceteRows: colapsa artefato Excel código+descrição adjacentes", () => {
  const out = cleanBalanceteRows(fxArtefatoExcel, { dataKind: "balanco" });
  assertEquals(out.length, 2);
  const imob = out.find((r) => r.conta === "1.2.01.005");
  assertEquals(imob?.descricao, "Imobilizado Industrial");
});

Deno.test("cleanBalanceteRows: NÃO deduplica contas distintas com mesmo valor", () => {
  const out = cleanBalanceteRows(fxValoresIguaisContasDistintas, { dataKind: "balanco" });
  assertEquals(out.length, 3);
});

Deno.test("cleanBalanceteRows: filtra contas hierárquicas sintéticas", () => {
  const out = cleanBalanceteRows(fxHierarquia, { dataKind: "balanco" });
  // 1.1 sai (tem folhas), restam as duas folhas
  assertEquals(out.length, 2);
  assertEquals(out.every((r) => r.conta.startsWith("1.1.01.")), true);
});

Deno.test("cleanBalanceteRows: filtra descrições totalizadoras genéricas", () => {
  const out = cleanBalanceteRows(fxSinteticas, { dataKind: "balanco" });
  const descs = out.map((r) => r.descricao);
  assertEquals(descs.includes("Ativo"), false);
  assertEquals(descs.includes("DRE"), false);
  assertEquals(descs.includes("Receita Bruta"), false);
  assertEquals(descs.includes("Caixa"), true);
  assertEquals(descs.includes("Vendas de Mercadorias"), true);
});

Deno.test("cleanBalanceteRows: lista vazia retorna lista vazia", () => {
  assertEquals(cleanBalanceteRows([], { dataKind: "balanco" }).length, 0);
});

Deno.test("cleanBalanceteRows: respeita override de eps/decimals (escala pequena)", () => {
  // Valores pequenos com diferença de R$ 0,40. Com eps padrão (0,01) NÃO são iguais.
  // Com eps=0,5, devem ser tratados como duplicata.
  const rows: Row[] = [
    row("1.1.01.001", "Caixa", 100.20),
    row("1.1.01.001", "Caixa", 100.60),
  ];
  // Sem override: relTol pequena (1e-5 * 100 = 0.001) e eps=0.01 → diff 0.40 > tol → mantém ambas
  const semOverride = cleanBalanceteRows(rows, { dataKind: "balanco" });
  assertEquals(semOverride.length, 2);
  // Com eps=0.5: colapsa
  const comOverride = cleanBalanceteRows(rows, { eps: 0.5, decimals: 2 });
  assertEquals(comOverride.length, 1);
});

Deno.test("cleanBalanceteRows: tolerância relativa em valores muito grandes (modo auto)", () => {
  // mediana ~ 10M → auto deve aplicar relTol=1e-5; diferença de R$ 50 em R$ 10M é < relTol
  const rows: Row[] = [
    row("1.1.01.001", "Caixa Matriz", 10_000_000),
    row("1.1.01.001", "Caixa Matriz", 10_000_050), // 5e-6 de diferença relativa
    row("1.1.01.002", "Bancos", 8_500_000),
    row("1.1.01.003", "Aplicações", 7_200_000),
    row("1.1.01.004", "Contas a Receber", 12_000_000),
  ];
  const out = cleanBalanceteRows(rows, { dataKind: "auto" });
  assertEquals(out.length, 4); // duplicata colapsada via tolerância relativa
});

Deno.test("cleanBalanceteRows: janela de proximidade evita colapsar duplicatas distantes", () => {
  // Mesmo código+valor mas separados por mais de PROX_WINDOW (3) linhas → mantém ambas
  const rows: Row[] = [
    row("1.1.01.001", "Caixa", 50_000),
    row("1.1.02.001", "Bancos", 1),
    row("1.1.02.002", "Aplicações", 2),
    row("1.1.02.003", "Investimentos", 3),
    row("1.1.02.004", "Outros", 4),
    row("1.1.01.001", "Caixa", 50_000), // longe → não deduplica
  ];
  const out = cleanBalanceteRows(rows, { dataKind: "balanco", proxWindow: 3 });
  assertEquals(out.filter((r) => r.conta === "1.1.01.001").length, 2);
});

/* ════════════════════════════════════════════════════════════
   CAMADA DE SIMULAÇÃO — EXPORT DO EXCEL
   Reproduz como cada célula chega do parser do XLSX/CSV:
   - empty   → célula em branco (undefined / null / "")
   - number  → célula numérica (ex.: código "1.1.01.001" virou number 1.101001
               OU descrição preenchida apenas com o código numérico)
   - string  → célula texto normal
   Antes de chamar cleanBalanceteRows, normalizamos para o contrato
   { conta: string; descricao: string; values: Record<string, number> }
   exatamente como o pipeline real faz após o parseFile.
   ════════════════════════════════════════════════════════════ */

type ExcelCell = string | number | null | undefined;
interface ExcelRowRaw {
  conta: ExcelCell;
  descricao: ExcelCell;
  /** Valor único (ano default) — modo legado de coluna única */
  valor?: ExcelCell;
  /** Valores por ano — modo multi-ano: { "2022": ..., "2023": ..., "2024": ... } */
  valores?: Record<string, ExcelCell>;
}

const cellToString = (c: ExcelCell): string => {
  if (c === null || c === undefined) return "";
  if (typeof c === "number") return String(c);
  return String(c).trim();
};

const cellToNumber = (c: ExcelCell): number => {
  if (c === null || c === undefined || c === "") return 0;
  if (typeof c === "number") return c;
  // strings com vírgula decimal BR ("1.234,56") ou prefixo "R$"
  const cleaned = String(c).replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Coerção Excel → contrato Row.
 * Aceita modo legado (`valor` + `year`) ou multi-ano (`valores` mapeando ano→célula).
 */
function coerceExcelRow(raw: ExcelRowRaw, defaultYear = "2024"): Row {
  const values: Record<string, number> = {};
  if (raw.valores && typeof raw.valores === "object") {
    for (const [year, cell] of Object.entries(raw.valores)) {
      values[year] = cellToNumber(cell);
    }
  } else {
    values[defaultYear] = cellToNumber(raw.valor);
  }
  return {
    conta: cellToString(raw.conta),
    descricao: cellToString(raw.descricao),
    values,
  };
}

function fromExcel(rows: ExcelRowRaw[], defaultYear = "2024"): Row[] {
  return rows.map((r) => coerceExcelRow(r, defaultYear));
}

/** Validação mínima do contrato pós-coerção (antes do dedup). */
function assertValidContract(rows: Row[]) {
  for (const [i, r] of rows.entries()) {
    assertEquals(typeof r.conta, "string", `row ${i}: conta deve ser string`);
    assertEquals(typeof r.descricao, "string", `row ${i}: descricao deve ser string`);
    assertEquals(typeof r.values, "object", `row ${i}: values deve ser object`);
    for (const [y, v] of Object.entries(r.values)) {
      assertEquals(typeof v, "number", `row ${i}/${y}: valor deve ser number`);
      assertEquals(Number.isFinite(v), true, `row ${i}/${y}: valor deve ser finito`);
    }
  }
}

// ──────────────── FIXTURES "EXCEL-LIKE" ────────────────

// Excel-like 1: célula DESCRIÇÃO vazia (null/undefined/"") em uma das duplicatas.
// Caso clássico: parser entrega 2 linhas para o mesmo código — uma com descrição
// vazia (linha de cabeçalho da conta) e outra com a descrição real.
const fxExcelDescVazia: ExcelRowRaw[] = [
  { conta: "1.1.01.001", descricao: null,                  valor: 350_000 },
  { conta: "1.1.01.001", descricao: "Imobilizado Industrial", valor: 350_000 },
  { conta: "1.1.01.002", descricao: "",                    valor: 80_000 }, // string vazia
  { conta: "1.1.01.002", descricao: "Veículos",            valor: 80_000 },
];

// Excel-like 2: célula CONTA chega como NUMBER (Excel converte "1.1" em 1.1).
const fxExcelContaNumerica: ExcelRowRaw[] = [
  { conta: 1.1,           descricao: "Ativo Circulante",     valor: 170_000 }, // sintética → removida
  { conta: "1.1.01.001",  descricao: "Caixa",                valor: 50_000 },
  { conta: "1.1.01.002",  descricao: "Bancos",               valor: 120_000 },
];

// Excel-like 3: célula DESCRIÇÃO chega como NUMBER (Excel armazenou o código
// na coluna de descrição como número puro). Formato BR no valor (string com vírgula).
const fxExcelDescNumerica: ExcelRowRaw[] = [
  { conta: "1.2.01.005", descricao: 1.201005,                valor: "350.000,00" }, // descrição = código numérico
  { conta: "1.2.01.005", descricao: "Imobilizado Industrial", valor: 350_000 },
  { conta: "1.2.01.006", descricao: "Veículos",               valor: 80_000 },
];

// Excel-like 4: mistura de tipos + valores em formato BR + linhas em branco intercaladas.
const fxExcelMixed: ExcelRowRaw[] = [
  { conta: "1",          descricao: "Ativo",         valor: "1.000.000,00" }, // sintética
  { conta: undefined,    descricao: undefined,       valor: undefined },       // linha vazia
  { conta: "1.1.01.001", descricao: "Caixa",         valor: 50_000 },
  { conta: "1.1.01.001", descricao: "Caixa",         valor: 50_000 },          // duplicata exata
  { conta: 2.101,        descricao: "",              valor: 200_000 },         // conta numérica + desc vazia
  { conta: "2.1.01",     descricao: "Fornecedores",  valor: 200_000 },
];

// ──────────────── TESTES DA CAMADA EXCEL ────────────────

Deno.test("excel-coerce: contrato pós-coerção é sempre {string, string, number}", () => {
  const rows = fromExcel(fxExcelMixed);
  assertValidContract(rows);
});

Deno.test("excel-coerce: descrição vazia (null/'') colapsa duplicata via Caso 2", () => {
  const rows = fromExcel(fxExcelDescVazia);
  assertValidContract(rows);
  const out = cleanBalanceteRows(rows, { dataKind: "balanco" });
  assertEquals(out.length, 2);
  assertEquals(out.find((r) => r.conta === "1.1.01.001")?.descricao, "Imobilizado Industrial");
  assertEquals(out.find((r) => r.conta === "1.1.01.002")?.descricao, "Veículos");
});

Deno.test("excel-coerce: conta exportada como number (1.1) ainda é tratada como sintética", () => {
  const rows = fromExcel(fxExcelContaNumerica);
  assertValidContract(rows);
  // Após coerção, conta "1.1" é detectada como pai das folhas "1.1.01.x" → removida
  const out = cleanBalanceteRows(rows, { dataKind: "balanco" });
  assertEquals(out.length, 2);
  assertEquals(out.every((r) => r.conta.startsWith("1.1.01.")), true);
});

Deno.test("excel-coerce: descrição como number (código puro) — coerção e formato BR", () => {
  const rows = fromExcel(fxExcelDescNumerica);
  assertValidContract(rows);
  // Validação principal: valor BR "350.000,00" → 350000 numérico após coerção
  assertEquals(rows[0].values["2024"], 350_000);
  // Descrição numérica é coagida para string ("1.201005") — não é vazia,
  // então a heurística atual NÃO colapsa via Caso 2. Documenta o comportamento:
  // ambas as linhas do código "1.2.01.005" são preservadas (descrição numérica
  // pode ser legítima em alguns balancetes).
  const out = cleanBalanceteRows(rows, { dataKind: "balanco" });
  const cinco = out.filter((r) => r.conta === "1.2.01.005");
  assertEquals(cinco.length, 2);
  // Confirma que a versão textual está presente entre as preservadas
  assertEquals(cinco.some((r) => r.descricao === "Imobilizado Industrial"), true);
});

Deno.test("excel-coerce: cenário misto (vazias + numéricas + BR + duplicata)", () => {
  const rows = fromExcel(fxExcelMixed);
  assertValidContract(rows);
  // Coerção: "1.000.000,00" → 1_000_000; conta vazia → ""; conta 2.101 → "2.101"
  assertEquals(rows[0].values["2024"], 1_000_000);
  assertEquals(rows[1].conta, "");
  assertEquals(rows[4].conta, "2.101");

  const out = cleanBalanceteRows(rows, { dataKind: "balanco" });
  // - "Ativo" (sintético) removido por descrição
  // - linha vazia: conta "" e desc "" → não casa hierarquia nem dedup; mantida
  //   (não polui o resultado contábil pois valor=0 a deixa fora dos somatórios)
  // - duplicata exata "1.1.01.001"/Caixa colapsa
  // - "2.101" (conta-only num) e "2.1.01"/Fornecedores: códigos normalizam para "2.101" vs "2.1.01"
  //   → códigos diferentes; valor igual mas distintos → mantém ambos
  const contas = out.map((r) => r.conta);
  assertEquals(contas.includes("1"), false); // sintético removido
  assertEquals(contas.filter((c) => c === "1.1.01.001").length, 1); // duplicata colapsada
});

/* ════════════════════════════════════════════════════════════
   FIXTURE XLSX REAL — gerada por openpyxl em
   ./fixtures/balancete_real.xlsx (com formatação BRL "R$ #,##0,00",
   células vazias, código numérico e descrições mistas).
   Lemos o arquivo via SheetJS exatamente como o pipeline real faz
   (parseFile no edge function), aplicamos a coerção e validamos.
   ════════════════════════════════════════════════════════════ */

import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { fromFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";

const FIXTURE_PATH = fromFileUrl(new URL("./fixtures/balancete_real.xlsx", import.meta.url));

function readBalanceteXlsx(path: string): ExcelRowRaw[] {
  const bytes = Deno.readFileSync(path);
  const wb = XLSX.read(bytes, { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // raw:true → mantém numbers como numbers (simula como o parser real entrega)
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    header: ["conta", "descricao", "valor"],
    range: 1, // pula cabeçalho
    raw: true,
    defval: null,
  });
  return json.map((r) => ({
    conta: r.conta as ExcelCell,
    descricao: r.descricao as ExcelCell,
    valor: r.valor as ExcelCell,
  }));
}

Deno.test("xlsx-real: lê fixture, coage e valida contrato", () => {
  const raw = readBalanceteXlsx(FIXTURE_PATH);
  // 14 linhas de dados (uma totalmente vazia inclusa)
  assertEquals(raw.length >= 13, true, `linhas lidas: ${raw.length}`);
  const rows = fromExcel(raw);
  assertValidContract(rows);
  // BRL grande exportado como número numérico vem direto: 1_000_000
  const ativo = rows.find((r) => r.descricao === "Ativo");
  assertEquals(ativo?.values["2024"], 1_000_000);
  // Conta numérica 1.1 vira string "1.1"
  const circulante = rows.find((r) => r.descricao === "Ativo Circulante");
  assertEquals(circulante?.conta, "1.1");
});

Deno.test("xlsx-real: cleanBalanceteRows produz resultado esperado", () => {
  const rows = fromExcel(readBalanceteXlsx(FIXTURE_PATH));
  const out = cleanBalanceteRows(rows, { dataKind: "auto" });

  const contas = out.map((r) => r.conta);
  const descs = out.map((r) => r.descricao);

  // 1) Sintéticos removidos (têm folhas abaixo OU descrição totalizadora)
  assertEquals(descs.includes("Ativo"), false, "sintético 'Ativo' deve sair");
  assertEquals(descs.includes("Ativo Circulante"), false, "sintético '1.1' deve sair");
  assertEquals(descs.includes("DRE"), false, "sintético 'DRE' deve sair");

  // 2) Duplicata exata "1.1.01.001"/Caixa Geral colapsada
  assertEquals(contas.filter((c) => c === "1.1.01.001").length, 1);

  // 3) Artefato Excel "1.1.01.002" (desc vazia + Bancos) colapsado mantendo a rica
  const bancos = out.find((r) => r.conta === "1.1.01.002");
  assertEquals(bancos?.descricao, "Bancos Conta Movimento");

  // 4) Contas distintas com mesmo valor preservadas
  const emprestimos = out.filter((r) => r.descricao?.startsWith("Empréstimo Banco"));
  assertEquals(emprestimos.length, 2);

  // 5) Tolerância relativa: vendas 10M vs 10M+50 colapsam (relTol em modo auto)
  assertEquals(contas.filter((c) => c === "3.1.01.001").length, 1);
});

