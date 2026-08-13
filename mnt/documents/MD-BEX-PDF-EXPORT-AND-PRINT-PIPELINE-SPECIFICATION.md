# MD-BEX-PDF-EXPORT-AND-PRINT-PIPELINE-SPECIFICATION-001

**Objetivo:** especificação completa e implementável do processo de **geração e exportação de PDF** (e DOCX/impressão) dos relatórios BEx e Kanitz, para reconfigurar um remix da plataforma cujo download automático de PDF está falhando.

**Escopo:** front-end apenas. Não há geração de PDF no servidor. Todo o PDF é produzido no browser a partir do DOM já renderizado (WYSIWYG total: a tela é a fonte do PDF).

---

## 1. Dependências obrigatórias (package.json)

```json
"html2canvas": "^1.4.1",
"html2pdf.js": "^0.14.0",
"jspdf": "^4.2.1"
```

Regras:
- `html2canvas` e `jspdf` são carregados por **import dinâmico** dentro da função de exportação (evita inflar o bundle inicial e evita erros de SSR/build).
- `html2pdf.js` é apenas o **fallback** para conteúdo sem folhas A4 (ex.: painel de gráficos).
- Falha comum no remix: importar `jspdf` no topo do arquivo (`import { jsPDF } from 'jspdf'`) — em builds Vite/Rollup isso pode quebrar (`default is not a function` / CJS interop). **Usar sempre `await import(...)`.**

---

## 2. Contrato de DOM (pré-requisito absoluto)

O exportador não gera layout; ele **fotografa** o layout existente. Sem esse contrato, o PDF sai em branco ou com 1 página só.

| Elemento | Papel |
|---|---|
| `#report-bex-container` | container raiz do Relatório BEx |
| `#report-kanitz-container` | container raiz do Relatório Kanitz |
| `#tab-graficos-container` | painel de gráficos (sem folhas A4) |
| `#report-formulas-container` | relatório de fórmulas técnicas |
| `.report-a4-cover` | **capa** — 1 folha A4 = 1 página do PDF |
| `.report-a4-page` | **folha de conteúdo** — 1 folha A4 = 1 página do PDF |
| `.report-page-header` | topo da folha |
| `.report-page-body` | área útil da folha (geometria travada) |
| `.report-footer-bar` | rodapé fixo (18mm, absolute bottom) |
| `.report-pages-container` | "desk effect" (fundo cinza) — neutralizado na exportação |
| `.print:hidden`, `.no-export`, `button` | removidos do clone antes de rasterizar |
| `.report-card-keep-together` | bloco que nunca pode ser cortado |

**Regra de ouro:** o número de páginas do PDF = `container.querySelectorAll('.report-a4-page, .report-a4-cover').length`. Se o remix renderiza o relatório como um único `div` rolável, o exportador cai no fallback `html2pdf.js` e a paginação quebra.

---

## 3. Geometria canônica A4

```
A4 @96dpi:  794 x 1122 px   (constantes A4_W / A4_H)
A4 em mm:   210 x 297 mm    (jsPDF addImage 0,0,210,297)
Corpo útil: max-height / min-height = 245mm  (Hard Geometry Gate)
Safe zone rodapé: padding-bottom 26mm
Margens laterais do corpo: 16mm
Rodapé: height 18mm, absolute bottom
```

Usar **px** (não mm) na largura do clone rasterizado: mm gera arredondamentos divergentes entre Chrome e Firefox.

---

## 4. Fluxo de exportação PDF (`exportPdf`)

Assinatura: `exportPdf(containerId: string, reportTitle: string): Promise<void>`

Passos, na ordem exata:

1. **Guard global de concorrência**
   ```ts
   let pdfExportInProgress = false; // módulo-level, fora do componente
   if (pdfExportInProgress) { toast("Relatório em geração…"); return; }
   pdfExportInProgress = true;
   ```
   Sem esse guard, dois cliques geram dois canvases simultâneos e o navegador aborta o download.

2. **Localizar o container**: `document.getElementById(containerId)`; se ausente → toast destrutivo e retorno (não lançar exceção).

3. **Toast de progresso persistente** (`duration: 1000000`), guardado para `dismiss()` depois.

4. **Criar wrapper off-screen** (não usar `display:none` — html2canvas não mede elementos sem layout):
   ```ts
   wrapper.style.cssText =
     `position:absolute;left:-10000px;top:0;background:#ffffff;width:794px;margin:0;padding:0;`;
   ```

5. **Clonar o container** (`el.cloneNode(true)`), forçar fundo branco `#ffffff`, cor `#1c2541`, `width: 794px`, `padding/margin: 0`.

6. **Sanitizar o clone**
   - remover: `.print\\:hidden, [class*="print:hidden"], .no-export, button, .ui-btn`
   - neutralizar `.report-pages-container`: `padding:0; background:none; border-radius:0`
   - converter tokens de tema em cores literais (html2canvas **não** entende `oklch()`/`color-mix()` e trata `hsl(var(--x))` mal): `bg-muted`/`bg-slate-50` → `#f8fafc`; `text-muted-foreground` → `#64748b`.
   > **Causa raiz frequente no remix:** CSS com `oklch()` (Tailwind v4 default) faz html2canvas lançar `Attempting to parse an unsupported color function`. Manter as cores do relatório em HEX/RGBA.

