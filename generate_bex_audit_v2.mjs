import ExcelJS from 'exceljs';
import fs from 'fs';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, HeadingLevel, PageBreak, BorderStyle, ShadingType } from 'docx';

// ── 1. Extrai dados numéricos do DIP ──────────────────────────────────────
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('DIP_CORRETO.xlsx');
const ws = wb.getWorksheet('Planilha1');
const months = ["Setembro/2025","Outubro/2025","Novembro/2025","Dezembro/2025","Janeiro/2026","Fevereiro/2026","Março/2026"];
const cols = [3,4,5,6,7,8,9];
const ext = (r) => cols.map(c => parseFloat(ws.getRow(r).values[c]) || 0);

const AT=ext(2), AC=ext(3), ANC=ext(115);
const PC=ext(162), PNC=ext(266), PL=ext(277), RL=ext(291);
const acDisp=ext(4), acConv=ext(16), acEst=ext(63), acMerc=ext(92), acDesp=ext(102);
const ancReal=ext(116), ancInv=ext(129), ancImob=ext(133);
const pcContas=ext(163), pcEmp=ext(170), pcTrab=ext(181), pcTrib=ext(201), pcMerc=ext(221), pcOutras=ext(234), pcProv=ext(258);
const pncContas=ext(267), pncCred=ext(270), pncTrib=ext(273);
const plCap=ext(278), plRes=ext(281), plLuc=ext(286);

// PT extraído diretamente da linha "PASSIVO" do balancete (como originalmente)
const PT = ext(161);

const data = months.map((mes,i) => ({
  mes, AT:AT[i], AC:AC[i], ANC:ANC[i], PC:PC[i], PNC:PNC[i], PT:PT[i], PL:PL[i], RL:RL[i],
  ac:{disp:acDisp[i],conv:acConv[i],est:acEst[i],merc:acMerc[i],desp:acDesp[i]},
  anc:{real:ancReal[i],inv:ancInv[i],imob:ancImob[i]},
  pc:{contas:pcContas[i],emp:pcEmp[i],trab:pcTrab[i],trib:pcTrib[i],merc:pcMerc[i],outras:pcOutras[i],prov:pcProv[i]},
  pnc:{contas:pncContas[i],cred:pncCred[i],trib:pncTrib[i]},
  pl:{cap:plCap[i],res:plRes[i],luc:plLuc[i]},
  ind:{
    LC: PC[i] ? AC[i]/PC[i] : 0,
    EG: AT[i] ? PT[i]/AT[i] : 0,
    ECP: AT[i] ? PC[i]/AT[i] : 0,
    ELP: AT[i] ? PNC[i]/AT[i] : 0,
    CE: PT[i] ? PC[i]/PT[i] : 0,
    CT: PL[i] ? PT[i]/PL[i] : 0,   // CORRIGIDO: PT ÷ PL
    IPL: PL[i] ? (AT[i]-AC[i])/PL[i] : 0,
  }
}));

// ── 2. Recupera pareceres e sumário do relatório anterior ─────────────────
const oldText = fs.readFileSync('/tmp/old_report.txt','utf8');
function extractBlock(start, end) {
  const i = oldText.indexOf(start);
  const j = end ? oldText.indexOf(end, i+1) : oldText.length;
  return oldText.slice(i + start.length, j === -1 ? oldText.length : j).trim();
}
const execSummary = extractBlock('Sumário Executivo','Quadro Comparativo');

const parecerByMes = {};
for (let i=0; i<months.length; i++) {
  const tag = `Mês de Referência: ${months[i]}`;
  const next = i+1 < months.length ? `Mês de Referência: ${months[i+1]}` : null;
  const block = extractBlock(tag, next);
  const p = block.indexOf('Parecer Técnico do Auditor Contábil Sênior IA');
  parecerByMes[months[i]] = p >= 0 ? block.slice(p + 'Parecer Técnico do Auditor Contábil Sênior IA'.length).trim() : '';
}

// ── 3. Renderização DOCX ──────────────────────────────────────────────────
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
  children: [new Paragraph({ alignment: opts.align,
    children: [new TextRun({ text: String(text), bold: opts.bold, size: opts.size || 18, color: opts.color })] })],
});
const HDR = (t) => C(t, { bold:true, fill:'1E3A8A', color:'FFFFFF', align:AlignmentType.CENTER });
const SUB = (t) => P(t, { bold:true, size:24, color:'1E3A8A', spacing:{ before:280, after:120 } });
const paras = (txt) => txt.split(/\n\s*\n+/).filter(Boolean).map(p =>
  new Paragraph({ children:[new TextRun({ text:p.replace(/\s+/g,' ').trim(), size:21 })],
    spacing:{ after:120, line:300 }, alignment:AlignmentType.JUSTIFIED }));

