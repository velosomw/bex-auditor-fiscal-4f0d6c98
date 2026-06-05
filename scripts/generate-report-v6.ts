import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, HeadingLevel, TableAnchorType, WidthType, BorderStyle } from "docx";
import * as fs from "fs";

async function generateReport() {
    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({
                    text: "BEX AUDITORIA",
                    heading: HeadingLevel.HEADING_1,
                    alignment: AlignmentType.CENTER,
                }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Auditor Contábil Sênior IA",
                            bold: true,
                        }),
                    ],
                    alignment: AlignmentType.CENTER,
                }),
                new Paragraph({
                    text: "Relatório de Indicadores × Auditoria",
                    heading: HeadingLevel.HEADING_2,
                    alignment: AlignmentType.CENTER,
                }),
                new Paragraph({
                    text: "Versão Auditor — v6 (Empresa 1000)",
                    alignment: AlignmentType.CENTER,
                }),
                new Paragraph({
                    text: "Período: Março/2025 e Março/2026",
                    alignment: AlignmentType.CENTER,
                }),
                new Paragraph({
                    text: "Emitido em 05/06/2026",
                    alignment: AlignmentType.CENTER,
                }),

                new Paragraph({ text: "\n1. Sumário Executivo", heading: HeadingLevel.HEADING_1 }),
                new Paragraph({
                    text: "Este relatório consolida a análise da auditoria realizada para a Empresa 1000, baseada no balancete DIP v2. A análise foca na evolução patrimonial entre Março/2025 e Março/2026.",
                }),
                new Paragraph({
                    text: "• Patrimônio Líquido: Situado em R$ 61.992.771,89 (Mar/26), demonstrando uma base de capital estável, apesar do elevado endividamento.",
                }),
                new Paragraph({
                    text: "• Endividamento: O Passivo Total (R$ 330,9 mi) representa 99,69% do Ativo Total, com 73% concentrado no Curto Prazo (Passivo Circulante).",
                }),
                new Paragraph({
                    text: "• Liquidez: O índice de Liquidez Corrente (0,579) indica que o Ativo Circulante não é suficiente para cobrir as obrigações imediatas.",
                }),

                new Paragraph({ text: "\n2. Balanço Patrimonial Consolidado", heading: HeadingLevel.HEADING_1 }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph("Mês")] }),
                                new TableCell({ children: [new Paragraph("Ativo Total")] }),
                                new TableCell({ children: [new Paragraph("AC")] }),
                                new TableCell({ children: [new Paragraph("ANC")] }),
                                new TableCell({ children: [new Paragraph("Passivo Total")] }),
                                new TableCell({ children: [new Paragraph("PC")] }),
                                new TableCell({ children: [new Paragraph("PL")] }),
                            ],
                        }),
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph("Mar/25")] }),
                                new TableCell({ children: [new Paragraph("321.860.373,38")] }),
                                new TableCell({ children: [new Paragraph("138.840.496,65")] }),
                                new TableCell({ children: [new Paragraph("183.019.876,73")] }),
                                new TableCell({ children: [new Paragraph("314.659.565,72")] }),
                                new TableCell({ children: [new Paragraph("236.225.275,68")] }),
                                new TableCell({ children: [new Paragraph("54.791.964,23")] }),
                            ],
                        }),
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph("Mar/26")] }),
                                new TableCell({ children: [new Paragraph("331.984.602,00")] }),
                                new TableCell({ children: [new Paragraph("140.315.806,53")] }),
                                new TableCell({ children: [new Paragraph("191.668.795,47")] }),
                                new TableCell({ children: [new Paragraph("330.943.635,10")] }),
                                new TableCell({ children: [new Paragraph("242.227.927,02")] }),
                                new TableCell({ children: [new Paragraph("61.992.771,89")] }),
                            ],
                        }),
                    ],
                }),

                new Paragraph({ text: "\n3. Indicadores de Liquidez e Endividamento", heading: HeadingLevel.HEADING_1 }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph("Mês")] }),
                                new TableCell({ children: [new Paragraph("Liquidez Corrente")] }),
                                new TableCell({ children: [new Paragraph("Liquidez Geral (AT/PT)")] }),
                                new TableCell({ children: [new Paragraph("Endividamento Geral (PT/AT)")] }),
                                new TableCell({ children: [new Paragraph("Grau Endiv. PL (PT/PL)")] }),
                            ],
                        }),
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph("Mar/25")] }),
                                new TableCell({ children: [new Paragraph("0,588")] }),
                                new TableCell({ children: [new Paragraph("1,023")] }),
                                new TableCell({ children: [new Paragraph("97,76%")] }),
                                new TableCell({ children: [new Paragraph("5,74")] }),
                            ],
                        }),
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph("Mar/26")] }),
                                new TableCell({ children: [new Paragraph("0,579")] }),
                                new TableCell({ children: [new Paragraph("1,003")] }),
                                new TableCell({ children: [new Paragraph("99,69%")] }),
                                new TableCell({ children: [new Paragraph("5,34")] }),
                            ],
                        }),
                    ],
                }),

                new Paragraph({ text: "\n4. Pontos de Atenção e Recomendações", heading: HeadingLevel.HEADING_1 }),
                new Paragraph({
                    text: "• Concentração de Curto Prazo: O passivo circulante cresceu de R$ 236 mi para R$ 242 mi, aumentando a pressão sobre o caixa.",
                }),
                new Paragraph({
                    text: "• Estrutura de Ativos: O Ativo Não Circulante cresceu impulsionado pelo Imobilizado e Investimentos, mas a liquidez imediata continua crítica.",
                }),
                new Paragraph({
                    text: "• Recomendação: Urgente renegociação de dívidas de curto prazo para alongamento do perfil do passivo e melhoria dos índices de liquidez.",
                }),

                new Paragraph({ text: "\n5. Rastreabilidade", heading: HeadingLevel.HEADING_1 }),
                new Paragraph({ text: "Fonte: DIP setembro-25 a março-26 v2.xlsx" }),
                new Paragraph({ text: "Auditoria ID: 7830f916-ba7d-4861-9a32-421f82894f02" }),
                new Paragraph({ text: "Plataforma: BEX Auditoria - Auditor Contábil Sênior IA" }),
            ],
        }],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync("/mnt/documents/Relatorio_Indicadores_x_Auditoria_Versao_Auditor_v6_Empresa1000.docx", buffer);
    console.log("Relatório gerado com sucesso!");
}

generateReport();
