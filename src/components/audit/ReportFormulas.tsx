import React from "react";
import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import logoBrasilExpertFull from "@/assets/marca_logo_BEx.jpeg";

interface CertifiedFact {
  fact_id: string;
  canonical_role: string;
  value: number;
  status: string;
  authority: string;
  source_account_code: string;
  source_account_description: string;
  source_hierarchy_level: number;
  competency: string;
}

interface FormulaReportProps {
  companyName: string;
  cnpj?: string;
  runtimeTraceId?: string;
  onExportPdf: () => void;
}

const ReportPage = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`report-a4-page bg-white relative overflow-hidden flex flex-col ${className}`} style={{ width: "210mm", height: "297mm", minHeight: "297mm", padding: "12mm 16mm", margin: "0 auto", boxSizing: "border-box", color: "#1C2541", boxShadow: "0 0 15px rgba(0,0,0,0.1)" }}>
    <div className="flex justify-between items-start mb-6 shrink-0">
      <div className="flex flex-col">
        <h3 className="text-[14pt] font-extrabold text-[#1E3A8A] leading-tight">RELATÓRIO TÉCNICO DE FÓRMULAS</h3>
        <p className="text-[8pt] text-muted-foreground font-semibold tracking-wider uppercase mt-1">Audit Engine v1.1 • Canonical Financial Binding</p>
      </div>
      <img src={logoBrasilExpertFull} alt="BEx" className="h-10 object-contain" />
    </div>
    <div className="flex-1 relative z-10">{children}</div>
    <div className="mt-auto pt-4 border-t border-slate-200 flex justify-between items-end text-[7.5pt] text-muted-foreground font-mono shrink-0">
      <div className="flex flex-col gap-0.5">
        <p>© 2026 BRASIL EXPERT • Business Extended Analysis</p>
        <p className="text-[6.5pt] opacity-70">MD-BEX-CANONICAL-CORE-FREEZE-ACTIVE</p>
      </div>
      <div className="text-right flex flex-col gap-0.5">
        <p>Documento Assinado Digitalmente por Técnico Contábil Sênior IA</p>
        <p className="text-[6.5pt] opacity-70">ID: {Math.random().toString(36).substring(7).toUpperCase()}</p>
      </div>
    </div>
  </div>
);

const SectionTitle = ({ num, title }: { num: string; title: string }) => (
  <div className="flex items-center gap-3 py-2 border-b-2 border-[#8B5CF6]/30 mb-4 mt-6">
    <div className="w-7 h-7 rounded-lg bg-[#8B5CF6] text-white flex items-center justify-center text-xs font-bold">{num}</div>
    <h2 className="text-md font-bold text-foreground font-serif uppercase tracking-tight">{title}</h2>
  </div>
);

const FormulaItem = ({ label, formula, desc }: { label: string; formula: string; desc: string }) => (
  <div className="mb-4 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
    <p className="text-[10pt] font-bold text-slate-800 mb-1">{label}</p>
    <div className="font-mono text-[9pt] bg-slate-800 text-slate-100 p-2 rounded mb-2 overflow-x-auto">
      {formula}
    </div>
    <p className="text-[8.5pt] text-slate-600 leading-relaxed italic">{desc}</p>
  </div>
);