7. **Normalizar cada folha** (`pages.forEach`):
   ```
   margin/padding/box-shadow/border/border-radius = 0/none
   width = maxWidth = 794px
   height = 1122px; minHeight = maxHeight = 245mm
   paddingBottom = 26mm
   overflow = hidden; boxSizing = border-box
   contain = 'layout paint'; position = relative; transform = none; display = block
   pageBreakAfter/breakAfter = always/page
   índices 2 e 3 → pageBreakBefore/breakBefore = always/page
   blocos .report-card-keep-together/.card/section/.break-inside-avoid → breakInside: avoid
   ```

8. **Anexar wrapper ao `document.body`** (obrigatório: html2canvas exige o nó no documento).

9. **Aguardar fontes e um frame**
   ```ts
   if (document.fonts?.ready) { try { await document.fonts.ready; } catch {} }
   await new Promise(requestAnimationFrame);
   ```
   Sem isso, o Firefox rasteriza antes das webfonts → texto deslocado/cortado.

10. **Rasterizar página a página** (imports dinâmicos):
    ```ts
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    for (const page of pages) {
      page.scrollTop = 0;
      const canvas = await html2canvas(page, {
        scale: 2.2, useCORS: true, logging: false, backgroundColor: '#ffffff',
        width: 794, height: 1122, windowWidth: 794, windowHeight: 1122,
        x: 0, y: 0, scrollX: 0, scrollY: 0, imageTimeout: 15000,
        onclone: (doc) => {
          doc.querySelectorAll('.score-bex,[class*="score-bex"],.bex-score-display,.no-print')
             .forEach(n => n.remove());
          const imgs = Array.from(doc.getElementsByTagName('img'));
          return Promise.all(imgs.map(i => i.complete ? Promise.resolve()
            : new Promise(r => { i.onload = r; i.onerror = r; })));
        }
      });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }
    pdf.save(`${bexFileName(reportTitle)}.pdf`);
    ```
    - `scale: 2.2` = equilíbrio nitidez/memória. Acima de 3 estoura memória em relatórios >10 páginas.
    - JPEG 0.95 em vez de PNG: reduz o arquivo de ~40MB para ~3MB.
    - `onclone` aguarda imagens (logos/capa) — imagens não carregadas viram retângulos brancos.

11. **Fallback sem folhas A4** (`pages.length === 0`): `html2pdf.js`
    ```ts
    await html2pdf().set({
      margin: 0, filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', windowWidth: 794 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(clone).save();
    ```

12. **`finally` obrigatório**
    ```ts
    pdfExportInProgress = false;
    wrapper.remove();
    ```
    Sem o `finally`, uma falha deixa `pdfExportInProgress = true` para sempre e **todos os downloads seguintes são silenciosamente ignorados** — sintoma clássico do "não exporta mais nada".

13. **Feedback**: `progressToast.dismiss()` + toast de sucesso, ou toast destrutivo com `err.message` no catch (sempre `console.error` também).

### Download automático
`pdf.save(fileName)` já dispara o download (cria e clica um `<a download>` internamente). Não abrir `window.open` nem nova aba: popup blockers cancelam. Se o remix usa `pdf.output('bloburl')` + `window.open`, **trocar por `pdf.save()`**.

---

## 5. Nomenclatura de arquivos (`bexFileName`)

```ts
export function bexFileName(raw: string): string {
  const stripped = (raw || "Relatorio")
    .replace(/lovable/gi, "")
    .replace(/[\s_-]{2,}/g, "_")
    .replace(/^[\s_-]+|[\s_-]+$/g, "")
    .trim() || "Relatorio";
  return /^bex[\s_-]/i.test(stripped) ? stripped : `BEx_${stripped}`;
}
```
Usar em **todo** download/exportação e no `document.title` antes de `window.print()`.

---

## 6. Impressão nativa (`printReport`)

```ts
const printReport = (containerId: string, reportTitle: string) => {
  const prev = document.title;
  document.title = bexFileName(reportTitle);
  document.body.classList.add('printing-report');
  document.body.setAttribute('data-print-target', containerId);
  window.print();
  document.body.classList.remove('printing-report');
  document.body.removeAttribute('data-print-target');
  document.title = prev;
};
```

CSS de suporte (`@media print`), resumo funcional:
- `body.printing-report *` → `visibility: hidden`
- `body[data-print-target="<id>"] #<id>, #<id> *` → `visibility: visible`
- container alvo → `position:absolute; top:0; left:0; width:100%; z-index:9999; background:white`
- `.print\:hidden` → `display:none`
- `thead { display: table-header-group }`, `tfoot { table-footer-group }`, `tr { break-inside: avoid }`
- títulos `h2/h3/h4` → `break-after: avoid` (sem títulos órfãos)
- `.report-a4-page` → `padding: 26mm 0` e `height: 297mm`
- `@page { size: A4; margin: 0 }`
- painel de gráficos: força `[role="tabpanel"][data-state="inactive"] { display:block }` e esconde `[role="tablist"]`, exibindo a capa `.bex-print-cover`.

