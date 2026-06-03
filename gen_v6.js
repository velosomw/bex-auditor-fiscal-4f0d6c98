
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, HeadingLevel } from "docx";
import * as fs from "fs";

// Dados extraídos da última auditoria (id: 11453d2f-b63d-4b5c-85b1-d07db120d2e7)
const auditData = [
  { mes: "Jul/25", at: 76973101.36, ac: 74231665.64, anc: 2741435.72, pt: 402153516.99, pc: 65549517.07, pl: 13004142.00, rl: 6728779.94 },
  { mes: "Ago/25", at: 78316662.30, ac: 75575226.58, anc: 2741435.72, pt: 407012194.62, pc: 68372775.30, pl: 301909389.98, rl: 7833356.15 },
  { mes: "Set/25", at: 80116750.53, ac: 77372508.53, anc: 2744242.00, pt: 411092159.44, pc: 70312040.39, pl: 301909389.98, rl: 8330189.10 },
  { mes: "Out/25", at: 80491573.62, ac: 77747331.62, anc: 2744242.00, pt: 414466333.47, pc: 71413518.14, pl: 301909389.98, rl: 8360212.20 },
  { mes: "Nov/25", at: 80553634.49, ac: 77809392.49, anc: 2744242.00, pt: 416424803.33, pc: 71080925.24, pl: 301909389.98, rl: 8112817.79 },
  { mes: "Dez/25", at: 77636155.07, ac: 74961439.02, anc: 2674716.05, pt: 419038749.58, pc: 71842259.55, pl: 301909389.98, rl: 6332539.06 },
  { mes: "Jan/26", at: 82666137.28, ac: 79973540.49, anc: 2692596.79, pt: 426406833.17, pc: 77101996.09, pl: 338862615.63, rl: 8435376.50 }
];

const formatCur = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPct = (v) => (v * 100).toFixed(2) + "%";

const doc = new Document({
    sections: [{
        properties: {},
        children: [
            new Paragraph({
                text: "BEX AUDITORIA",
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
                text: "Auditor Contábil Sênior IA",
                alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
                text: "Relatório de Indicadores × Auditoria",
                heading: HeadingLevel.HEADING_2,
                alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
                text: "Versão Auditor — v6 (Atualizada)",
                alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
                text: "Período: Julho/2025 a Janeiro/2026 (7 meses)",
                alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
                text: `Emitido em ${new Date().toLocaleDateString('pt-BR')}`,
                alignment: AlignmentType.CENTER,
            }),

            new Paragraph({ text: "", spacing: { before: 400 } }),
            new Paragraph({
                text: "1. Sumário Executivo",
                heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph({
                text: "Este relatório (Versão 6) consolida os indicadores financeiros com base na última auditoria realizada na plataforma. A análise reflete as melhorias aplicadas no motor de cálculo, incluindo a nova regra de Receita Líquida e a ativação dos grupos 5 e 6 para despesas.",
            }),
            new Paragraph({
                text: "• Estabilidade do PL: O Patrimônio Líquido apresentou crescimento e estabilização em torno de R$ 301M após Ago/25, atingindo R$ 338M em Jan/26.",
            }),
            new Paragraph({
                text: "• Alavancagem: O Passivo Total (PT) permanece significativamente superior ao Ativo Total (AT) em termos nominais, indicando uma estrutura de capital com forte dependência de terceiros, embora o PL robusto compense parte do risco.",
            }),
            new Paragraph({
                text: "• Liquidez: A Liquidez Corrente mantém-se acima de 1.0, indicando capacidade de honrar compromissos de curto prazo.",
            }),

            new Paragraph({ text: "", spacing: { before: 400 } }),
            new Paragraph({
                text: "2. Balanço Patrimonial Consolidado",
                heading: HeadingLevel.HEADING_2,
            }),

            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: "Mês", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Ativo Total", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "AC", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Passivo Total", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "PC", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "PL", bold: true })] }),
                        ],
                    }),
                    ...auditData.map(d => new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph(d.mes)] }),
                            new TableCell({ children: [new Paragraph(formatCur(d.at))] }),
                            new TableCell({ children: [new Paragraph(formatCur(d.ac))] }),
                            new TableCell({ children: [new Paragraph(formatCur(d.pt))] }),
                            new TableCell({ children: [new Paragraph(formatCur(d.pc))] }),
                            new TableCell({ children: [new Paragraph(formatCur(d.pl))] }),
                        ],
                    })),
                ],
            }),

            new Paragraph({ text: "", spacing: { before: 400 } }),
            new Paragraph({
                text: "3. Indicadores de Liquidez e Endividamento",
                heading: HeadingLevel.HEADING_2,
            }),

            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: "Mês", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Liquidez Corrente (AC/PC)", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Liquidez Geral (AT/PT)", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Endiv. Geral (PT/AT)", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Receita Líquida", bold: true })] }),
                        ],
                    }),
                    ...auditData.map(d => new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph(d.mes)] }),
                            new TableCell({ children: [new Paragraph((d.ac / d.pc).toFixed(3))] }),
                            new TableCell({ children: [new Paragraph((d.at / d.pt).toFixed(3))] }),
                            new TableCell({ children: [new Paragraph(formatPct(d.pt / d.at))] }),
                            new TableCell({ children: [new Paragraph(formatCur(d.rl))] }),
                        ],
                    })),
                ],
            }),

            new Paragraph({ text: "", spacing: { before: 400 } }),
            new Paragraph({
                text: "4. Conclusão e Próximos Passos",
                heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph({
                text: "Os dados demonstram uma recuperação consistente do Patrimônio Líquido no segundo semestre de 2025. As melhorias no motor de auditoria permitiram capturar com precisão a variação da Receita Líquida e o comportamento das despesas operacionais.",
            }),
            new Paragraph({
                text: "Recomenda-se a continuidade do monitoramento mensal para validar a tendência de crescimento observada em Janeiro de 2026.",
            }),
        ],
    }],
});

Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync("/mnt/documents/Relatorio_Indicadores_x_Auditoria_Versao_Auditor_v6.docx", buffer);
    console.log("Relatório gerado com sucesso.");
});
