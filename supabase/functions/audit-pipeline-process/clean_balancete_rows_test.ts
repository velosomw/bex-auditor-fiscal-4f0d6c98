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

Deno.test("cleanBalanceteRows: respeita override de eps/decimals (escala grande)", () => {
  // Valores em milhões com diferença de R$ 0,50 — com eps padrão (0,01) NÃO seriam iguais.
  // Com eps=1, devem ser tratados como duplicata.
  const rows: Row[] = [
    row("1.1.01.001", "Caixa", 12_500_000.25),
    row("1.1.01.001", "Caixa", 12_500_000.75),
  ];
  const semOverride = cleanBalanceteRows(rows, { dataKind: "balanco" });
  assertEquals(semOverride.length, 2); // diff > eps padrão
  const comOverride = cleanBalanceteRows(rows, { eps: 1, decimals: 0 });
  assertEquals(comOverride.length, 1); // colapsa com eps=1
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
