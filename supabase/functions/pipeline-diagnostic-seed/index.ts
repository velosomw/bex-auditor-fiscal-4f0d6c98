// Edge function: cria documento sintético + OCR pronto para o diagnóstico do pipeline.
// Usa SERVICE_ROLE para contornar RLS, mas exige Authorization Bearer (qualquer usuário logado).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYNTHETIC_OCR = `BALANÇO PATRIMONIAL — TESTE DIAGNÓSTICO PIPELINE
Empresa: BEx Diagnóstico LTDA
CNPJ: 00.000.000/0001-00
Período: 31/12/2024

ATIVO CIRCULANTE
Caixa e Equivalentes ............... R$ 150.000,00
Contas a Receber ................... R$ 320.000,00
Estoques ........................... R$ 180.000,00
Total Ativo Circulante ............. R$ 650.000,00

ATIVO NÃO CIRCULANTE
Imobilizado ........................ R$ 850.000,00
Total Ativo ........................ R$ 1.500.000,00

PASSIVO + PL
Fornecedores ....................... R$ 280.000,00
Empréstimos ........................ R$ 420.000,00
Patrimônio Líquido ................. R$ 800.000,00
Total Passivo + PL ................. R$ 1.500.000,00`;

const STRUCTURED = {
  empresa: "BEx Diagnóstico LTDA",
  cnpj: "00.000.000/0001-00",
  periodo: "2024-12-31",
  ativo: {
    circulante: { caixa: 150000, contas_receber: 320000, estoques: 180000, total: 650000 },
    nao_circulante: { imobilizado: 850000, total: 850000 },
    total: 1500000,
  },
  passivo: {
    fornecedores: 280000,
    emprestimos: 420000,
    patrimonio_liquido: 800000,
    total: 1500000,
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const stamp = Date.now();

    const { data: doc, error: docErr } = await supabase
      .from("pipeline_documents")
      .insert({
        file_name: `DIAG-${stamp}.txt`,
        file_type: "diagnostic",
        status: "ocr_ready",
        created_by: userRes.user.id,
        progress: "ocr_done",
      })
      .select("id")
      .single();

    if (docErr) {
      return new Response(JSON.stringify({ error: docErr.message, step: "insert_document" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: ocrErr } = await supabase.from("ocr_results").insert({
      document_id: doc.id,
      raw_text: SYNTHETIC_OCR,
      structured_json: STRUCTURED,
      ocr_score: 0.95,
      provider: "diagnostic",
    });

    if (ocrErr) {
      return new Response(JSON.stringify({ error: ocrErr.message, step: "insert_ocr" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ document_id: doc.id, structured: STRUCTURED }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
