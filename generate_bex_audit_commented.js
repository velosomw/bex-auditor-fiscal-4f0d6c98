import ExcelJS from 'exceljs';
import fs from 'fs';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, HeadingLevel, PageBreak, BorderStyle, ShadingType, LevelFormat } from 'docx';

const data = JSON.parse(fs.readFileSync('/tmp/audit_data.json','utf8'));
const comments = JSON.parse(fs.readFileSync('/tmp/audit_comments.json','utf8'));
const execSummary = fs.readFileSync('/tmp/audit_exec_summary.txt','utf8').trim();

const fmtC = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtP = (v) => isFinite(v) ? (v*100).toFixed(2)+'%' : '-';

const border = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
const cellBorders = { top: border, bottom: border, left: border, right: border };
const P = (text, opts={}) => new Paragraph({
  children: [new TextRun({ text, bold: opts.bold, size: opts.size || 22, color: opts.color })],
  alignment: opts.align, spacing: opts.spacing, heading: opts.heading,
});
const C = (text, opts={}) => new TableCell({
  borders: cellBorders,
  width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
  shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
  margins: { top: 60, bottom: 60, left: 100, right: 100 },
  children: [new Paragraph({
    alignment: opts.align,
    children: [new TextRun({ text: String(text), bold: opts.bold, size: opts.size || 18, color: opts.color })]
  })],
});
const HDR = (text) => C(text, { bold: true, fill: '1E3A8A', color: 'FFFFFF', align: AlignmentType.CENTER });
const SUB = (text) => P(text, { bold: true, size: 24, color: '1E3A8A', spacing: { before: 280, after: 120 } });

// Parecer IA em parágrafos
const parecerParas = (txt) => txt.split(/\n+/).filter(Boolean).map(p =>
  new Paragraph({
    children: [new TextRun({ text: p.trim(), size: 21 })],
    spacing: { after: 120, line: 300 },
    alignment: AlignmentType.JUSTIFIED,
  })
);

const buildMonth = (m) => {
  const cap = (label, v, base, label2 = '% do AT') =>
    new TableRow({ children: [C(label), C(fmtC(v), { align: AlignmentType.RIGHT }), C(fmtP(v/base), { align: AlignmentType.RIGHT })] });

  const tbl = (header, rows) => new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: header.length === 3 ? [4360,2500,2500] : [3360,2000,2000,2000],
    rows: [
      new TableRow({ tableHeader: true, children: header.map(HDR) }),
      ...rows,
    ],
  });

  const parecer = comments.find(c => c.mes === m.mes)?.parecer || '(parecer indisponível)';

  return [
    new Paragraph({ children: [new PageBreak()] }),
    P(`Mês de Referência: ${m.mes}`, { heading: HeadingLevel.HEADING_1, color: '1E3A8A', bold: true, spacing: { after: 200 } }),

    SUB('1. Resumo Patrimonial'),
    tbl(['Item','Valor (R$)','% do Ativo Total'], [
      new TableRow({ children: [C('Ativo Total', { bold: true }), C(fmtC(m.AT), { align: AlignmentType.RIGHT, bold: true }), C('100,00%', { align: AlignmentType.RIGHT, bold: true })] }),
      cap('   Ativo Circulante', m.AC, m.AT),
      cap('   Ativo Não Circulante', m.ANC, m.AT),
      cap('Passivo Total', m.PT, m.AT),
      cap('   Passivo Circulante', m.PC, m.AT),
      cap('   Passivo Não Circulante', m.PNC, m.AT),
      cap('Patrimônio Líquido', m.PL, m.AT),
      new TableRow({ children: [C('Receita Líquida (acumulada)'), C(fmtC(m.RL), { align: AlignmentType.RIGHT }), C('—', { align: AlignmentType.RIGHT })] }),
    ]),

    SUB('2. Composição do Ativo Circulante'),
    tbl(['Grupo','Valor (R$)','% do AC'], [
      cap('Disponível', m.ac.disp, m.AC),
      cap('Valores Conversíveis CP', m.ac.conv, m.AC),
      cap('Estoques', m.ac.est, m.AC),
      cap('Mercadorias a Receber', m.ac.merc, m.AC),
      cap('Despesas Exerc. Seguinte', m.ac.desp, m.AC),
    ]),

    SUB('3. Composição do Ativo Não Circulante'),
    tbl(['Grupo','Valor (R$)','% do ANC'], [
      cap('Realizável a Longo Prazo', m.anc.real, m.ANC),
      cap('Investimentos', m.anc.inv, m.ANC),
      cap('Imobilizado', m.anc.imob, m.ANC),
    ]),

    SUB('4. Endividamento — Passivo Circulante'),
    tbl(['Componente','Valor (R$)','% do PC','% do PT'], [
      ['Contas a Pagar', m.pc.contas],
      ['Empréstimos e Financiamentos', m.pc.emp],
      ['Obrigações Sociais/Trabalhistas', m.pc.trab],
      ['Obrigações Tributárias/Fiscais', m.pc.trib],
      ['Mercadorias a Entregar', m.pc.merc],
      ['Outras Obrigações a Pagar', m.pc.outras],
      ['Provisões', m.pc.prov],
    ].map(([l,v]) => new TableRow({ children: [C(l), C(fmtC(v), { align: AlignmentType.RIGHT }), C(fmtP(v/m.PC), { align: AlignmentType.RIGHT }), C(fmtP(v/m.PT), { align: AlignmentType.RIGHT })] }))),

    SUB('5. Endividamento — Passivo Não Circulante'),
    tbl(['Componente','Valor (R$)','% do PNC','% do PT'], [
      ['Contas a Pagar LP', m.pnc.contas],
      ['Credores Diversos LP', m.pnc.cred],
      ['Obrigações Tributárias LP', m.pnc.trib],
    ].map(([l,v]) => new TableRow({ children: [C(l), C(fmtC(v), { align: AlignmentType.RIGHT }), C(fmtP(v/m.PNC), { align: AlignmentType.RIGHT }), C(fmtP(v/m.PT), { align: AlignmentType.RIGHT })] }))),

    SUB('6. Composição do Patrimônio Líquido'),
    tbl(['Conta','Valor (R$)','% do PL'], [
      cap('Capital Social', m.pl.cap, m.PL),
      cap('Reservas', m.pl.res, m.PL),
      cap('Lucros/Prejuízos Acumulados', m.pl.luc, m.PL),
    ]),

    SUB('7. Indicadores do Mês'),
    tbl(['Indicador','Fórmula','Valor'], [
      ['Liquidez Corrente','AC ÷ PC', m.ind.LC.toFixed(3)],
      ['Endividamento Geral','PT ÷ AT', fmtP(m.ind.EG)],
      ['Endividamento Curto Prazo','PC ÷ AT', fmtP(m.ind.ECP)],
      ['Endividamento Longo Prazo','PNC ÷ AT', fmtP(m.ind.ELP)],
      ['Composição do Endividamento','PC ÷ PT', fmtP(m.ind.CE)],
      ['Capital de Terceiros','PT ÷ (PT + PL)', fmtP(m.ind.CT)],
      ['Imobilização do PL','(AT − AC) ÷ PL', fmtP(m.ind.IPL)],
    ].map(([l,f,v]) => new TableRow({ children: [C(l), C(f), C(v, { align: AlignmentType.RIGHT, bold: true })] }))),

    SUB('8. Parecer Técnico do Auditor Contábil Sênior IA'),
    ...parecerParas(parecer),
  ];
};

