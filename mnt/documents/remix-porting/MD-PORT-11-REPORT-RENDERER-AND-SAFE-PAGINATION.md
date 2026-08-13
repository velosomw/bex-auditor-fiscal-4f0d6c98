# MD-PORT-11 — Report Renderer & Safe Pagination (A4)

## 1. Objetivo
Documentar, com fidelidade de implementação, o motor de renderização de relatórios A4 da plataforma BEx (Business Extended Analysis) — usado nos relatórios BEx (`report-bex-container`), Kanitz (`report-kanitz-container`), Painel de Gráficos (`tab-graficos-container`) e Gestor IA (`gestor-ia-main-container`) — de modo que qualquer time possa reimplementá-lo (ex.: em um projeto "Remix"/porte) sem alterar o resultado visual, a geometria de página ou o comportamento de paginação segura ("Safe Pagination").

## 2. Escopo
- Estrutura DOM das páginas A4 (`.report-a4-page`, `.report-a4-cover`).
- Regras CSS reais de `src/index.css` (seção "A4 Report Container" e "PDF Global Print/Export Styles").
- Regras `@page`/`@media print`.
- Zona de segurança de rodapé (Footer Safe Zone, 26mm).
- Altura útil máxima do corpo da página (`.report-page-body`, 245mm).
- Regras de `break-inside`/`page-break-inside` e a classe utilitária `.report-card-keep-together`.
- Tamanho mínimo de fonte tabular (8.5pt) e proibição de wrap letra-a-letra.
- Estrutura da capa (`report-a4-cover`) e do bloco de metadados da empresa, incluindo a proibição de exibir "nome analítico" da empresa.
- Watermark (`--report-watermark`) usando `folha-rosto-bex.jpg`.
- Estrutura de seções dos relatórios BEx e Kanitz conforme `src/pages/Audit.tsx`.

Fora de escopo: lógica de negócio dos indicadores financeiros (ver MD-PORT-12/13), pipeline de exportação PDF/DOCX (ver MD-PORT-14).

## 3. Pré-requisitos
- Tailwind CSS configurado com `@layer base/components/utilities` (ver `tailwind.config.ts`).
- Fontes web: `Inter` e `Plus Jakarta Sans` carregadas via `@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');` (linha 1 de `src/index.css`).
- Ativos estáticos: `src/assets/folha-rosto-bex.jpg`, `src/assets/logo-brasil-expert.jpg`, `src/assets/marca_logo_BEx.jpeg`, `src/assets/logo-bex-branco.jpeg`.
- Componentes `report-a4-page`/`report-a4-cover` só funcionam corretamente dentro de um contêiner `.report-pages-container` (fundo cinza de "mesa de trabalho" para o preview em tela).

## 4. Contêiner geral — `.report-pages-container`
```css
.report-pages-container {
  background: hsl(220, 10%, 92%);
  padding: 40px 0;
  border-radius: 8px;
  overflow-x: hidden; /* Evita scroll lateral no preview */
}
```
Esse contêiner é o elemento com `id` alvo de impressão (`report-bex-container`, `report-kanitz-container`, `tab-graficos-container`, `gestor-ia-main-container`). É dentro dele que ficam as folhas A4 (`.report-a4-page`/`.report-a4-cover`), uma abaixo da outra, simulando uma "mesa de impressão".

Em tela (`@media screen`) cada folha ganha sombra e espaçamento entre si:
```css
@media screen {
  .report-a4-page, .report-a4-cover {
    box-shadow: 0 4px 20px hsla(0, 0%, 0%, 0.1);
    margin-bottom: 40px !important;
  }
}
```

