import ExcelJS from 'exceljs';
import fs from 'fs';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, HeadingLevel, PageBreak } from "docx";

const filePath = 'DIP_CORRETO.xlsx';

async function generate() {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('Planilha1');

    const months = ["Setembro/2025", "Outubro/2025", "Novembro/2025", "Dezembro/2025", "Janeiro/2026", "Fevereiro/2026", "Março/2026"];
    const monthCols = [3, 4, 5, 6, 7, 8, 9];

    const extract = (rowNum) => {
        const vals = ws.getRow(rowNum).values;
        return monthCols.map(c => parseFloat(vals[c]) || 0);
    };

    // Totais
    const AT = extract(2), AC = extract(3), ANC = extract(115);
    const PT = extract(161), PC = extract(162), PNC = extract(266), PL = extract(277);
    const RL = extract(291);

    // Composição AC
    const acDisp = extract(4), acConv = extract(16), acEst = extract(63), acMerc = extract(92), acDesp = extract(102);
    // Composição ANC
    const ancReal = extract(116), ancInv = extract(129), ancImob = extract(133);
    // Composição PC (endividamento)
    const pcContas = extract(163), pcEmp = extract(170), pcTrab = extract(181), pcTrib = extract(201), pcMerc = extract(221), pcOutras = extract(234), pcProv = extract(258);
    // Composição PNC
    const pncContas = extract(267), pncCred = extract(270), pncTrib = extract(273);
    // PL
    const plCap = extract(278), plRes = extract(281), plLuc = extract(286);

    const fmtC = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtP = (v) => isFinite(v) ? (v * 100).toFixed(2) + "%" : "-";
    const P = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text, bold: opts.bold, size: opts.size })], alignment: opts.align, spacing: opts.spacing });
    const C = (text, bold = false) => new TableCell({ children: [P(text, { bold, size: 18 })] });

    const buildMonthSection = (i) => {
        const m = months[i];
        const composicaoAC = [
            ["Disponível", acDisp[i]],
            ["Valores Conversíveis CP", acConv[i]],
            ["Estoques", acEst[i]],
            ["Mercadorias a Receber", acMerc[i]],
            ["Despesas Exerc. Seguinte", acDesp[i]],
        ];
        const composicaoANC = [
            ["Realizável a Longo Prazo", ancReal[i]],
            ["Investimentos", ancInv[i]],
            ["Imobilizado", ancImob[i]],
        ];
        const endividamentoPC = [
            ["Contas a Pagar", pcContas[i]],
            ["Empréstimos e Financiamentos", pcEmp[i]],
            ["Obrigações Sociais/Trabalhistas", pcTrab[i]],
            ["Obrigações Tributárias/Fiscais", pcTrib[i]],
            ["Mercadorias a Entregar", pcMerc[i]],
            ["Outras Obrigações a Pagar", pcOutras[i]],
            ["Provisões", pcProv[i]],
        ];
        const endividamentoPNC = [
            ["Contas a Pagar LP", pncContas[i]],
            ["Credores Diversos LP", pncCred[i]],
            ["Obrigações Tributárias LP", pncTrib[i]],
        ];
        const compPL = [
            ["Capital Social", plCap[i]],
            ["Reservas", plRes[i]],
            ["Lucros/Prejuízos Acumulados", plLuc[i]],
        ];

        const rowComp = (label, val, base) => new TableRow({ children: [C(label), C(fmtC(val)), C(fmtP(val / base))] });

        return [
            new Paragraph({ children: [new PageBreak()] }),
            new Paragraph({ text: `Mês: ${m}`, heading: HeadingLevel.HEADING_1 }),

            P("Resumo Patrimonial", { bold: true, spacing: { before: 200 } }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({ children: ["Item", "Valor (R$)", "% do Ativo Total"].map(t => C(t, true)) }),
                    new TableRow({ children: [C("Ativo Total"), C(fmtC(AT[i])), C("100,00%")] }),
                    new TableRow({ children: [C("  Ativo Circulante"), C(fmtC(AC[i])), C(fmtP(AC[i] / AT[i]))] }),
                    new TableRow({ children: [C("  Ativo Não Circulante"), C(fmtC(ANC[i])), C(fmtP(ANC[i] / AT[i]))] }),
                    new TableRow({ children: [C("Passivo Total"), C(fmtC(PT[i])), C(fmtP(PT[i] / AT[i]))] }),
                    new TableRow({ children: [C("  Passivo Circulante"), C(fmtC(PC[i])), C(fmtP(PC[i] / AT[i]))] }),
                    new TableRow({ children: [C("  Passivo Não Circulante"), C(fmtC(PNC[i])), C(fmtP(PNC[i] / AT[i]))] }),
                    new TableRow({ children: [C("Patrimônio Líquido"), C(fmtC(PL[i])), C(fmtP(PL[i] / AT[i]))] }),
                    new TableRow({ children: [C("Receita Líquida (acumulada)"), C(fmtC(RL[i])), C("—")] }),
                ],
            }),

            P("Composição do Ativo Circulante", { bold: true, spacing: { before: 300 } }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({ children: ["Grupo", "Valor (R$)", "% do AC"].map(t => C(t, true)) }),
                    ...composicaoAC.map(([l, v]) => rowComp(l, v, AC[i])),
                ],
            }),

            P("Composição do Ativo Não Circulante", { bold: true, spacing: { before: 300 } }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({ children: ["Grupo", "Valor (R$)", "% do ANC"].map(t => C(t, true)) }),
                    ...composicaoANC.map(([l, v]) => rowComp(l, v, ANC[i])),
                ],
            }),

            P("Endividamento — Passivo Circulante", { bold: true, spacing: { before: 300 } }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({ children: ["Componente", "Valor (R$)", "% do PC", "% do Passivo Total"].map(t => C(t, true)) }),
                    ...endividamentoPC.map(([l, v]) => new TableRow({ children: [C(l), C(fmtC(v)), C(fmtP(v / PC[i])), C(fmtP(v / PT[i]))] })),
                ],
            }),

            P("Endividamento — Passivo Não Circulante", { bold: true, spacing: { before: 300 } }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({ children: ["Componente", "Valor (R$)", "% do PNC", "% do Passivo Total"].map(t => C(t, true)) }),
                    ...endividamentoPNC.map(([l, v]) => new TableRow({ children: [C(l), C(fmtC(v)), C(fmtP(v / PNC[i])), C(fmtP(v / PT[i]))] })),
                ],
            }),

            P("Composição do Patrimônio Líquido", { bold: true, spacing: { before: 300 } }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({ children: ["Conta", "Valor (R$)", "% do PL"].map(t => C(t, true)) }),
                    ...compPL.map(([l, v]) => rowComp(l, v, PL[i])),
                ],
            }),

            P("Indicadores do Mês", { bold: true, spacing: { before: 300 } }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({ children: ["Indicador", "Fórmula", "Valor"].map(t => C(t, true)) }),
                    new TableRow({ children: [C("Liquidez Corrente"), C("AC ÷ PC"), C((AC[i] / PC[i]).toFixed(3))] }),
                    new TableRow({ children: [C("Endividamento Geral"), C("PT ÷ AT"), C(fmtP(PT[i] / AT[i]))] }),
                    new TableRow({ children: [C("Endividamento Curto Prazo"), C("PC ÷ AT"), C(fmtP(PC[i] / AT[i]))] }),
                    new TableRow({ children: [C("Endividamento Longo Prazo"), C("PNC ÷ AT"), C(fmtP(PNC[i] / AT[i]))] }),
                    new TableRow({ children: [C("Composição do Endividamento"), C("PC ÷ PT"), C(fmtP(PC[i] / PT[i]))] }),
                    new TableRow({ children: [C("Capital de Terceiros"), C("PT ÷ (PT + PL)"), C(fmtP(PT[i] / (PT[i] + PL[i])))] }),
                    new TableRow({ children: [C("Imobilização do PL"), C("(AT − AC) ÷ PL"), C(fmtP((AT[i] - AC[i]) / PL[i]))] }),
                ],
            }),
        ];
    };

    const children = [
        new Paragraph({ text: "BEX AUDITORIA", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        P("Auditor Contábil Sênior IA", { align: AlignmentType.CENTER }),
        new Paragraph({ text: "Relatório Detalhado por Mês — Composição, Endividamento e Balanço", heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
        P("Período: Setembro/2025 a Março/2026 (7 meses)", { align: AlignmentType.CENTER }),
        P(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, { align: AlignmentType.CENTER }),

        new Paragraph({ text: "Sumário Comparativo (7 meses)", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({ children: ["Mês", "AT", "PT", "PL", "Endiv.", "Liq.Corrente"].map(t => C(t, true)) }),
                ...months.map((m, i) => new TableRow({ children: [
                    C(m), C(fmtC(AT[i])), C(fmtC(PT[i])), C(fmtC(PL[i])),
                    C(fmtP(PT[i] / AT[i])), C((AC[i] / PC[i]).toFixed(3))
                ]})),
            ],
        }),

        ...months.flatMap((_, i) => buildMonthSection(i)),
    ];

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync("/mnt/documents/Relatorio_Mensal_Detalhado_Composicao_Endividamento.docx", buffer);
    console.log("OK");
}

generate().catch(e => { console.error(e); process.exit(1); });
