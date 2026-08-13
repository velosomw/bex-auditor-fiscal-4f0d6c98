# MD-PORT-14 — Export PDF/DOCX Parity

## 1. Objetivo
Documentar o pipeline real de exportação (tela → PDF via `html2canvas`+`jsPDF`, impressão nativa via `window.print()`, e exportação DOCX via HTML/MSO) descrito em `src/pages/Audit.tsx`, garantindo paridade visual entre tela, impressão e arquivo exportado, e listar armadilhas conhecidas.

## 2. Escopo
- `exportPdf(containerId, reportTitle)` — pipeline principal de exportação PDF (rasterização página a página).
- `printReport(containerId, reportTitle)` — impressão nativa via CSS `@media print` (ver MD-PORT-11 §9).
- `exportDocx(containerId, reportTitle)` — exportação DOCX via HTML MSO (`xmlns:w`, `mso-*`).
- `exportFormulasReport()` — wrapper específico do relatório técnico de fórmulas.
- Guard global `pdfExportInProgress` (mutex de exportação concorrente).
- Nomenclatura padronizada de arquivo (`bexFileName`).

## 3. Pré-requisitos
- Pacotes `html2canvas`, `jspdf`, `html2pdf.js` disponíveis via import dinâmico (`await import(...)`), carregados apenas no momento da exportação (code-splitting).
- Helper `bexFileName(reportTitle)` de `@/lib/bexFileName`, responsável por padronizar todos os nomes de arquivo exportados/impressos com prefixo `"BEx_"`.
- Fontes `Plus Jakarta Sans`/`Segoe UI`/`Arial` disponíveis tanto no navegador (tela/impressão) quanto embutidas via CSS no HTML gerado para DOCX.

## 4. Guard de exportação concorrente
```ts
let pdfExportInProgress = false;
```
Ao chamar `exportPdf`, se já houver uma exportação em curso, a função **não inicia uma segunda** e exibe toast informativo:
```ts
if (pdfExportInProgress) {
  toast({ title: "Relatório em geração…", description: "O relatório já está sendo gerado e o download será automático. Aguarde alguns instantes.", ... });
  return;
}
```
Esse mutex é **module-level** (não por componente/instância) — replicar exatamente essa característica para impedir múltiplos cliques gerarem PDFs duplicados ou corromperem o DOM clonado simultaneamente.

## 5. Nomenclatura de arquivo — `printReport`
```ts
const printReport = (containerId: string, reportTitle: string) => {
  const prevTitle = document.title;
  document.title = bexFileName(reportTitle);
  document.body.classList.add('printing-report');
  document.body.setAttribute('data-print-target', containerId);
  window.print();
  document.body.classList.remove('printing-report');
  document.body.removeAttribute('data-print-target');
  document.title = prevTitle;
};
```
`document.title` é temporariamente sobrescrito porque a maioria dos navegadores usa o título da aba como nome padrão de arquivo ao "Salvar como PDF" via diálogo de impressão nativo — essa é a técnica real usada para nomear o PDF gerado por `window.print()` de forma consistente com o padrão `BEx_...` do produto.

## 6. Pipeline `exportPdf` — passo a passo real
### 6.1 Dimensões A4 exatas em px @96dpi
```ts
const A4_W = 794;
const A4_H = 1122; // Ajustado de 1123 para 1122 (A4 exato em 96dpi é 793.7x1122.5)
```
Comentário do código explica a escolha de `px` em vez de `mm` para o clone offscreen: *"usar px (não mm) evita arredondamentos diferentes entre Chrome e Firefox ao rasterizar o clone."*

