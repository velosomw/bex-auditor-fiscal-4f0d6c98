/**
 * Edge Function: audit-bs-dados
 *
 * Backend authoritative implementation of the BS & Dados consolidation engine.
 * Mirrors the client-side `bsDadosBuilder.ts` so that the same single source of
 * truth is available for: PDF reports, server exports, audit history snapshots
 * and any third party integration. Persists the consolidated snapshot into
 * `pipeline_analysis_results.indicadores` when `document_id` is provided.
 *
 * INPUT (POST JSON):
 * {
 *   document_id?: string,                  // optional — persists snapshot
 *   balancetes: Array<{
 *     mes: string,                         // "YYYY-MM" or "Março 2024"
 *     linhas: Array<{
 *       conta?: string,
 *       descricao?: string,
 *       ref1?: string | null,              // Ref Capital BEX (A, B, AA…)
 *       saldo: number
 *     }>
 *   }>
 * }
 *
 * OUTPUT:
 * {
 *   bsDados: BSDadosRow[],                 // consolidated rows
 *   indicadores: BSIndicators[],           // derived metrics per month
 *   summary: { meses: number, total_linhas: number, errors: number },
 *   persisted?: boolean
 * }
 */
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.95.0/cors";

// ─── Importa lógica pura do core.ts (testável sem npm:supabase-js) ──────────
import {
  buildBSDados, enrich, computeKanitz, computeInsights,
  inferRefByCode, periodToMesKey,
  type BSDadosRow, type BSIndicators, type KanitzRow,
  type InputLinha, type InputBalancete,
} from "./core.ts";