const buildMonth = (m) => {
  const cap = (label, v, base) =>
    new TableRow({ children: [C(label), C(fmtC(v),{align:AlignmentType.RIGHT}), C(fmtP(v/base),{align:AlignmentType.RIGHT})] });
  const tbl = (header, rows) => new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: header.length===3 ? [4360,2500,2500] : [3360,2000,2000,2000],
    rows: [new TableRow({ tableHeader:true, children: header.map(HDR) }), ...rows],
  });
  const parecer = parecerByMes[m.mes] || '(parecer indisponível)';
  return [
    new Paragraph({ children:[new PageBreak()] }),
    P(`Mês de Referência: ${m.mes}`, { heading:HeadingLevel.HEADING_1, color:'1E3A8A', bold:true, spacing:{ after:200 } }),

    SUB('1. Resumo Patrimonial'),
    tbl(['Item','Valor (R$)','% do Ativo Total'], [
      new TableRow({ children:[C('Ativo Total',{bold:true}), C(fmtC(m.AT),{align:AlignmentType.RIGHT,bold:true}), C('100,00%',{align:AlignmentType.RIGHT,bold:true})] }),
      cap('   Ativo Circulante', m.AC, m.AT),
      cap('   Ativo Não Circulante', m.ANC, m.AT),
      cap('Passivo Total', m.PT, m.AT),
      cap('   Passivo Circulante', m.PC, m.AT),
      cap('   Passivo Não Circulante', m.PNC, m.AT),
      cap('Patrimônio Líquido', m.PL, m.AT),
      new TableRow({ children:[C('Receita Líquida (acumulada)'), C(fmtC(m.RL),{align:AlignmentType.RIGHT}), C('—',{align:AlignmentType.RIGHT})] }),
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
    ].map(([l,v]) => new TableRow({ children:[C(l), C(fmtC(v),{align:AlignmentType.RIGHT}), C(fmtP(v/m.PC),{align:AlignmentType.RIGHT}), C(fmtP(v/m.PT),{align:AlignmentType.RIGHT})] }))),

    SUB('5. Endividamento — Passivo Não Circulante'),
    tbl(['Componente','Valor (R$)','% do PNC','% do PT'], [
      ['Contas a Pagar LP', m.pnc.contas],
      ['Credores Diversos LP', m.pnc.cred],
      ['Obrigações Tributárias LP', m.pnc.trib],
    ].map(([l,v]) => new TableRow({ children:[C(l), C(fmtC(v),{align:AlignmentType.RIGHT}), C(fmtP(v/m.PNC),{align:AlignmentType.RIGHT}), C(fmtP(v/m.PT),{align:AlignmentType.RIGHT})] }))),

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
      ['Capital de Terceiros','PT ÷ PL', fmtP(m.ind.CT)],
      ['Imobilização do PL','(AT − AC) ÷ PL', fmtP(m.ind.IPL)],
    ].map(([l,f,v]) => new TableRow({ children:[C(l), C(f), C(v,{align:AlignmentType.RIGHT,bold:true})] }))),

    SUB('8. Parecer Técnico do Auditor Contábil Sênior IA'),
    ...paras(parecer),
  ];
};

const cover = [
  P('BEX AUDITORIA', { heading:HeadingLevel.HEADING_1, align:AlignmentType.CENTER, color:'1E3A8A', bold:true, size:40, spacing:{ after:120 } }),
  P('Relatório de Auditoria Contábil — Visão Mensal Detalhada (v2)', { align:AlignmentType.CENTER, bold:true, size:26, color:'334155', spacing:{ after:80 } }),
  P('Composição Patrimonial · Endividamento · Indicadores · Parecer Técnico', { align:AlignmentType.CENTER, size:22, color:'64748B', spacing:{ after:200 } }),
  P('Auditor Contábil Sênior IA', { align:AlignmentType.CENTER, bold:true, size:22 }),
  P('Período analisado: Setembro/2025 a Março/2026 (7 meses)', { align:AlignmentType.CENTER, size:20 }),
  P(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, { align:AlignmentType.CENTER, size:20, spacing:{ after:200 } }),
  P('Nota técnica: nesta versão, Passivo Total (PT) é o saldo do grupo PASSIVO conforme balancete; Capital de Terceiros = PT ÷ PL.',
    { align:AlignmentType.CENTER, size:18, color:'B45309', spacing:{ after:400 } }),

  SUB('Sumário Executivo'),
  ...paras(execSummary),

  new Paragraph({ children:[new PageBreak()] }),
  SUB('Quadro Comparativo — 7 meses'),
  new Table({
    width:{ size:9360, type:WidthType.DXA },
    columnWidths:[1860,1500,1500,1500,1500,1500],
    rows:[
      new TableRow({ tableHeader:true, children:['Mês','Ativo Total','Passivo Total','PL','Endiv.Geral','Liq.Corrente'].map(HDR) }),
      ...data.map(m => new TableRow({ children:[
        C(m.mes,{bold:true}),
        C(fmtC(m.AT),{align:AlignmentType.RIGHT}),
        C(fmtC(m.PT),{align:AlignmentType.RIGHT}),
        C(fmtC(m.PL),{align:AlignmentType.RIGHT}),
        C(fmtP(m.ind.EG),{align:AlignmentType.RIGHT}),
        C(m.ind.LC.toFixed(3),{align:AlignmentType.RIGHT,bold:true}),
      ]})),
    ],
  }),
];

const doc = new Document({
  creator:'BEX Auditoria', title:'Relatório BEx de Auditoria — Visão Mensal v2',
  styles:{ default:{ document:{ run:{ font:'Calibri', size:22 } } } },
  sections:[{
    properties:{ page:{ size:{ width:11906, height:16838 }, margin:{ top:1133, right:1133, bottom:1133, left:1133 } } },
    children:[...cover, ...data.flatMap(buildMonth)],
  }],
});

const buf = await Packer.toBuffer(doc);
const out = '/mnt/documents/Relatorio_BEx_Auditoria_Mensal_Comentado_v2.docx';
fs.writeFileSync(out, buf);
console.log('OK', out);