export const ReportFormulas = ({ companyName, cnpj, runtimeTraceId, onExportPdf }: FormulaReportProps) => {
  return (
    <div id="report-formulas-container" className="report-pages-container bg-slate-100/50 p-8 min-h-screen">
      <div className="max-w-[210mm] mx-auto mb-6 flex justify-between items-center print:hidden">
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Versão Certificada 1.1</Badge>
          <span className="text-xs text-muted-foreground font-mono">Trace: {runtimeTraceId || "N/A"}</span>
        </div>
        <Button onClick={onExportPdf} className="bg-[#8B5CF6] hover:bg-[#7C3AED] gap-2">
          <Download className="w-4 h-4" /> Exportar PDF Técnico
        </Button>
      </div>

      <ReportPage>
        <div className="text-center mb-10 pt-10">
          <div className="w-20 h-20 bg-[#8B5CF6]/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <FileText className="w-10 h-10 text-[#8B5CF6]" />
          </div>
          <h1 className="text-[24pt] font-extrabold text-slate-900 leading-tight mb-2">ESPECIFICAÇÃO TÉCNICA<br/>DE CÁLCULO E FORMULÁRIO</h1>
          <p className="text-[12pt] text-slate-600 font-medium">Motor Contábil Certified Financial Snapshot (Audit Engine)</p>
          
          <div className="mt-12 p-6 border-y border-slate-200 bg-slate-50 inline-block w-full max-w-[140mm]">
            <div className="grid grid-cols-2 gap-y-4 text-left text-[9pt]">
              <p className="text-slate-500 font-bold uppercase">Empresa:</p>
              <p className="text-slate-900 font-bold">{companyName}</p>
              <p className="text-slate-500 font-bold uppercase">CNPJ:</p>
              <p className="text-slate-900">{cnpj || "Não informado"}</p>
              <p className="text-slate-500 font-bold uppercase">Emissão:</p>
              <p className="text-slate-900">{new Date().toLocaleDateString("pt-BR")}</p>
              <p className="text-slate-500 font-bold uppercase">Motor:</p>
              <p className="text-slate-900 font-mono">P1 Synthetic Authority Resolver v1.1</p>
            </div>
          </div>
        </div>

        <SectionTitle num="1" title="Modelo de Insolvência de Kanitz" />
        <p className="text-[9pt] text-slate-600 mb-4 leading-relaxed">
          O Fator de Insolvência (FI) é a métrica central de solvabilidade estatística baseada na fórmula de Stephen Kanitz.
        </p>
        <FormulaItem 
          label="Fórmula Master (Fator Kanitz)"
          formula="K = (0,05 * RL) + (1,65 * LG) + (3,55 * LS) - (1,06 * LC) - (0,33 * GE)"
          desc="Onde: RL = Rentabilidade do PL; LG = Liquidez Geral; LS = Liquidez Seca; LC = Liquidez Corrente; GE = Grau de Endividamento."
        />
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[8pt] font-bold text-slate-500 uppercase mb-2">Regra PL Negativo</p>
            <div className="p-3 border rounded text-[8pt] bg-red-50 text-red-700 leading-tight">
              Se PL ≤ 0, K = N/A. O modelo é substituído pelo ISG (Índice de Solvência Geral) para evitar falsos positivos por inversão matemática.
            </div>
          </div>
          <div>
            <p className="text-[8pt] font-bold text-slate-500 uppercase mb-2">Referência ISG</p>
            <div className="p-3 border rounded text-[8pt] bg-blue-50 text-blue-700 leading-tight">
              ISG = Ativo Total / (Passivo Circulante + Passivo Não Circulante).<br/>
              &gt; 1,5: Solvente | 1,0 - 1,5: Atenção | &lt; 1,0: Insolvente.
            </div>
          </div>
        </div>
      </ReportPage>

      <ReportPage>
        <SectionTitle num="2" title="Indicadores de Liquidez e Estrutura" />
        <div className="grid grid-cols-2 gap-x-6">
          <div>
            <FormulaItem 
              label="Liquidez Corrente"
              formula="AC / PC"
              desc="Capacidade de pagamento no curto prazo."
            />
            <FormulaItem 
              label="Liquidez Seca"
              formula="(AC - Estoques) / PC"
              desc="Liquidez sem dependência de estoques."
            />
          </div>
          <div>
            <FormulaItem 
              label="Endividamento Total"
              formula="(PC + PNC) / Ativo Total"
              desc="Proporção de capital de terceiros no ativo."
            />
            <FormulaItem 
              label="Imobilização do PL"
              formula="Ativo Imobilizado / PL"
              desc="Recursos do PL retidos em ativos permanentes."
            />
          </div>
        </div>

        <SectionTitle num="3" title="Rentabilidade e Fluxo de Caixa (EBITDA)" />
        <FormulaItem 
          label="LAJIR (EBIT) Certified"
          formula="Resultado Líquido + Desp. Fin. - Rec. Fin. + Tributos sobre Lucro"
          desc="Calculado via reconstrução residual a partir do balancete consolidado (SSOT)."
        />
        <FormulaItem 
          label="EBITDA (LAJIDA)"
          formula="LAJIR + Depreciação + Amortização"
          desc="Certificado apenas quando LAJIR e D&A são identificáveis no balancete."
        />
        <FormulaItem 
          label="Cobertura de Juros"
          formula="LAJIR / |Despesas Financeiras|"
          desc="Avalia a capacidade da operação de honrar o serviço da dívida."
        />

        <SectionTitle num="4" title="Integridade: P1 Synthetic Authority" />
        <div className="p-4 rounded-lg bg-blue-900/5 border border-blue-900/20 text-[8.5pt] leading-relaxed text-slate-700">
          <p className="font-bold mb-2">Protocolo de Resolução de Fatos:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>P1 (Sintética):</strong> O total do grupo (ex: 1.1) extraído do balancete é a autoridade absoluta.</li>
            <li><strong>Desvio Residual:</strong> Divergências entre soma de filhos e o pai P1 são tratadas como resíduos de processamento, preservando o valor do pai.</li>
            <li><strong>Hard Gate:</strong> Validação obrigatória da equação Ativo = Passivo + PL em cada competência.</li>
          </ul>
        </div>
      </ReportPage>
    </div>
  );
};