### 6.2 Wrapper offscreen + clone
```ts
const wrapper = document.createElement('div');
wrapper.style.cssText = `position:absolute;left:-10000px;top:0;background:#ffffff;width:${A4_W}px;margin:0;padding:0;`;
const clone = el.cloneNode(true) as HTMLElement;
clone.style.backgroundColor = '#ffffff';
clone.style.color = '#1c2541';
clone.style.padding = '0';
clone.style.margin = '0';
clone.style.width = `${A4_W}px`;
```
O elemento original NUNCA é manipulado diretamente — sempre um clone posicionado fora da viewport (`left:-10000px`), preservando a experiência do usuário na tela original durante a geração do PDF.

### 6.3 Limpeza de elementos não exportáveis
```ts
clone.querySelectorAll('.print\\:hidden, [class*="print:hidden"], .no-export, button, .ui-btn').forEach(n => n.remove());
```
Remove: qualquer elemento com classe Tailwind `print:hidden`, classe `no-export`, todos os `<button>`, e elementos `.ui-btn`. Ao portar, qualquer novo controle interativo que não deva aparecer no PDF **deve** usar uma dessas convenções de classe.

### 6.4 Neutralização do "desk effect"
```ts
clone.querySelectorAll<HTMLElement>('.report-pages-container').forEach(n => {
  n.style.padding = '0'; n.style.background = 'none'; n.style.borderRadius = '0';
});
```
Remove o fundo cinza/padding decorativo de "mesa de impressão" (ver MD-PORT-11 §4) que só faz sentido na visualização em tela.

### 6.5 Normalização de cores utilitárias
```ts
clone.querySelectorAll('*').forEach((node: any) => {
  if (node.style) {
    if (node.classList.contains('bg-muted') || node.classList.contains('bg-slate-50')) node.style.backgroundColor = '#f8fafc';
    if (node.classList.contains('text-muted-foreground')) node.style.color = '#64748b';
  }
});
```
`html2canvas` não resolve variáveis CSS custom properties (`hsl(var(--muted))`) de forma confiável em todos os navegadores/versões — por isso a plataforma força cores literais (hex) para as classes utilitárias mais usadas antes de rasterizar. **Armadilha conhecida**: qualquer classe Tailwind nova baseada em token de tema (`bg-accent`, `text-primary` etc.) usada em conteúdo de relatório e não tratada aqui pode renderizar com cor errada/transparente no PDF exportado — é obrigatório estender esse bloco sempre que uma nova classe de cor baseada em variável for introduzida em componentes de relatório.

### 6.6 Preparação geométrica de cada página (`pages.forEach`)
```ts
const pages = Array.from(clone.querySelectorAll<HTMLElement>('.report-a4-page, .report-a4-cover'));
pages.forEach((p, idx) => {
  p.style.margin = '0'; p.style.padding = '0'; p.style.boxShadow = 'none'; p.style.border = 'none'; p.style.borderRadius = '0';
  p.style.width = `${A4_W}px`; p.style.maxWidth = `${A4_W}px`; p.style.height = `${A4_H}px`;
  p.style.minHeight = `245mm`; p.style.maxHeight = `245mm`;
  p.style.paddingBottom = `26mm`; // RP-06: Footer Safe Zone
  p.style.overflow = 'hidden'; p.style.boxSizing = 'border-box';
  p.style.contain = 'layout paint';
  p.style.position = 'relative'; p.style.transform = 'none'; p.style.display = 'block';

  const criticalBlocks = p.querySelectorAll('.report-card-keep-together, .card, section, .break-inside-avoid');
  criticalBlocks.forEach(b => { (b as HTMLElement).style.breakInside = 'avoid'; (b as HTMLElement).style.pageBreakInside = 'avoid'; });

  if (idx === 2 || idx === 3) { p.style.pageBreakBefore = 'always'; p.style.breakBefore = 'page'; }

  p.style.pageBreakAfter = 'always'; p.style.breakAfter = 'page';
});
```
Pontos críticos: `contain: 'layout paint'` isola o subárvore de layout/pintura da página, prevenindo que reflow de uma página afete o cálculo de altura de outra durante a rasterização sequencial. `idx === 2 || idx === 3` (páginas 3 e 4, 0-indexed) do relatório BEx SEMPRE recebem quebra forçada antes delas — regra de negócio específica (`§42..§43`) preservada tanto no CSS de impressão quanto neste pipeline JS.

### 6.7 Espera de fontes e frame
```ts
if ((document as any).fonts?.ready) { try { await (document as any).fonts.ready; } catch {} }
await new Promise(requestAnimationFrame as any);
```
Necessário porque o Firefox pode rasterizar o clone antes do carregamento completo das webfonts (`Inter`/`Plus Jakarta Sans`), produzindo fallback de fonte no PDF — replicar essa espera dupla (fonts.ready + 1 frame) é obrigatório.

### 6.8 Rasterização por página (`html2canvas` + `jsPDF`)
```ts
const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
for (let i = 0; i < pages.length; i++) {
  pages[i].scrollTop = 0;
  const canvas = await html2canvas(pages[i], {
    scale: 2.2, useCORS: true, logging: false, backgroundColor: '#ffffff',
    width: A4_W, height: A4_H, windowWidth: A4_W, windowHeight: A4_H,
    x: 0, y: 0, scrollX: 0, scrollY: 0, imageTimeout: 15000,
    onclone: (clonedDoc) => {
      clonedDoc.querySelectorAll('.score-bex, [class*="score-bex"], .bex-score-display, .no-print').forEach(n => n.remove());
      const images = clonedDoc.getElementsByTagName('img');
      return Promise.all(Array.from(images).map(img => {
        const imageElement = img as HTMLImageElement;
        if (imageElement.complete) return Promise.resolve();
        return new Promise(resolve => { imageElement.onload = resolve; imageElement.onerror = resolve; });
      }));
    }
  } as any);
  const img = canvas.toDataURL('image/jpeg', 0.95);
  if (i > 0) pdf.addPage();
  pdf.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
}
pdf.save(fileName);
```
Parâmetros que **não podem ser alterados sem revalidação de paridade**: `scale: 2.2` (equilíbrio nitidez/performance, comentário oficial no código), formato de imagem `JPEG` qualidade `0.95` (não PNG — trade-off de tamanho de arquivo), dimensões de inserção fixas `210×297` (mm, tamanho A4 exato, independente do canvas gerado em px). O hook `onclone` remove explicitamente qualquer resquício de Score BEx (`.score-bex`, `.bex-score-display`) — reforçando a regra de negócio "Score BEx foi DESATIVADO" (ver MD-PORT-12 §6) também na camada de exportação, e aguarda todas as `<img>` carregarem antes da captura.

### 6.9 Fallback sem folhas A4 (ex.: painel de gráficos)
```ts
} else {
  const html2pdf = (await import('html2pdf.js')).default;
  await html2pdf().set({
    margin: 0, filename: fileName,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', windowWidth: 794 },
    jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
    pagebreak: { mode: ['css', 'legacy'] },
  } as any).from(clone).save();
}
```
Usado quando o container clonado **não contém** nenhuma `.report-a4-page`/`.report-a4-cover` (ex.: exportação do painel de gráficos, que usa fluxo HTML contínuo em vez de folhas A4 discretas). Nesse modo, a paginação é delegada ao `pagebreak.mode: ['css', 'legacy']` do `html2pdf.js`, que respeita as mesmas classes `break-inside-avoid` do CSS (§7 de MD-PORT-11).

### 6.10 Finalização, erros e log de auditoria
```ts
} catch (err) {
  console.error('Erro ao exportar PDF:', err);
  progressToast.dismiss();
  toast({ title: "Falha ao gerar o PDF", description: err instanceof Error ? err.message : "Erro inesperado ao renderizar o relatório.", variant: "destructive" });
} finally {
  pdfExportInProgress = false;
  wrapper.remove();
  console.log("Canonical Parity Assertion: PASS");
}
```
O `console.log("Canonical Parity Assertion: PASS")` é um marcador de auditoria/QA deixado deliberadamente no código para instrumentação de testes automatizados de paridade (procurável em logs de execução E2E) — deve ser preservado ao portar, mesmo sendo apenas um log informativo.

## 7. `exportDocx` — pipeline HTML→DOCX
```ts
const exportDocx = (containerId: string, reportTitle: string) => {
  const container = document.getElementById(containerId);
  if (!container) return;
  const pages = container.querySelectorAll('.report-a4-page, .report-a4-cover');
  let htmlContent = '';
  pages.forEach((page, index) => {
    const clone = page.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.print\\:hidden, [class*="print:hidden"]').forEach(el => el.remove());
    clone.querySelectorAll('svg').forEach(svg => { const span = document.createElement('span'); span.textContent = ''; svg.replaceWith(span); });
    clone.querySelectorAll('.report-a4-page, .report-a4-cover').forEach(el => { (el as HTMLElement).style.pageBreakAfter = 'always'; });
    const pageHtml = clone.innerHTML;
    if (index > 0) htmlContent += '<br clear="all" style="mso-special-character:line-break;page-break-before:always" />';
    htmlContent += `<div class="page-container">${pageHtml}</div>`;
  });
  ...
};
```
Diferenças-chave em relação ao pipeline PDF:
- **Ícones SVG (lucide-react) são removidos e substituídos por `<span>` vazio** — o Word não renderiza SVG inline de forma confiável; a plataforma opta por **omitir o ícone** em vez de tentar convertê-lo, aceitando perda visual controlada nessa exportação.
- Quebra de página entre folhas via marcador MSO específico: `<br clear="all" style="mso-special-character:line-break;page-break-before:always" />` — sintaxe proprietária do Word, não CSS padrão.
- O documento final é envelopado em HTML com namespaces MSO (`xmlns:o`, `xmlns:w`, `xmlns:m`) e metadados `Word.Document`/`Microsoft Word 15`.

### 7.1 Estilo `@page`/tipografia do DOCX
```css
@page { size: 210mm 297mm; margin: 16mm 16mm 12mm 16mm; mso-header-margin: 8mm; mso-footer-margin: 6mm; }
@page Section1 { size: 210mm 297mm; margin: 16mm 16mm 12mm 16mm; }
div.Section1 { page: Section1; }
body {
  font-family: 'Plus Jakarta Sans', 'Segoe UI', Arial, Helvetica, sans-serif;
  font-size: 10.5pt; color: #1c2541; line-height: 1.6; margin: 0; padding: 0; background: white;
}
h1 { font-family: 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif; font-size: 22pt; font-weight: 800; color: #0f172a; margin-top: 0; margin-bottom: 12pt; letter-spacing: -0.5pt; line-height: 1.2; }
h2 { font-family: 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif; ... }
```
**Divergência intencional de fonte base**: o DOCX usa `10.5pt` de corpo (não 8.5pt como as tabelas de tela/PDF) — o Word tende a reduzir a legibilidade percebida de textos pequenos em comparação ao PDF rasterizado, então o produto usa um corpo levemente maior para compensar. Margens de página no DOCX (`16mm 16mm 12mm 16mm`) também diferem sutilmente do PDF/tela (16mm laterais iguais, mas 12mm de rodapé no DOCX vs. 26mm de footer safe zone no PDF/impressão) — isso é uma **divergência de paridade conhecida e aceita**, documentada aqui para não ser "corrigida" incorretamente ao portar (ver §9, armadilhas conhecidas).

## 8. `exportFormulasReport`
```ts
const exportFormulasReport = async () => {
  await exportPdf('report-formulas-container', 'BEx_Relatorio_Formulas_Tecnicas');
};
```
Wrapper fino que reaproveita o mesmo pipeline `exportPdf` genérico — não há lógica especial adicional; qualquer novo relatório baseado em `.report-a4-page` deve seguir esse mesmo padrão de wrapper (`export<Nome>Report = async () => exportPdf(containerId, reportTitle)`).

## 9. Checklist de paridade tela/exportação
- [ ] Fundo cinza de "mesa de impressão" (`.report-pages-container`) removido no clone antes de exportar (nunca aparece no PDF/DOCX final).
- [ ] Todo elemento `print:hidden`/`no-export`/`button`/`.ui-btn` ausente do PDF exportado.
- [ ] Cores de classes utilitárias baseadas em variável (`bg-muted`, `text-muted-foreground`) normalizadas para hex antes da rasterização.
- [ ] Dimensão de página exportada = exatamente 210×297mm, independentemente da resolução de captura (`scale: 2.2`).
- [ ] Footer Safe Zone de 26mm preservada na rasterização PDF (`paddingBottom: 26mm` aplicado ao clone).
- [ ] Páginas 3 e 4 do relatório BEx sempre com quebra forçada antes delas, tanto no PDF quanto na impressão nativa.
- [ ] Espera de `document.fonts.ready` + 1 `requestAnimationFrame` antes de capturar qualquer página.
- [ ] Score BEx removido do clone via `onclone` (`.score-bex`, `.bex-score-display`, `.no-print`).
- [ ] Nome de arquivo sempre `bexFileName(reportTitle)` — nunca o título bruto sem padronização.
- [ ] DOCX substitui SVGs por `<span>` vazio (nunca tenta embutir SVG bruto no Word).
- [ ] Guard `pdfExportInProgress` impede exportações concorrentes.

## 10. Armadilhas conhecidas
1. **Cores de tema não resolvidas pelo html2canvas**: qualquer nova classe Tailwind baseada em `hsl(var(--...))` usada dentro de um relatório e não tratada no bloco de normalização (§6.5) pode aparecer transparente/preta no PDF. Sempre testar exportação após adicionar novas classes de cor a componentes de relatório.
2. **SVGs no DOCX**: ícones lucide-react (e qualquer gráfico Recharts, que é renderizado como SVG) **não aparecem** no DOCX exportado — apenas texto/tabelas têm paridade real nessa exportação. Isso é uma limitação aceita do produto, não um bug a corrigir silenciosamente.
3. **Margens divergentes DOCX vs. PDF**: 12mm de rodapé no DOCX vs. 26mm de footer safe zone no PDF — não tentar unificar sem validar com o time de produto, pois pode quebrar o layout do Word (que usa outro motor de paginação).
4. **`imageTimeout: 15000`**: imagens que demorem mais de 15s para carregar (ex.: logo em rede lenta) podem ser omitidas silenciosamente da captura — sempre embutir logos como assets locais (`import ... from "@/assets/..."`), nunca URLs externas, para relatórios.
5. **Firefox e webfonts**: sem o `await document.fonts.ready`, o Firefox historicamente rasteriza com fonte de fallback do sistema antes do carregamento de `Plus Jakarta Sans`; qualquer refatoração que remova essa espera deve ser revertida.
6. **Ordem de páginas no array `pages`**: a lógica de `idx === 2 || idx === 3` para forçar quebra é posicional (0-indexed) — se a estrutura de páginas do relatório BEx mudar (páginas adicionadas/removidas antes da 3ª/4ª), essa regra precisa ser recalculada, não deixada "por acaso".

## 11. Critérios de Homologação
1. **Diff visual tela vs. PDF**: capturar screenshot da tela (zoom 100%) de cada página do relatório BEx e comparar com a página correspondente do PDF exportado — divergências de layout (não apenas antialiasing) devem ser zero.
2. **Nome de arquivo**: todo PDF/impressão gerado deve ter nome no padrão `BEx_<Nome>.pdf`, nunca o `reportTitle` bruto.
3. **Concorrência**: disparar duas exportações em sequência rápida (duplo clique) deve resultar em exatamente 1 PDF gerado e 1 toast informativo na segunda tentativa.
4. **Quebra de página 3/4**: no PDF exportado do BEx, a página 3 (índice 2) deve iniciar em uma nova folha física, mesmo que o conteúdo da página 2 não a preenchesse totalmente.
5. **DOCX abre no Word sem erros de compatibilidade**: abrir o arquivo `.doc`/`.docx` gerado no Microsoft Word (ou LibreOffice Writer) e confirmar ausência de avisos de corrupção, com todas as tabelas/textos presentes (ícones ausentes são aceitos, ver armadilha 2).
6. **Score BEx ausente**: nenhum PDF exportado após a regra de desativação deve conter elementos com classe `score-bex`/`bex-score-display`.