// Capa + Sumário Executivo
const cover = [
  P('BEX AUDITORIA', { heading: HeadingLevel.HEADING_1, align: AlignmentType.CENTER, color: '1E3A8A', bold: true, size: 40, spacing: { after: 120 } }),
  P('Relatório de Auditoria Contábil — Visão Mensal Detalhada', { align: AlignmentType.CENTER, bold: true, size: 26, color: '334155', spacing: { after: 80 } }),
  P('Composição Patrimonial · Endividamento · Indicadores · Parecer Técnico', { align: AlignmentType.CENTER, size: 22, color: '64748B', spacing: { after: 200 } }),
  P('Auditor Contábil Sênior IA', { align: AlignmentType.CENTER, bold: true, size: 22 }),
  P('Período analisado: Setembro/2025 a Março/2026 (7 meses)', { align: AlignmentType.CENTER, size: 20 }),
  P(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, { align: AlignmentType.CENTER, size: 20, spacing: { after: 400 } }),

  SUB('Sumário Executivo'),
  ...parecerParas(execSummary),

  new Paragraph({ children: [new PageBreak()] }),
  SUB('Quadro Comparativo — 7 meses'),
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1860,1500,1500,1500,1500,1500],
    rows: [
      new TableRow({ tableHeader: true, children: ['Mês','Ativo Total','Passivo Total','PL','Endiv.Geral','Liq.Corrente'].map(HDR) }),
      ...data.map(m => new TableRow({ children: [
        C(m.mes, { bold: true }),
        C(fmtC(m.AT), { align: AlignmentType.RIGHT }),
        C(fmtC(m.PT), { align: AlignmentType.RIGHT }),
        C(fmtC(m.PL), { align: AlignmentType.RIGHT }),
        C(fmtP(m.ind.EG), { align: AlignmentType.RIGHT }),
        C(m.ind.LC.toFixed(3), { align: AlignmentType.RIGHT, bold: true }),
      ]})),
    ],
  }),
];

const doc = new Document({
  creator: 'BEX Auditoria', title: 'Relatório BEx de Auditoria — Visão Mensal',
  styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1133, right: 1133, bottom: 1133, left: 1133 } } },
    children: [...cover, ...data.flatMap(buildMonth)],
  }],
});

const buf = await Packer.toBuffer(doc);
const out = '/mnt/documents/Relatorio_BEx_Auditoria_Mensal_Comentado.docx';
fs.writeFileSync(out, buf);
console.log('OK', out);