// ─── HTTP handler ────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);

    // ─── MODO REPROCESS ──────────────────────────────────────
    // Onda 10 (Giannini 2026.05.28): reprocessa uma auditoria existente
    // lendo `balancete_lines` já persistidas e regravando bs_dados/indicadores/
    // kanitz/insights com a lógica atual do motor. Não cria nova auditoria.
    if (body && typeof body.reprocess_audit_id === "string") {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
      );
      const auditId = body.reprocess_audit_id;
      const { data: bals, error: bErr } = await supabase
        .from("balancetes")
        .select("id, mes_referencia")
        .eq("audit_id", auditId)
        .order("mes_referencia", { ascending: true });
      if (bErr || !bals?.length) {
        return new Response(JSON.stringify({ error: "balancetes não encontrados para a auditoria", detail: bErr?.message }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const inputs: InputBalancete[] = [];
      for (const b of bals) {
        const { data: lines } = await supabase
          .from("balancete_lines")
          .select("conta, descricao, ref1, saldo")
          .eq("balancete_id", b.id);
        const mesKey = String(b.mes_referencia).slice(0, 7);
        inputs.push({
          mes: mesKey,
          linhas: (lines || []).map((l: any) => ({
            conta: l.conta, descricao: l.descricao, ref1: l.ref1, saldo: Number(l.saldo) || 0,
          })),
        });
      }
      const bsDados = buildBSDados(inputs);
      const indicadores = enrich(bsDados);
      const kanitz = computeKanitz(bsDados);
      const insightsObj = computeInsights(bsDados, kanitz);

      const bsRows = bsDados.map((r) => ({
        audit_id: auditId,
        mes: `${r.mesKey}-01`,
        receita_liquida: r.receita_liquida, cmv: r.cmv, despesas: r.despesas,
        despesas_financeiras: r.despesas_financeiras, receitas_financeiras: r.receitas_financeiras,
        outras_nao_operacionais: r.outras_nao_operacionais,
        depreciacao: r.depreciacao, amortizacao: r.amortizacao, resultado: r.resultado,
        ativo_circulante: r.ativo_circulante, ativo_nao_circulante: r.ativo_nao_circulante,
        passivo_circulante: r.passivo_circulante, passivo_nao_circulante: r.passivo_nao_circulante,
        patrimonio_liquido: r.patrimonio_liquido,
        patrimonio_liquido_bruto: r.patrimonio_liquido_bruto ?? null,
        ativo_total: r.ativo_total, passivo_total: r.passivo_total,
        estoques: r.estoques, estoques_bruto: r.estoques_bruto ?? null,
        disponivel: r.disponivel, contas_receber: r.contas_receber,
        imobilizado: r.imobilizado, realizavel_longo_prazo: r.realizavel_longo_prazo,
        investimentos: r.investimentos, intangivel: r.intangivel,
        divida_tributaria: r.divida_tributaria, divida_trabalhista: r.divida_trabalhista,
        divida_financeira: r.divida_financeira, fornecedores: r.fornecedores,
        credores_rj: r.credores_rj, outras_obrigacoes: r.outras_obrigacoes,
        divida_total: r.divida_total, divida_total_bruto: r.divida_total_bruto ?? null,
        errors: r.errors, ytd_flags: r.ytd_flags ?? null,
        validation_status: r.validation_status ?? "ok",
        validation_diagnostics: r.validation_diagnostics ?? null,
        confidence_by_group: r.confidence_by_group ?? null,
      }));
      const indRows = indicadores.map((i, idx) => ({
        audit_id: auditId, mes: `${bsDados[idx].mesKey}-01`,
        cmv_percent: i.cmvPercent, despesa_percent: i.despesaPercent,
        cmv_despesa_percent: i.cmvDespesaPercent, resultado_percent: i.resultadoPercent,
        liquidez_corrente: i.liquidezCorrente, liquidez_seca: i.liquidezSeca,
        liquidez_imediata: i.liquidezImediata,
      }));
      const kanitzRows = kanitz.map(k => ({
        audit_id: auditId, mes: `${k.mesKey}-01`,
        ativo_total: k.ativo_total, passivo_total: k.passivo_total,
        patrimonio_liquido: k.patrimonio_liquido,
        x1: k.x1, x2: k.x2, x3: k.x3, x4: k.x4, x5: k.x5,
        score: k.score, rating: k.rating, insight: k.insight,
        isg: k.isg, isg_rating: k.isg_rating,
        modelo_preferencial: k.modelo_preferencial,
      }));

      // Limpa snapshots antigos e regrava
      await supabase.from("indicadores").delete().eq("audit_id", auditId);
      await supabase.from("kanitz_scores").delete().eq("audit_id", auditId);
      await supabase.from("insights").delete().eq("audit_id", auditId);
      const ops: Promise<unknown>[] = [];
      if (bsRows.length) ops.push(supabase.from("bs_dados").upsert(bsRows, { onConflict: "audit_id,mes" }));
      if (indRows.length) ops.push(supabase.from("indicadores").insert(indRows));
      if (kanitzRows.length) ops.push(supabase.from("kanitz_scores").insert(kanitzRows));
      ops.push(supabase.from("insights").insert({
        audit_id: auditId,
        diagnostico: insightsObj.diagnostico, problemas: insightsObj.problemas,
        riscos: insightsObj.riscos, recomendacoes: insightsObj.recomendacoes,
        positivos: insightsObj.positivos, tendencia: insightsObj.tendencia,
        generated_by: "deterministic-bs-dados-v2-reprocess",
      }));
      const results = await Promise.all(ops);
      const errors = results.map((r: any) => r?.error?.message).filter(Boolean);

      await supabase.from("audit_logs").insert({
        audit_id: auditId, etapa: "bs_dados.reprocess",
        status: errors.length ? "warn" : "ok",
        payload: { meses: bsDados.length, errors },
      });

      return new Response(JSON.stringify({
        reprocessed: true, audit_id: auditId, meses: bsDados.length,
        bsDados, indicadores, kanitz, errors,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!body || !Array.isArray(body.balancetes)) {
      return new Response(JSON.stringify({ error: "balancetes[] obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // ── SANITIZAÇÃO DE mesKey (FIX #2) ───────────────────────
    // Rejeita placeholders ("atual", "corrente", "—") que quebram o cast ::date
    // mais adiante e fazem perder TODA a persistência determinística.
    const isValidMesKey = (k: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k);
    const rawBalancetes: InputBalancete[] = body.balancetes;
    const sanitized: InputBalancete[] = [];
    const rejected: Array<{ mes: string; reason: string }> = [];
    for (const b of rawBalancetes) {
      const mk = periodToMesKey(b.mes);
      if (isValidMesKey(mk)) {
        sanitized.push({ ...b, mes: mk });
      } else {
        rejected.push({ mes: b.mes, reason: `mês inválido após normalização: "${mk}"` });
      }
    }
    if (sanitized.length === 0) {
      return new Response(JSON.stringify({
        error: "Nenhum balancete com mês válido (YYYY-MM). Forneça meses explícitos antes de consolidar.",
        rejected,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (rejected.length > 0) {
      console.warn(`[audit-bs-dados] ${rejected.length} balancete(s) descartados por mês inválido:`, rejected);
    }

    const balancetes: InputBalancete[] = sanitized;
    const bsDados = buildBSDados(balancetes);
    const indicadores = enrich(bsDados);
    const kanitz = computeKanitz(bsDados);
    const insightsObj = computeInsights(bsDados, kanitz);
    const summary = {
      meses: bsDados.length,
      total_linhas: balancetes.reduce((s, b) => s + (b.linhas?.length || 0), 0),
      errors: bsDados.reduce((s, r) => s + r.errors.length, 0),
      rejected_meses: rejected.length,
    };


    let persisted = false;
    let auditId: string | null = null;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    // ─── BACKGROUND TASKS — não bloqueiam a resposta ────────
    // Coletor de promises diferidas. Tudo o que não é necessário no payload de
    // retorno (legacy snapshot, balancete_lines, audit_logs) vai para waitUntil.
    const backgroundTasks: Promise<unknown>[] = [];
    const runBackground = (label: string, p: Promise<unknown>) => {
      backgroundTasks.push(
        p.catch((e) => console.warn(`[bg:${label}]`, (e as Error)?.message || e)),
      );
    };

    // (a) snapshot legacy em pipeline_analysis_results (compat) — BACKGROUND
    if (body.document_id && typeof body.document_id === "string") {
      runBackground("pipeline_analysis_results",
        supabase.from("pipeline_analysis_results").insert({
          document_id: body.document_id,
          indicadores: { bsDados, indicadores, summary, generated_at: new Date().toISOString() },
          mapping_score: bsDados.length ? 1 : 0,
          validation_score: summary.errors === 0 ? 1 : 0.5,
          quality_score: summary.errors === 0 && bsDados.length ? 1 : 0.5,
        }),
      );
      persisted = true;
    }

    // (b) MD MASTER: cria audit + balancetes + bs_dados + indicadores
    if (body.company_id && typeof body.company_id === "string") {
      try {
        // userId via JWT
        const { data: userData } = await supabase.auth.getUser(
          (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""),
        );
        const createdBy = userData?.user?.id;
        if (createdBy) {
          // 1. cria auditoria (FOREGROUND — precisamos do audit_id no retorno)
          const { data: auditRow, error: aErr } = await supabase
            .from("audits")
            .insert({
              company_id: body.company_id,
              created_by: createdBy,
              name: body.audit_name || `Auditoria ${new Date().toLocaleDateString("pt-BR")}`,
              variant: body.variant || "completo",
              status: "completed",
              meses_count: bsDados.length,
              metadata: { source: "audit-bs-dados", summary, periodos: bsDados.map(r => r.mesKey) },
            })
            .select("id")
            .single();
          if (aErr) throw aErr;
          auditId = auditRow.id as string;

          // 2. balancetes (1 linha por mês) — FOREGROUND (lines FK depende)
          const balancetesIns = balancetes.map((b) => ({
            audit_id: auditId,
            created_by: createdBy,
            mes_referencia: `${periodToMesKey(b.mes)}-01`,
            file_name: body.file_name || "balancete",
            total_linhas: (b.linhas || []).length,
            content_hash: body.content_hash || null,
            pipeline_document_id: body.document_id || null,
          }));
          let balIdByMes = new Map<string, string>();
          if (balancetesIns.length > 0) {
            const { data: insertedBals, error: bErr } = await supabase
              .from("balancetes")
              .insert(balancetesIns)
              .select("id, mes_referencia");
            if (bErr) throw bErr;
            for (const row of insertedBals || []) {
              balIdByMes.set(String(row.mes_referencia).slice(0, 7), row.id as string);
            }

            // 2b. balancete_lines → BACKGROUND (payload grande, não usado no retorno)
            const linesIns: any[] = [];
            for (const b of balancetes) {
              const mesKey = periodToMesKey(b.mes);
              const balId = balIdByMes.get(mesKey);
              if (!balId) continue;
              for (const l of (b.linhas || [])) {
                if (!l || (!l.conta && !l.descricao)) continue;
                const saldo = Number(l.saldo) || 0;
                if (!Number.isFinite(saldo)) continue;
                linesIns.push({
                  balancete_id: balId,
                  conta: String(l.conta || "").trim() || "—",
                  descricao: l.descricao ? String(l.descricao).slice(0, 500) : null,
                  ref1: l.ref1 ?? inferRefByCode(l.conta, l.descricao) ?? null,
                  saldo,
                });
              }
            }
            const chunks: any[][] = [];
            for (let i = 0; i < linesIns.length; i += 500) {
              chunks.push(linesIns.slice(i, i + 500));
            }
            const CONCURRENCY = 6;
            runBackground("balancete_lines", (async () => {
              for (let i = 0; i < chunks.length; i += CONCURRENCY) {
                const wave = chunks.slice(i, i + CONCURRENCY);
                const results = await Promise.all(
                  wave.map(chunk => supabase.from("balancete_lines").insert(chunk)),
                );
                for (const r of results) {
                  if (r.error) console.warn("balancete_lines insert warn:", r.error.message);
                }
              }
            })());
          }

          // 3-4. snapshots consolidados — FOREGROUND em paralelo (independentes).
          const bsRows = bsDados.map((r) => ({
            audit_id: auditId,
            mes: `${r.mesKey}-01`,
            receita_liquida: r.receita_liquida,
            cmv: r.cmv,
            despesas: r.despesas,
            despesas_financeiras: r.despesas_financeiras,
            receitas_financeiras: r.receitas_financeiras,
            outras_nao_operacionais: r.outras_nao_operacionais,
            depreciacao: r.depreciacao,
            amortizacao: r.amortizacao,
            resultado: r.resultado,
            ativo_circulante: r.ativo_circulante,
            ativo_nao_circulante: r.ativo_nao_circulante,
            passivo_circulante: r.passivo_circulante,
            passivo_nao_circulante: r.passivo_nao_circulante,
            patrimonio_liquido: r.patrimonio_liquido,
            patrimonio_liquido_bruto: r.patrimonio_liquido_bruto ?? null,
            ativo_total: r.ativo_total,
            passivo_total: r.passivo_total,
            estoques: r.estoques,
            estoques_bruto: r.estoques_bruto ?? null,
            disponivel: r.disponivel,
            contas_receber: r.contas_receber,
            imobilizado: r.imobilizado,
            realizavel_longo_prazo: r.realizavel_longo_prazo,
            investimentos: r.investimentos,
            intangivel: r.intangivel,
            divida_tributaria: r.divida_tributaria,
            divida_trabalhista: r.divida_trabalhista,
            divida_financeira: r.divida_financeira,
            fornecedores: r.fornecedores,
            credores_rj: r.credores_rj,
            outras_obrigacoes: r.outras_obrigacoes,
            divida_total: r.divida_total,
            divida_total_bruto: r.divida_total_bruto ?? null,
            errors: r.errors,
            ytd_flags: r.ytd_flags ?? null,
            validation_status: r.validation_status ?? "ok",
            validation_diagnostics: r.validation_diagnostics ?? null,
            confidence_by_group: r.confidence_by_group ?? null,
          }));
          const indRows = indicadores.map((i, idx) => ({
            audit_id: auditId,
            mes: `${bsDados[idx].mesKey}-01`,
            cmv_percent: i.cmvPercent,
            despesa_percent: i.despesaPercent,
            cmv_despesa_percent: i.cmvDespesaPercent,
            resultado_percent: i.resultadoPercent,
            liquidez_corrente: i.liquidezCorrente,
            liquidez_seca: i.liquidezSeca,
            liquidez_imediata: i.liquidezImediata,
          }));
          const kanitzRows = kanitz.map(k => ({
            audit_id: auditId,
            mes: `${k.mesKey}-01`,
            ativo_total: k.ativo_total,
            passivo_total: k.passivo_total,
            patrimonio_liquido: k.patrimonio_liquido,
            x1: k.x1, x2: k.x2, x3: k.x3, x4: k.x4, x5: k.x5,
            score: k.score, rating: k.rating, insight: k.insight,
            isg: k.isg, isg_rating: k.isg_rating,
            modelo_preferencial: k.modelo_preferencial,
          }));

          const parallelOps: Promise<unknown>[] = [];
          if (bsRows.length > 0)
            parallelOps.push(supabase.from("bs_dados").upsert(bsRows, { onConflict: "audit_id,mes" }));
          if (indRows.length > 0)
            parallelOps.push(supabase.from("indicadores").insert(indRows));
          if (kanitzRows.length > 0)
            parallelOps.push(supabase.from("kanitz_scores").insert(kanitzRows));
          parallelOps.push(supabase.from("insights").insert({
            audit_id: auditId,
            diagnostico: insightsObj.diagnostico,
            problemas: insightsObj.problemas,
            riscos: insightsObj.riscos,
            recomendacoes: insightsObj.recomendacoes,
            positivos: insightsObj.positivos,
            tendencia: insightsObj.tendencia,
            generated_by: "deterministic-bs-dados-v2",
          }));
          const parallelResults = await Promise.all(parallelOps);
          for (const r of parallelResults) {
            const err = (r as any)?.error;
            if (err) console.warn("[parallel persist]", err.message);
          }

          // 5. audit_log → BACKGROUND
          runBackground("audit_logs",
            supabase.from("audit_logs").insert({
              audit_id: auditId,
              etapa: "bs_dados.persist",
              status: "ok",
              payload: { meses: bsDados.length, errors: summary.errors, kanitz: kanitzRows.length },
            }),
          );

          persisted = true;
        }
      } catch (mdErr) {
        console.warn("MD MASTER persist warn:", (mdErr as Error)?.message);

      }
    }

    // Sustenta os inserts diferidos após o response retornar.
    if (backgroundTasks.length > 0) {
      try {
        // @ts-ignore — EdgeRuntime é injetado pelo Supabase Edge Runtime
        (globalThis as any).EdgeRuntime?.waitUntil?.(Promise.all(backgroundTasks));
      } catch { /* sem suporte ao waitUntil — ignora */ }
    }

    return new Response(JSON.stringify({ bsDados, indicadores, kanitz, insights: insightsObj, summary, persisted, audit_id: auditId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