## 5. Geometria da folha A4 — `.report-a4-page`
```css
.report-a4-page {
  width: 210mm;
  height: 297mm;
  margin: 0 auto;
  background: white;
  position: relative;
  display: flex;
  flex-direction: column;
  box-shadow: none;
  border: none;
  color: hsl(220, 25%, 14%);
  overflow: hidden;
  box-sizing: border-box;
  page-break-after: always;
  break-after: page;
  padding-bottom: 26mm; /* Footer Safe Zone MD-CUTOVER-001 §13 */
}
```
Pontos críticos de implementação:
1. **210mm × 297mm exatos** — nunca usar `min-height`/`auto` para a folha em si (isso é reservado ao `.report-page-body`).
2. **`overflow: hidden`** — qualquer conteúdo que exceda a folha é cortado silenciosamente; por isso a regra de "Hard Geometry Gate" (§6) é obrigatória para nunca deixar conteúdo vazar.
3. **`padding-bottom: 26mm`** — a "Footer Safe Zone" definida em `MD-CUTOVER-001 §13`: nenhum conteúdo de corpo pode invadir os últimos 26mm da folha, que são reservados ao `.report-footer-bar`.
4. **`page-break-after: always` / `break-after: page`** — cada `.report-a4-page` força quebra de página tanto na visualização de impressão (`window.print()`) quanto potencialmente em exportações baseadas em HTML.
5. Variante paisagem: `.report-a4-page.landscape { width: 297mm; height: 210mm; }` — usada para páginas de gráficos largos.

Existe uma folha equivalente para a capa, sem `padding-bottom` (a capa não tem rodapé numerado):
```css
.report-a4-cover {
  width: 210mm;
  height: 297mm;
  margin: 0 auto;
  background: white;
  position: relative;
  display: flex;
  flex-direction: column;
  box-shadow: none;
  border: none;
  color: hsl(220, 25%, 14%);
  overflow: hidden;
  box-sizing: border-box;
  page-break-after: always;
  break-after: page;
}
.report-a4-cover > * { position: relative; z-index: 1; }
```

## 6. Cabeçalho, corpo e rodapé de cada página
### 6.1 `.report-page-header`
```css
.report-page-header {
  display: flex;
  justify-content: flex-end;
  padding: 6mm 8mm 0;
  flex-shrink: 0;
}
```
Usado para posicionar o logotipo/numeração no topo direito de cada folha (não a capa).

### 6.2 `.report-page-body` — o "Hard Geometry Gate" (RP-06)
```css
.report-page-body {
  flex: 1;
  margin: 0 16mm;
  padding: 4mm 0 10mm 0;
  max-height: 245mm !important;
  min-height: 245mm;
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden !important; /* RP-06: Hard Geometry Gate */
}
```
Regras obrigatórias de replicação:
- Margens laterais fixas de **16mm** (`margin: 0 16mm`) — nunca usar `padding` lateral no lugar de `margin`, pois o cálculo de 245mm de altura útil pressupõe folha de 297mm menos 26mm de footer safe zone menos ~26mm de topo/margens (aprox. 297 − 26 − 26 = 245mm, conforme "MD-CUTOVER-001 §13" citado no CSS).
- **`max-height: 245mm !important`** e **`min-height: 245mm`** — a altura do corpo é FIXA, não elástica. Isso é o que garante paginação previsível: todo conteúdo deve ser calculado/planejado para caber dentro de 245mm ou disparar `pageBreakBefore` para outra folha.
- **`overflow: hidden !important`** é o "Hard Geometry Gate" (comentário `RP-06`): qualquer excesso de conteúdo é cortado silenciosamente na tela e no PDF rasterizado — por isso o `break-inside: avoid` em cartões (§7) é a única defesa contra corte no meio de um bloco.

### 6.3 §59 — Content Overflow Gate
```css
/* §59 — Content Overflow Gate: cartões e blocos editoriais nunca são cortados
   ao meio; quando não couberem, migram inteiros para a página seguinte. */
.report-page-body .card,
.report-page-body [data-report-card],
.report-page-body section,
.report-page-body table {
  break-inside: avoid;
  page-break-inside: avoid;
}
```
Interpretação de implementação: como não há "auto-flow" real de HTML para paginação em tela/PDF rasterizado (html2canvas página a página), a regra de negócio real é: **o componente React decide estaticamente em qual `.report-a4-page` cada bloco cai**; o CSS `break-inside: avoid` é a rede de segurança para os poucos cenários em que o `window.print()` (impressão nativa do browser) faz reflow real de HTML (targets `report-bex-container`, `report-kanitz-container`, `tab-graficos-container`, `gestor-ia-main-container` — ver §9).