---

## 7. Exportação DOCX (`exportDocx`)

Não usa a lib `docx`; gera **HTML compatível com Word** (`application/msword`) e baixa via Blob:

1. Percorrer `.report-a4-page, .report-a4-cover` do container.
2. Clonar cada folha; remover `.print:hidden`; substituir `<svg>` por `<span>` vazio.
3. Entre páginas inserir:
   `<br clear="all" style="mso-special-character:line-break;page-break-before:always" />`
4. Montar documento com namespaces `o:`/`w:`, `<meta name="ProgId" content="Word.Document">`, `@page Section1 { size: 210mm 297mm; margin: 16mm 16mm 12mm 16mm }` e um bloco `<style>` que converte as classes Tailwind usadas (cores, badges, grids → blocos, tabelas) para CSS estático em `pt`.
5. Download:
   ```ts
   const blob = new Blob(['\ufeff' + docContent], { type: 'application/msword;charset=utf-8' });
   const a = document.createElement('a');
   a.href = URL.createObjectURL(blob);
   a.download = `${bexFileName(reportTitle)}.doc`;
   document.body.appendChild(a); a.click(); document.body.removeChild(a);
   URL.revokeObjectURL(url);
   ```
   O BOM `\ufeff` é obrigatório para acentuação correta no Word.

---

## 8. Pontos de acionamento (UI)

| Local | Ação |
|---|---|
| Toolbar do Relatório BEx | `exportPdf('report-bex-container','Relatório BEX')`, `exportDocx(...)`, `printReport(...)` |
| Toolbar do Relatório Kanitz | `exportPdf('report-kanitz-container','Relatório Kanitz')`, `exportDocx(...)`, `printReport(...)` |
| Painel de gráficos | `exportPdf('tab-graficos-container', 'BEx_Graficos_Auditoria_e_Parecer_Contabil_<YYYY-MM-DD>')` |
| Fórmulas técnicas | `exportPdf('report-formulas-container','BEx_Relatorio_Formulas_Tecnicas')` |

Os botões devem estar **fora** do container exportado ou marcados com `print:hidden` (o exportador remove `button` do clone, mas o print nativo depende do CSS).

---

## 9. Checklist de diagnóstico do remix (erro no PDF/exportação automática)

| Sintoma | Causa provável | Correção |
|---|---|---|
| Nada acontece ao clicar (só na 2ª vez) | `pdfExportInProgress` travado em `true` por exceção sem `finally` | adicionar `finally { pdfExportInProgress = false; wrapper.remove(); }` |
| PDF em branco | wrapper com `display:none`/não anexado ao body; ou clone sem `width` fixa | wrapper `position:absolute; left:-10000px` + `appendChild(document.body)` |
| Erro `unsupported color function oklch` | tokens Tailwind v4 / `oklch()` no relatório | usar HEX/RGBA nas folhas A4 e normalizar cores no clone |
| PDF com 1 página gigante | container sem `.report-a4-page` → caiu no fallback | renderizar folhas A4 explícitas |
| Conteúdo cortado no rodapé | falta `padding-bottom: 26mm` e `max-height: 245mm` no `.report-page-body` | aplicar Hard Geometry Gate |
| Logos/capa em branco | imagens não carregadas ao rasterizar | `useCORS: true` + `onclone` aguardando `img.onload` |
| Fontes deslocadas no Firefox | rasterização antes de `document.fonts.ready` | aguardar fontes + 1 `requestAnimationFrame` |
| `jsPDF is not a constructor` | import estático/CJS interop | `const { jsPDF } = await import('jspdf')` |
| Arquivo enorme (>30MB) | `toDataURL('image/png')` | JPEG 0.95 + `addImage(..., 'FAST')` |
| Download bloqueado | `window.open(blobUrl)` | usar `pdf.save(fileName)` |
| Nome com "Lovable" | falta `bexFileName` | aplicar em PDF, DOCX e `document.title` |
| Impressão sai com a página inteira | falta `printing-report` / `data-print-target` | aplicar classe+atributo e o bloco `@media print` |

---

## 10. Critérios de homologação

1. Clique único em "Exportar PDF" → download automático, sem diálogo, nome `BEx_*.pdf`.
2. Nº de páginas do PDF == nº de `.report-a4-page` + `.report-a4-cover`.
3. Nenhum bloco `report-card-keep-together` cortado entre páginas.
4. Rodapé visível em todas as páginas, sem sobreposição de conteúdo.
5. Segundo clique durante a geração → toast informativo, sem segunda geração.
6. Falha de rasterização → toast destrutivo + `console.error`, e nova tentativa funciona (guard liberado).
7. Paridade Chrome/Firefox: mesma quantidade de páginas e mesmo enquadramento.
