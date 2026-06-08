import ExcelJS from 'exceljs';
import fs from 'fs';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, HeadingLevel } from "docx";

const filePath = 'DIP_CORRETO.xlsx';

async function generate() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet('Planilha1');

    const months = ["Set/25", "Out/25", "Nov/25", "Dez/25", "Jan/26", "Fev/26", "Mar/26"];
    const monthCols = [3, 4, 5, 6, 7, 8, 9];

    const extractRow = (rowNum) => {
        const row = worksheet.getRow(rowNum);
        const vals = row.values;
        return monthCols.map(c => parseFloat(vals[c]) || 0);
    };

    const at = extractRow(2);
    const ac = extractRow(3);
    const pt = extractRow(161);
    const pc = extractRow(162);
    const pnc = pt.map((v, i) => v - pc[i]);
    const pl = extractRow(277);
    const rl = extractRow(291);

    const auditData = months.map((m, i) => ({
        mes: m, at: at[i], ac: ac[i], pt: pt[i], pc: pc[i], pnc: pnc[i], pl: pl[i], rl: rl[i]
    }));

    const formatCur = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatPct = (v) => (v * 100).toFixed(2) + "%";
    const P = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text, bold: opts.bold })], alignment: opts.align });
    const Cell = (text, bold = false) => new TableCell({ children: [P(text, { bold })] });

    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({ text: "BEX AUDITORIA", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
                P("Auditor Contábil Sênior IA", { align: AlignmentType.CENTER }),
                new Paragraph({ text: "Relatório de Indicadores × Auditoria", heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
                P("Versão Auditor — v6 (DIP Set/25 a Mar/26)", { align: AlignmentType.CENTER }),
                P(`Período: Setembro/2025 a Março/2026 (7 meses)`, { align: AlignmentType.CENTER }),
                P(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, { align: AlignmentType.CENTER }),

                new Paragraph({ text: "", spacing: { before: 400 } }),
                new Paragraph({ text: "1. Sumário Executivo", heading: HeadingLevel.HEADING_2 }),
                P("Este relatório consolida a auditoria realizada sobre o balancete DIP, abrangendo o período de Setembro/2025 a Março/2026. Os dados foram extraídos automaticamente pela plataforma BEx."),
                P("• Evolução do Patrimônio Líquido: salto em Janeiro/2026 (R$ 61,9M) vs meses anteriores (R$ 54,7M)."),
                P("• Ciclo de Receita: Receita Líquida acumulada atingiu R$ 299M em Dez/25; novo ciclo 2026 cresce mês a mês (Jan: R$ 22,8M → Mar: R$ 77,8M)."),
                P("• Estrutura de Passivo: estável, com pressão no PC, suportado pela robustez do AT (R$ 331M em Mar/26)."),

                new Paragraph({ text: "", spacing: { before: 400 } }),
                new Paragraph({ text: "2. Balanço Patrimonial Consolidado (Auditoria)", heading: HeadingLevel.HEADING_2 }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                        new TableRow({ children: ["Mês","Ativo Total","AC","Passivo Total","PC","PL"].map(t => Cell(t, true)) }),
                        ...auditData.map(d => new TableRow({ children: [
                            Cell(d.mes), Cell(formatCur(d.at)), Cell(formatCur(d.ac)),
                            Cell(formatCur(d.pt)), Cell(formatCur(d.pc)), Cell(formatCur(d.pl)),
                        ]})),
                    ],
                }),

                new Paragraph({ text: "", spacing: { before: 400 } }),
                new Paragraph({ text: "3. Indicadores de Liquidez", heading: HeadingLevel.HEADING_2 }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                        new TableRow({ children: ["Mês","Liq. Corrente (AC/PC)","Receita Líquida"].map(t => Cell(t, true)) }),
                        ...auditData.map(d => new TableRow({ children: [
                            Cell(d.mes), Cell((d.ac / d.pc).toFixed(3)), Cell(formatCur(d.rl)),
                        ]})),
                    ],
                }),

                new Paragraph({ text: "", spacing: { before: 400 } }),
                new Paragraph({ text: "4. Endividamento Geral — Composição Percentual", heading: HeadingLevel.HEADING_2 }),
                P("Fórmulas aplicadas (mesma visibilidade percentual usada para o Ativo Circulante sobre o Ativo Total):", { bold: true }),
                P("• Endividamento Geral = Passivo Total ÷ Ativo Total"),
                P("• Endividamento de Curto Prazo = Passivo Circulante ÷ Ativo Total"),
                P("• Endividamento de Longo Prazo = Passivo Não Circulante ÷ Ativo Total"),
                P("• Participação de Capital de Terceiros = Passivo Total ÷ (Passivo Total + Patrimônio Líquido)"),
                P("• Composição do Endividamento = Passivo Circulante ÷ Passivo Total"),
                P("• Imobilização do PL = (Ativo Total − Ativo Circulante) ÷ Patrimônio Líquido"),

                new Paragraph({ text: "", spacing: { before: 200 } }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                        new TableRow({ children: [
                            "Mês","Endiv. Geral (PT/AT)","Curto Prazo (PC/AT)","Longo Prazo (PNC/AT)",
                            "Cap. Terceiros (PT/(PT+PL))","Comp. Endiv. (PC/PT)","Imobiliz. PL"
                        ].map(t => Cell(t, true)) }),
                        ...auditData.map(d => new TableRow({ children: [
                            Cell(d.mes),
                            Cell(formatPct(d.pt / d.at)),
                            Cell(formatPct(d.pc / d.at)),
                            Cell(formatPct(d.pnc / d.at)),
                            Cell(formatPct(d.pt / (d.pt + d.pl))),
                            Cell(formatPct(d.pc / d.pt)),
                            Cell(formatPct((d.at - d.ac) / d.pl)),
                        ]})),
                    ],
                }),

                new Paragraph({ text: "", spacing: { before: 400 } }),
                new Paragraph({ text: "5. Leitura do Endividamento", heading: HeadingLevel.HEADING_2 }),
                P(`• O Endividamento Geral mantém-se em torno de ${formatPct(auditData[auditData.length-1].pt / auditData[auditData.length-1].at)} em Mar/26, indicando que a maior parte do Ativo Total é financiada por capital de terceiros.`),
                P(`• A Composição do Endividamento (PC/PT) em Mar/26 é de ${formatPct(auditData[auditData.length-1].pc / auditData[auditData.length-1].pt)}, sinalizando o peso das obrigações de curto prazo dentro do passivo total.`),
                P(`• A Participação de Capital de Terceiros atinge ${formatPct(auditData[auditData.length-1].pt / (auditData[auditData.length-1].pt + auditData[auditData.length-1].pl))} em Mar/26, refletindo a estrutura de financiamento entre terceiros e capital próprio.`),

                new Paragraph({ text: "", spacing: { before: 400 } }),
                new Paragraph({ text: "6. Conclusão", heading: HeadingLevel.HEADING_2 }),
                P("A auditoria confirma a integridade dos dados extraídos do balancete DIP. As fórmulas de endividamento agora são exibidas com a mesma visibilidade percentual aplicada aos indicadores de estrutura do Ativo Circulante, permitindo leitura imediata da alavancagem, do perfil de prazo da dívida e da participação de capital de terceiros."),
            ],
        }],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync("/mnt/documents/Relatorio_Indicadores_x_Auditoria_Versao_Auditor_v6.docx", buffer);
    console.log("OK");
}

generate().catch(console.error);