### 6.4 `.report-footer-bar`
```css
.report-footer-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 18mm;
  border-top: 3px solid hsl(195, 53%, 50%);
  padding: 3mm 8mm;
  text-align: center;
  font-size: 9px;
  color: hsl(220, 10%, 46%);
  line-height: 1.5;
  background: white;
  z-index: 10;
}
```
O rodapé tem **18mm de altura absoluta**, ancorado a `bottom: 0` da folha, dentro da faixa de 26mm de `padding-bottom` da `.report-a4-page` — sobrando ~8mm de respiro entre o fim do `.report-page-body` (245mm) e o topo do `.report-footer-bar`.

## 7. Regras globais de "Keep Together"
```css
/* Global Pagination Safeties */
.report-card-keep-together, .card, .report-section {
  page-break-inside: avoid;
  break-inside: avoid;
}
```
A classe `.report-card-keep-together` é a convenção de projeto para marcar explicitamente, em JSX, qualquer bloco editorial que NUNCA pode ser cortado entre duas páginas (ex.: um card de "Continuidade Operacional" ou de "Pendência"). Regra reforçada em `@media print`:
```css
.report-card-keep-together {
  page-break-inside: avoid !important;
  break-inside: avoid !important;
  display: block;
  width: 100%;
}
```
E replicada também no pipeline de exportação PDF (ver MD-PORT-14, função `exportPdf`), onde cada `.report-card-keep-together, .card, section, .break-inside-avoid` dentro da página clonada recebe `breakInside='avoid'`/`pageBreakInside='avoid'` via JS antes da rasterização.

Comentário oficial no CSS (linha 186):
```css
/* MD-FINAL-RESIDUAL-001 §44..§47 — blocos editoriais não podem ser cortados entre páginas. */
.report-page-body .break-inside-avoid,
.report-a4-page .break-inside-avoid {
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
```
Regra de títulos que nunca ficam órfãos:
```css
.report-page-body h3,
.report-page-body h4 {
  break-after: avoid;
  page-break-after: avoid;
}
```
E em `@media print`, estendida a `h2`:
```css
.report-page-body h2, .report-page-body h3, .report-page-body h4,
.report-a4-page h2, .report-a4-page h3, .report-a4-page h4 {
  page-break-after: avoid !important;
  break-after: avoid !important;
}
```

## 8. Tipografia mínima e proibição de wrap letra-a-letra
Regra global aplicada a **todo** conteúdo dentro das folhas:
```css
.report-a4-page *, .report-a4-cover * {
  overflow-wrap: break-word;
  word-wrap: break-word;
  word-break: normal;   /* PROÍBE quebra letra-a-letra */
  hyphens: none;         /* PROÍBE hifenização automática */
}
```
Regra de tabela: `table-layout: fixed` obrigatório para todas as tabelas do relatório:
```css
table {
  table-layout: fixed;
  width: 100% !important;
  border-collapse: collapse;
}
```
Fonte mínima de células de tabela — **8.5pt**, nunca menor (requisito de legibilidade em impressão A4):
```css
th, td {
  word-break: normal;
  overflow-wrap: normal;
  hyphens: none;
  font-size: 8.5pt;
  line-height: 1.4;
  vertical-align: top;
  padding: 4pt 6pt;
}
```
Regra de linha de tabela — nunca cortar uma `<tr>` no meio entre páginas:
```css
tr {
  break-inside: avoid;
  page-break-inside: avoid;
}
```
Reforçada em `@media print` com `!important` e acrescida de repetição de cabeçalho de tabela em cada página impressa (`thead { display: table-header-group }`) e rodapé fixo (`tfoot { display: table-footer-group }`):
```css
.report-page-body thead,
.report-a4-page thead { display: table-header-group; }
...
.report-page-body tfoot,
.report-a4-page tfoot { display: table-footer-group; }
.report-page-body tr,
.report-a4-page tr {
  page-break-inside: avoid !important;
  break-inside: avoid !important;
}
```
**Checklist obrigatório de replicação (JSX/CSS)**:
- Nunca definir `font-size` inferior a 8.5pt em `td`/`th` de relatório.
- Nunca aplicar `word-break: break-all` ou `hyphens: auto` em conteúdo de relatório — isso quebraria a regra §8 e produziria wrap letra-a-letra, expressamente proibido.
- Sempre `table-layout: fixed` (nunca `auto`) em tabelas de relatório, para evitar reflow imprevisível de colunas.

