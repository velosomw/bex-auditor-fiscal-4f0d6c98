// Testes Deno para o motor de consolidação BS & Dados.
// Cobre os três cenários críticos de patrimônio líquido (PL):
//   1. PL positivo correto (template SSOT) — equação Ativo = Passivo + PL fecha
//   2. PL com dupla contagem (parser somou totalizador + filhas) — rebalanço
//      derruga para A − P e preserva original em patrimonio_liquido_bruto
//   3. PL negativo (passivo a descoberto, ex.: Giannini) — preserva sinal
//      negativo sem tratar como erro
//
// Roda com: deno test --allow-net --allow-env supabase/functions/audit-bs-dados/finalize_test.ts
import { assert, assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { finalize, emptyRow, emptyBuckets, buildBSDados } from "./index.ts";

Deno.test("PL positivo correto — equação fecha sem rebalanço", () => {
  const r = emptyRow("2026-01");
  r.ativo_circulante = 100; r.ativo_nao_circulante = 200;
  r.passivo_circulante = 80; r.passivo_nao_circulante = 70;
  r.patrimonio_liquido = 150; // 100+200 = 80+70+150 ✅
  const b = emptyBuckets();
  const out = finalize(r, b);
  assertEquals(out.patrimonio_liquido, 150);
  assertEquals(out.patrimonio_liquido_bruto, undefined);
  assert(!out.errors.some(e => e.includes("PL recalculado")));
});

Deno.test("PL inflado por dupla contagem — rebalanço derruba para A−P", () => {
  const r = emptyRow("2026-01");
  r.ativo_circulante = 100; r.ativo_nao_circulante = 80;     // A = 180
  r.passivo_circulante = 60; r.passivo_nao_circulante = 50;  // P = 110
  r.patrimonio_liquido = 301; // simula GG1 + 2.3 + filhas contado 3×
  const out = finalize(r, emptyBuckets());
  assertEquals(out.patrimonio_liquido_bruto, 301);
  assertEquals(out.patrimonio_liquido, 70); // 180 − 110
  assert(out.errors.some(e => e.includes("excedia Ativo Total")));
});

Deno.test("Passivo a descoberto — PL negativo preservado, sem erro", () => {
  const r = emptyRow("2026-01");
  // Cenário Giannini: Ativo 217M, Passivo 584M ⇒ PL = −367M
  r.ativo_circulante = 100; r.ativo_nao_circulante = 117;
  r.passivo_circulante = 300; r.passivo_nao_circulante = 284;
  r.patrimonio_liquido = -367;
  const out = finalize(r, emptyBuckets());
  assertEquals(out.patrimonio_liquido, -367);
  assertEquals(out.patrimonio_liquido_bruto, undefined);
  // Equação fecha: 217 = 584 + (-367)
  assert(!out.errors.some(e => e.includes("PL recalculado")));
  assert(!out.errors.some(e => e.includes("Equação contábil rompida")));
});

Deno.test("Sinais divergentes — parser leu PL positivo mas A−P é negativo", () => {
  const r = emptyRow("2026-01");
  // Parser inverteu sinal: leu +200 quando deveria ser −150
  r.ativo_circulante = 200; r.ativo_nao_circulante = 100;   // A = 300
  r.passivo_circulante = 250; r.passivo_nao_circulante = 200; // P = 450
  r.patrimonio_liquido = 200; // sinal divergente: A−P = −150
  const out = finalize(r, emptyBuckets());
  assertEquals(out.patrimonio_liquido_bruto, 200);
  assertEquals(out.patrimonio_liquido, -150);
  assert(out.errors.some(e => e.includes("sinais divergentes")));
});

Deno.test("PL ausente — derivado da equação", () => {
  const r = emptyRow("2026-01");
  r.ativo_circulante = 500; r.ativo_nao_circulante = 0;
  r.passivo_circulante = 300; r.passivo_nao_circulante = 100;
  r.patrimonio_liquido = 0; // parser não capturou PL
  const out = finalize(r, emptyBuckets());
  assertEquals(out.patrimonio_liquido, 100); // 500 − 400
  assert(out.errors.some(e => e.includes("PL ausente")));
});

Deno.test("buildBSDados — integração mínima com template SSOT", () => {
  // Smoke test: garante que o pipeline aceita linhas com REF1 e produz 1 linha/mês.
  const linhas = [
    { conta: "1.1.01", descricao: "Caixa", ref1: "A", saldo: 50 },
    { conta: "1.1.03", descricao: "Clientes", ref1: "C", saldo: 80 },
    { conta: "2.1.01", descricao: "Fornecedores", ref1: "BB", saldo: 60 },
    { conta: "2.3.01", descricao: "Capital Social", ref1: "GG1", saldo: 70 },
  ];
  const out = buildBSDados([{ mes: "2026-01", linhas }]);
  assertEquals(out.length, 1);
  const r = out[0];
  assertEquals(r.mesKey, "2026-01");
  assertAlmostEquals(r.ativo_circulante, 130, 1);
  assertAlmostEquals(r.passivo_circulante, 60, 1);
  assertAlmostEquals(r.patrimonio_liquido, 70, 1);
});