## 9. `@page` e `@media print`
Definição do tamanho físico de página para impressão nativa/PDF via browser:
```css
@page {
  size: A4;
  margin: 0;
}
```
`margin: 0` é intencional — todo o espaçamento de página (16mm laterais, 26mm topo/rodapé) é feito via CSS interno de `.report-a4-page`/`.report-page-body`, não via margens de `@page`. Isso garante paridade entre o "preview em tela" e a "impressão real" (ver MD-PORT-14 §2 "Paridade Tela/Exportação").

Dentro de `@media print`, além das regras já citadas, `padding-top`/`padding-bottom` da folha são reforçados explicitamente:
```css
.report-a4-page {
  padding-top: 26mm !important;
  padding-bottom: 26mm !important;
}
```

### 9.1 Impressão seletiva por `data-print-target`
O mecanismo de impressão da plataforma (`printReport(containerId, reportTitle)` em `src/pages/Audit.tsx`) NÃO imprime a página inteira — ele:
1. Adiciona `document.body.classList.add('printing-report')`.
2. Define `document.body.setAttribute('data-print-target', containerId)`.
3. Chama `window.print()`.
4. Remove classe/atributo ao final.

O CSS correspondente esconde tudo por padrão e revela apenas o alvo:
```css
body.printing-report * { visibility: hidden !important; }
body.printing-report [id] { visibility: hidden !important; }
body.printing-report [id]:has(*),
body.printing-report [id] * { visibility: hidden !important; }

body[data-print-target="report-bex-container"] #report-bex-container,
body[data-print-target="report-bex-container"] #report-bex-container *,
body[data-print-target="report-kanitz-container"] #report-kanitz-container,
body[data-print-target="report-kanitz-container"] #report-kanitz-container *,
body[data-print-target="tab-graficos-container"] #tab-graficos-container,
body[data-print-target="tab-graficos-container"] #tab-graficos-container *,
body[data-print-target="gestor-ia-main-container"] #gestor-ia-main-container,
body[data-print-target="gestor-ia-main-container"] #gestor-ia-main-container * {
  visibility: visible !important;
}
```
E reposiciona o container revelado como bloco único absoluto ocupando a página:
```css
body.printing-report .bex-results-wrapper,
body.printing-report [id="report-bex-container"],
body.printing-report [id="report-kanitz-container"],
body.printing-report [id="tab-graficos-container"],
body.printing-report [id="gestor-ia-main-container"] {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  background: white !important;
  padding: 20px !important;
  border-radius: 0 !important;
  margin: 0 !important;
  z-index: 9999 !important;
}
```
Regra específica para o painel de gráficos: força ambas as abas internas (Auditoria + Parecer Contábil) visíveis mesmo se inativas no Radix Tabs, e esconde a lista de abas:
```css
body[data-print-target="tab-graficos-container"] #tab-graficos-container [role="tabpanel"][hidden],
body[data-print-target="tab-graficos-container"] #tab-graficos-container [role="tabpanel"][data-state="inactive"] {
  display: block !important;
  visibility: visible !important;
}
body[data-print-target="tab-graficos-container"] #tab-graficos-container [role="tablist"] {
  display: none !important;
}
```
E a capa de impressão do painel de gráficos:
```css
body[data-print-target="tab-graficos-container"] .bex-print-cover {
  display: flex !important;
  page-break-after: always;
  break-after: page;
}
```
Mantém título+gráfico juntos:
```css
body[data-print-target="tab-graficos-container"] #tab-graficos-container .recharts-responsive-container,
body[data-print-target="tab-graficos-container"] #tab-graficos-container [class*="rounded-xl"],
body[data-print-target="tab-graficos-container"] #tab-graficos-container [class*="rounded-lg"] {
  page-break-inside: avoid !important;
  break-inside: avoid !important;
}
body[data-print-target="tab-graficos-container"] #tab-graficos-container h2,
body[data-print-target="tab-graficos-container"] #tab-graficos-container h3 {
  page-break-after: avoid !important;
  break-after: avoid !important;
}
```

### 9.2 Ocultar elementos `print:hidden`
```css
body.printing-report .print\:hidden,
body.printing-report [class*="print:hidden"] {
  display: none !important;
  visibility: hidden !important;
}
```
Convenção de projeto: qualquer botão de ação, badge de debug ou UI de edição que não deve aparecer no PDF/impressão recebe a classe utilitária Tailwind `print:hidden` (ex.: `<Button className="print:hidden">Exportar</Button>`).

## 10. Watermark (`--report-watermark`)
Cada folha de capa (e algumas folhas de relatório) recebe a imagem de fundo institucional via CSS custom property, definida inline em JSX:
```tsx
<div className="report-a4-cover" style={{ "--report-watermark": `url(${folhaRostoBg})` } as React.CSSProperties}>
```
Ocorrências reais em `src/pages/Audit.tsx`:
- Linha 2454: `<div className={`report-a4-page ${className}`} style={{ "--report-watermark": `url(${folhaRostoBg})` } ...}>` (wrapper genérico de página).
- Linha 2812: contêiner raiz do relatório BEx (`id="report-bex-container"`).
- Linha 2853: capa do relatório BEx (`report-a4-cover`).
- Linha 3575: segunda capa (Kanitz/painel intermediário).
- Linha 4003: contêiner raiz do relatório Kanitz (`id="report-kanitz-container"`).
- Linha 4044: capa do relatório Kanitz.

`folhaRostoBg` é importado de `src/assets/folha-rosto-bex.jpg` (linha 7 de `Audit.tsx`): `import folhaRostoBg from "@/assets/folha-rosto-bex.jpg";`.

**Observação de implementação**: no CSS atual (`src/index.css`), a regra `.report-page-body::before { content: none; }` está presente e DESATIVA qualquer pseudo-elemento de watermark dentro do corpo da página — ou seja, o custom property `--report-watermark` é hoje **apenas consumido diretamente pelo componente de capa** (fundo de imagem posicionado via `background-image` inline/`style`), não por um `::before` genérico. Ao portar, não reintroduzir um `::before` global usando essa variável sem revalidar o "Hard Geometry Gate" (§6.2), pois isso poderia introduzir uma camada extra sujeita a overflow.

## 11. Capa e metadados da empresa
### 11.1 Estrutura da capa
A capa (`report-a4-cover`) é composta por:
- Imagem de fundo institucional (`folhaRostoBg`), aplicada via `--report-watermark`.
- Logotipo (`logoBrasilExpertFull` — `marca_logo_BEx.jpeg` — ou `logoBexBranco` — `logo-bex-branco.jpeg`, conforme contraste do fundo).
- Bloco central com título do relatório ("RELATÓRIO DE AUDITORIA CONTÁBIL-FINANCEIRA BEx" ou equivalente Kanitz).
- Bloco de metadados da empresa (ver §11.2).
- Rodapé de assinatura institucional (ex.: "© 2026 BRASIL EXPERT • Business Extended Analysis").

### 11.2 Metadados da empresa — regra de proibição de "nome analítico"
A capa e os cabeçalhos de página exibem exclusivamente o **nome comercial/razão social sintética** da empresa (campo canônico de `companiesService.getCompany`), **NUNCA** um "nome analítico" — entendido como qualquer rótulo derivado de uma conta contábil analítica ou de uma descrição bruta extraída do balancete (ex.: "1.1.1.01.0001 - CAIXA GERAL MATRIZ" não pode aparecer como identificação da empresa; apenas o campo cadastral oficial de nome/razão social pode).

Regra de implementação:
- O componente de capa consome **apenas** os campos de identidade oficial retornados por `getCompany(companyId)` (tipo `Company`, importado de `@/services/companiesService` — linha 6 de `Audit.tsx`): nome/razão social, CNPJ, período/competência.
- Nenhum campo de `BSDadosRow`, `ParsedFinancialData.balanco[].descricao` ou `documentInfo.empresa` (que pode conter texto livre extraído por OCR/IA) deve alimentar diretamente o título da capa sem passar por normalização cadastral — isso evita que uma extração ruim de PDF ("EMPRESA XPTO CONTA ANALITICA 1.1.1") vaze para o nome oficial impresso no relatório.
- O relatório técnico de fórmulas (`ReportFormulas.tsx`) segue a mesma regra: recebe `companyName`/`cnpj` como props explícitas (linhas 19-24), nunca deriva o nome da empresa de uma linha de balancete.

### 11.3 Bloco de metadados replicável (padrão usado em `ReportFormulas.tsx`)
```tsx
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
```
Esse padrão (grid de 2 colunas rótulo/valor, rótulo em `uppercase` cinza, valor em preto/negrito) deve ser reutilizado em toda capa de relatório para consistência visual entre BEx, Kanitz e Fórmulas Técnicas.

## 12. Estrutura de seções do relatório BEx
Com base em `src/pages/Audit.tsx`, o relatório BEx (`id="report-bex-container"`) é montado como uma sequência de `.report-a4-cover`/`.report-a4-page` na seguinte ordem lógica (trecho relevante em torno da linha 2447):
1. **Capa** (`report-a4-cover`) — título, empresa, período, watermark.
2. **Sumário/Metodologia** — inclui a listagem de seções técnicas, ex.: item "5 — Análise Técnica Automatizada" (`{ num: "5", title: "Análise Técnica Automatizada", desc: "Estrutura de capital, dependência de terceiros, capacidade de pagamento e deterioração financeira", icon: Search }`).
3. **Resumo Executivo** — narrativa determinística (`resumo`) ligada aos fatos oficiais (ver MD-PORT-12).
4. **Achados/Problemas** — lista de itens tipados (`tipo`, `gravidade`, `conta`, `problema`, `fundamentacao`, `risco`, `impacto`, `recomendacao`), como o item `p4` (Empréstimos LP) na linha 1588.
5. **Indicadores de Liquidez** — narrativa gerada a partir de `latestInd.liquidezCorrente`, `ac`, `pc` (linha 3020).
6. **Endividamento/Dívida Onerosa** — narrativa sobre `emprestimos` (linha 3440).
7. **Regras especiais de paginação**: as **páginas 3 e 4** (índice `idx === 2` e `idx === 3`, base 0) do BEx recebem forçosamente `pageBreakBefore: 'always'` no pipeline de exportação (`exportPdf`), conforme comentário `§42..§43 — Regras especiais para Páginas 3 e 4 do BEx`.

## 13. Estrutura de seções do relatório Kanitz
Contêiner `id="report-kanitz-container"` (linha 4003), com:
1. **Capa Kanitz** (`report-a4-cover`, linha 4044) — mesma convenção de metadados (§11.2).
2. **Classificação por FI (Fator de Insolvência)** — narrativa condicional em 3 faixas:
   - FI > 0 → "SAUDÁVEL" (linha 4118).
   - -3 < FI ≤ 0 → faixa intermediária de atenção.
   - FI ≤ -3 → "ALTA PROBABILIDADE DE INSOLVÊNCIA" com citação legal (linha 4125): *"Recomenda-se análise de viabilidade conforme Lei 11.101/2005."*
3. **Regra de não publicação de FI espúrio**: helper `fiFmt`:
```ts
/** §47/§48 — FI nunca é publicado como 0.00 ou NaN: quando indisponível/inaplicável, é "N/A". */
const fiFmt = (fi?: number | null, aplicavel: boolean = true) =>
  aplicavel && typeof fi === "number" && Number.isFinite(fi) ? fi.toFixed(4) : "N/A";
```
Ao portar o renderer, esse helper deve ser preservado literalmente — a plataforma **nunca** imprime `0.00`/`NaN` para o Fator de Insolvência; sempre `N/A` quando indisponível ou inaplicável (PL ≤ 0 — ver `ReportFormulas.tsx`: *"Se PL ≤ 0, K = N/A. O modelo é substituído pelo ISG..."*).
4. **Liquidez detalhada** (linha 3777) — narrativa cruzando `liquidezCorrente` e `liquidezGeral`.
5. **Capital de giro** (linha 4333) — narrativa de "Estrangulamento financeiro" quando capital de giro é negativo.

## 14. Checklist de Implementação
- [ ] `.report-a4-page`/`.report-a4-cover` com 210mm×297mm exatos, `overflow: hidden`, `box-sizing: border-box`.
- [ ] `.report-page-body` com `margin: 0 16mm`, `max-height`/`min-height: 245mm !important/245mm`, `overflow: hidden !important`.
- [ ] `padding-bottom: 26mm` na `.report-a4-page` (Footer Safe Zone).
- [ ] `.report-footer-bar` com `height: 18mm`, `position: absolute; bottom: 0`.
- [ ] `table-layout: fixed` em toda tabela de relatório; `th/td` com `font-size: 8.5pt` (nunca menor).
- [ ] `word-break: normal; hyphens: none` em `.report-a4-page *`/`.report-a4-cover *` — nunca `break-all`/`hyphens: auto`.
- [ ] Classe `.report-card-keep-together` aplicada a todo bloco editorial crítico (Continuidade Operacional, Pendências) + `break-inside: avoid`/`page-break-inside: avoid`.
- [ ] `@page { size: A4; margin: 0; }` — margens só via CSS interno, nunca via `@page`.
- [ ] Mecanismo `printReport(containerId, reportTitle)` com `body.printing-report` + `data-print-target` fiel ao original.
- [ ] Capa consumindo exclusivamente campos oficiais de `Company` (nome/razão social, CNPJ) — jamais texto analítico de conta contábil.
- [ ] Watermark aplicado via custom property `--report-watermark` setada inline por página de capa, usando `folha-rosto-bex.jpg`.
- [ ] Helper `fiFmt` preservado — FI nunca publicado como `0.00`/`NaN`.
- [ ] Páginas 3 e 4 do BEx com `pageBreakBefore: always` no pipeline de exportação.

## 15. Critérios de Homologação
1. **Geometria**: renderizar as 4 primeiras páginas do relatório BEx e medir (inspeção de DOM/CSS computado) que cada `.report-a4-page` tem exatamente 210mm×297mm e que `.report-page-body` nunca excede 245mm de altura.
2. **Corte de conteúdo**: nenhum cartão com classe `.report-card-keep-together`/`.card` pode aparecer visualmente cortado entre duas folhas no PDF exportado nem na impressão nativa.
3. **Tipografia**: nenhuma célula de tabela do relatório deve ter fonte computada menor que 8.5pt; inspecionar `getComputedStyle` em amostra de tabelas (BEx, Kanitz, Fórmulas).
4. **Proibição de wrap letra-a-letra**: strings longas sem espaços (ex.: um CNPJ formatado ou um nome longo de conta) não podem ser fragmentadas caractere-a-caractere; validar visualmente que a quebra ocorre apenas entre palavras.
5. **Nome analítico**: em ao menos 3 cenários de OCR malformado (descrição de conta poluída), a capa deve exibir o nome cadastral oficial da empresa, nunca a string extraída do balancete.
6. **Watermark**: a capa deve exibir a imagem de `folha-rosto-bex.jpg` de forma consistente entre tela, impressão e PDF exportado (comparação pixel-a-pixel tolerável a compressão JPEG).
7. **Impressão seletiva**: acionar `printReport('tab-graficos-container', ...)` e confirmar que apenas esse container fica visível, com ambas as abas do painel renderizadas (mesmo a inativa) e a lista de abas oculta.
8. **FI nunca espúrio**: em cenário de PL ≤ 0, o relatório Kanitz deve exibir `N/A` para o FI, nunca `0.0000`.
