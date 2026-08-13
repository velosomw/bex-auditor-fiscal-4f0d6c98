# MD-PORT-05 — Parser de Balancete (PDF/XLSX) e Detecção de Competência (BEx Platform)

## 1. Objetivo
Especificar, com precisão de porte 1:1, todo o pipeline determinístico de leitura de arquivos de balancete (PDF e XLSX), normalização de descrições e códigos contábeis, o algoritmo `inferRefByCode` completo (tabela de referências REF_BY_PREFIX), a estratégia de detecção de competência mensal na ordem **nome do arquivo → colunas/cabeçalho → fallback**, o `mesNormalizer` (single source of truth de período), deduplicação por `content_hash`, e o mapeamento final de campos para as tabelas `balancete_lines`, `balancete_consolidado` e `bs_dados`.

## 2. Escopo e Arquivos-Fonte
- `src/services/auditMonthDetector.ts` — detecção/consolidação de meses.
- `src/services/mesNormalizer.ts` — normalização canônica `YYYY-MM`.
- `src/services/balanceteChartsParser.ts` — parser fixo (por posição) do template `.xlsm` "Dados para Gráficos".
- `src/services/auditAIService.ts` — `parseSpreadsheet`, `tryParseBalanceteMensalBR`, `inferRefByCode`, `REF_BY_PREFIX`.
- `src/services/p1SyntheticResolver.ts` — `normalizeAccountCode` (autoridade P1/P2/P3).
- `src/services/bsDadosBuilder.ts` — `REF1_MAP`, `FALLBACK_PATTERNS`, `emptyRow`.
- `supabase/functions/audit-parse-pdf/index.ts` — extração multimodal (Gemini) para PDF/DOCX/dados estruturados.
- `supabase/functions/audit-bs-dados/index.ts` + `core.ts` — consolidação backend autoritativa.

## 3. Leitura de Arquivo — PDF vs XLSX

### 3.1 Roteamento por extensão (`auditAIService.ts`)
```ts
const SPREADSHEET_EXTENSIONS = [".xlsx", ".xls", ".csv", ".xlsm", ".xlsb", ".xltx", ".xltm"];
const PDF_EXTENSIONS = [".pdf"];
const DOCUMENT_EXTENSIONS = [".docx", ".doc", ".txt", ".rtf"];
const DATA_EXTENSIONS = [".json", ".xml", ".ofx", ".sped"];

export async function parseFile(file: File, documentId?: string): Promise<ParsedFinancialData> {
  if (isPDF(file) || isDocument(file)) return parseDocumentAI(file, documentId);
  if (isDataFile(file)) return parseDataFileAI(file);
  return parseSpreadsheet(file);
}
```
- **PDF/DOCX/DOC/TXT/RTF** → `parseDocumentAI` → converte para base64 (`fileToBase64`) e envia para a edge function `audit-parse-pdf`, que usa modelo multimodal (Gemini, roteado por `selectModel("ocr_parse", "medium")`) para extrair JSON estruturado.
- **JSON/XML/OFX/SPED** → `parseDataFileAI` → mesmo pipeline de IA, prompt adaptado para dados estruturados (ver `EXTRACTION_PROMPT`, blocos OFX `BANKTRANLIST`, SPED `I150/I155`/`I350/I355`).
- **XLSX/XLS/CSV/XLSM/XLSB/XLTX/XLTM** → `parseSpreadsheet` → parser 100% determinístico (sem IA), usando `readWorkbook` (`src/lib/excelReader.ts`) para converter cada aba em matriz `unknown[][]` (`sheetToMatrix`).

### 3.2 `audit-parse-pdf` — extração multimodal
Payload de entrada:
```json
{ "fileBase64": "<base64>", "fileName": "Balancete Mar 2024.pdf", "mimeType": "application/pdf", "documentId": "uuid-opcional" }
```
Prompt de sistema (`EXTRACTION_PROMPT`) força saída EXCLUSIVAMENTE em JSON:
```json
{
  "pdfType": "PDF/A-1",
  "documentInfo": { "empresa": "ACME LTDA", "periodo": "Março/2024", "tipo": "balancete" },
  "years": ["2023", "2022"],
  "balanco": [ { "conta": "1", "descricao": "ATIVO TOTAL", "values": {"2023": 1000000, "2022": 900000} } ],
  "dre": [ { "conta": "3.01", "descricao": "RECEITA LÍQUIDA", "values": {"2023": 500000, "2022": 450000} } ]
}
```
Reparo de JSON truncado/malformado (`extractAndRepairJson`): (1) remove cercas ```` ```json ````; (2) corrige vírgulas penduradas (`,}` `,]`) e caracteres de controle; (3) se ainda inválido, faz *bracket balancing* caractere-a-caractere respeitando strings/escapes, localiza o último ponto de corte seguro (`}`, `]`, `"`) acima de 50% do texto, fecha chaves/colchetes pendentes e tenta novamente. Se tudo falhar, lança `"Não foi possível extrair JSON válido da resposta da IA."`.

Cálculo de `ocr_score` (`computeOcrScore`): base `0.5`, + `0.15` se houver `balanco`, `+0.10` se houver `dre`, `+0.05` se houver `years`, `+0.05` se houver `documentInfo` não vazio, `+0.10` se total de linhas (`balanco.length+dre.length`) `> 30`, `+0.05` se `> 80`; clamp final em `[0,1]`.

Persistência best-effort em `ocr_results` (não bloqueia a resposta): valida existência do `documentId` em `pipeline_documents`, insere `{ document_id, provider:"lovable_ai_gemini", ocr_score, raw_text: JSON.stringify(extracted).slice(0,20000), structured_json: extracted }`.

Resposta HTTP: `{ extracted, ocr_score, persisted }` (200) ou `{ error }` (400/402/429/500 conforme o caso — `402` = créditos insuficientes do gateway, `429` = rate limit).

### 3.3 `parseSpreadsheet` — parser determinístico XLSX
Fluxo (`auditAIService.ts`):
1. `readWorkbook(buffer)` → `{ sheetNames, sheetToMatrix }`.
2. Para cada aba candidata, tenta `tryParseBalanceteMensalBR(jsonData, fileName)` — parser especializado em balancetes brasileiros no formato "1 balancete por planilha ou 1 balancete multi-mês por colunas".
3. Se nenhuma aba casar com o padrão especializado, cai no parser genérico por heurística de cabeçalho (busca de colunas por nome aproximado).

#### 3.3.1 Detecção de cabeçalho (`tryParseBalanceteMensalBR`)
Varre até as primeiras 15 linhas procurando uma linha que contenha simultaneamente:
- `"saldo atual"` OU `=== "saldo final"` (case-insensitive, trim); **e**
- uma coluna de descrição: começa com `"descri"` OU é exatamente `"extenso"`.

Ao encontrar, mapeia colunas por nome exato/prefixo:
```ts
if (c === "extenso" || c === "código" || c === "codigo" || c === "conta") cols.conta = j;
else if (c === "reduzido") cols.reduzido = j;
else if (c.startsWith("descri")) cols.descricao = j;
else if (c.includes("saldo anterior")) cols.saldoAnterior = j;
else if (c === "débito" || c === "debito") cols.debito = j;
else if (c === "crédito" || c === "credito") cols.credito = j;
else if (c.includes("saldo mês") || c.includes("saldo mes") || c.includes("movimento")) cols.saldoMes = j;
else if (c.includes("saldo atual") || c === "saldo final") cols.saldoAtual = j;
```
Defaults: `cols.conta ?? 0`, `cols.descricao ?? 1`. Se `cols.saldoAtual` continuar `undefined`, a função retorna `null` (não é um balancete BR reconhecível — cai no parser genérico).

#### 3.3.2 Detecção multi-mês por colunas (cenário B)
Antes de extrair linhas, procura colunas de mês adicionais examinando a própria linha de cabeçalho e até 2 linhas acima (`headerIdx-1`, `headerIdx-2`) — templates BEX costumam ter o rótulo do mês (`JAN/2024`, `01/2024`) numa linha logeticamente acima do cabeçalho técnico (`Saldo Atual`). Usa `detectMonthFromYearLabel` (ver §5) com corte de confiança `>= 0.8`. Se `monthCols.length > 0`, o modo é `useMultiMonth = true` e cada linha emite um objeto `values: { [mesKey]: saldo, ... }` para todas as colunas de mês simultaneamente; senão, emite `values: { [periodLabel]: saldoAtual }` com um único período (rótulo derivado do nome do arquivo/aba).

#### 3.3.3 Resolução de `ref1` por linha
```ts
const ref1 = grupoCanonico ?? inferRefByCode(conta, desc);
```
`grupoCanonico` é preenchido quando a própria planilha já expõe uma coluna "Ref 1"/"Grupo BEX" explícita; na ausência, cai para `inferRefByCode` (§4).

#### 3.3.4 Captura heurística de metadados (empresa)
```ts
if (!tplInternal.documentInfo?.empresa && (desc.includes("LTDA") || desc.includes("S/A") || desc.includes("S.A.")) && desc.length > 5 && desc.length < 100) {
  tplInternal.documentInfo.empresa = desc;
}
```
Captura o primeiro texto de linha que pareça razão social (contém sufixo societário e tamanho plausível 6-99 chars).

## 4. Normalização de Códigos de Conta

### 4.1 `normalizeAccountCode` (`p1SyntheticResolver.ts`)
Converte qualquer formato de código contábil em uma chave hierárquica sem zeros à esquerda, usada como identidade única na árvore de contas:
```ts
export function normalizeAccountCode(code: string): string {
  const raw = String(code || "").trim();
  if (!raw) return "";
  const segments = raw.includes(".") ? raw.split(".") : raw.split(/[\-\/]/);
  return segments
    .map(s => s.replace(/[^\d]/g, ""))
    .filter(s => s.length > 0)
    .map(s => String(parseInt(s, 10)))
    .join(".");
}
```
Exemplos:
- `"2.03.001"` → `"2.3.1"`
- `"01.01.02"` → `"1.1.2"`
- `"2110102026"` (sem separador nem ponto, código plano) → `"2110102026"` (segmento único, sem zeros à esquerda — permanece monolítico; **não** deve ser confundido com ano, ver §5.3 guard anti-alucinação).
- `"111-05"` → `"111.5"`

`levelOf(norm)` = `norm.split(".").length` (nível hierárquico); `parentOf(norm)` = todos os segmentos menos o último, unidos por `.` (ou `null` se raiz).

### 4.2 `inferRefByCode` — tabela completa `REF_BY_PREFIX` (`auditAIService.ts`)
Classificador genérico por prefixo de código (aplicado **após** remover pontos/espaços: `code.replace(/[\s.]/g, "")`). Princípio: 1º dígito = natureza (1 Ativo, 2 Passivo, 3-8 DRE); 2º dígito = grupo; ordem de avaliação importa (padrões mais específicos primeiro, `Array` percorrido em sequência com `.test()`, primeiro match vence).

```ts
const REF_BY_PREFIX: Array<[RegExp, string]> = [
  // ── ATIVO CIRCULANTE ──
  [/^111/,   "A"],   // Bens e Numerários / Caixa / Disponível
  [/^1111/,  "C"],   // Clientes (planos onde 111x = clientes)
  [/^112/,   "C"],   // Clientes / Contas a Receber (padrão Giannini)
  [/^113/,   "D"],   // Estoques
  [/^114/,   "E"],   // Tributos a Recuperar / Outros Valores a Receber
  [/^115/,   "F"],   // Adiantamentos / Valores a Recuperar
  [/^116/,   "G"], [/^117/, "G"], [/^118/, "G"], [/^119/, "G"],
  [/^11/,    "AC_TOTAL"],  // linha-totalizadora Ativo Circulante
  // ── ATIVO NÃO CIRCULANTE ──
  [/^121/,   "P"],   // Realizável a Longo Prazo
  [/^122/,   "Q"],   // Investimentos
  [/^123/,   "R"],   // Imobilizado
  [/^124/,   "S"],   // Intangível
  [/^12/,    "ANC_TOTAL"],
  [/^131/,   "C1"], [/^132/, "D1"], [/^13/, "C1"],  // Ativo Permanente (não compõe ANC)
  // ── PASSIVO CIRCULANTE ──
  [/^211/,   "BB"],           // Fornecedores EXPLÍCITO
  [/^21[2-9]/, "PC_COMPONENT"],   // resolve por descrição (classifyPCByDescription)
  [/^21/,    "PC_TOTAL"],
  // ── PASSIVO NÃO CIRCULANTE ──
  [/^22[1-9]/, "PNC_COMPONENT"],  // resolve por descrição (classifyPNCByDescription)
  [/^22/,    "PNC_TOTAL"],
  // ── PATRIMÔNIO LÍQUIDO ──
  [/^231/,   "GG1"], [/^232/, "HH1"], [/^233/, "HH1"], [/^234/, "HH1"],
  [/^23/,    "PL_TOTAL"],
  [/^24/,    "GG1"],
  // ── DRE (raízes bare são ignoradas para não duplicar somas) ──
  [/^3$/,    "DRE_ROOT_IGNORE"], [/^4$/, "DRE_ROOT_IGNORE"], [/^5$/, "DRE_ROOT_IGNORE"],
  [/^6$/,    "DRE_ROOT_IGNORE"], [/^7$/, "DRE_ROOT_IGNORE"], [/^8$/, "DRE_ROOT_IGNORE"],
  [/^31/,    "RECEITA"],
  [/^32/,    "DEDUCOES_RECEITA"], [/^33/, "DEDUCOES_RECEITA"],
  [/^4/,     "CMV"],
  [/^5/,     "CMV"],          // Custo Industrial → CMV
  [/^6/,     "DESPESAS"],     // Despesas Operacionais
  [/^7/,     "DESPESAS_FIN"], // Despesas/Receitas FINANCEIRAS
  [/^8/,     "DESPESAS_NOP"], // Despesas/Receitas NÃO Operacionais
];

export function inferRefByCode(code: string, descricao?: string): string | undefined {
  if (!code) return undefined;
  const c = String(code).replace(/[\s.]/g, "");
  for (const [pattern, ref] of REF_BY_PREFIX) {
    if (pattern.test(c)) {
      if (ref === "PC_COMPONENT") return classifyPCByDescription(descricao || "");
      if (ref === "PNC_COMPONENT") return classifyPNCByDescription(descricao || "");
      if (ref === "DRE_ROOT_IGNORE") return "__IGNORE__";
      return ref;
    }
  }
  return undefined;
}
```

Sub-classificadores textuais (aplicados quando o código sozinho é ambíguo entre planos de contas diferentes):
```ts
function classifyPCByDescription(desc: string): string {
  const d = stripAccents(desc);
  if (/credores?\s+rj|recuperacao\s+judic/.test(d)) return "II";
  if (/emprestim|financiament|instituic[oõ]es?\s+financ|deb[eê]ntures?|leasing|arrendament/.test(d)) return "AA";
  if (/sal[aá]ri|f[eé]rias|13[ºo°]|d[eé]cimo\s+terceiro|inss|fgts|trabalhi|encargos\s+soci|provis[aã]o.*f[eé]ria/.test(d)) return "CC";
  if (/tribut|imposto|icms|iss|pis|cofins|irpj|csll|simples|parcelament|refis/.test(d)) return "DD";
  return "JJ"; // Outras Obrigações (resíduo do PC)
}
function classifyPNCByDescription(desc: string): string {
  const d = stripAccents(desc);
  if (/credores?\s+rj|recuperacao\s+judic/.test(d)) return "CC1";
  if (/emprestim|financiament|instituic[oõ]es?\s+financ|deb[eê]ntures?|leasing|arrendament/.test(d)) return "QQ";
  if (/tribut|imposto|parcelament|refis/.test(d)) return "RR";
  if (/\bfornecedor/.test(d)) return "PP";
  return "DD1";
}
```
**Regra crítica de fix histórico:** "211" (Fornecedores) NUNCA é resolvido por descrição — apenas por código explícito. Isso evita que outras contas do range `212-219` "roubem" o bucket `BB` (fornecedores) só por conterem a palavra "fornecedor" em texto livre acidental.

### 4.3 `REF1_MAP` — mapeamento Ref-1 → campo `BSDadosRow` (`bsDadosBuilder.ts`)
Tabela completa das 47+ referências BEX (Ref Capital) para os campos finais da linha consolidada. Trechos relevantes (ver arquivo fonte para a lista integral):
```ts
export const REF1_MAP: Record<string, keyof BSDadosRow> = {
  "A": "disponivel", "B": "disponivel", "C": "ativo_circulante", "D": "estoques",
  "E": "ativo_circulante", /* ...F..O */ "ativo_circulante",
  "P": "ativo_nao_circulante", /* ...Q..J1 */ "ativo_nao_circulante",
  "C1": "ativo_nao_circulante", "D1": "ativo_nao_circulante",
  "AA": "divida_financeira", "BB": "fornecedores", "CC": "divida_trabalhista",
  "DD": "divida_tributaria", "II": "credores_rj", "JJ": "outras_obrigacoes",
  "PP": "fornecedores", "QQ": "divida_financeira", "RR": "divida_tributaria",
  "CC1": "credores_rj",
  "GG1": "patrimonio_liquido", "HH1": "patrimonio_liquido",
  "RESULTADO": "resultado_acumulado", "RESULTADO_MES": "resultado_competencia",
  "ADIANTAMENTOS": "advances_to_third_parties", "ADVANCES": "advances_to_third_parties",
  "AC_TOTAL": "ativo_circulante", "ANC_TOTAL": "ativo_nao_circulante",
  "PC_TOTAL": "passivo_circulante", "PNC_TOTAL": "passivo_nao_circulante", "PL_TOTAL": "patrimonio_liquido",
  "DESPESAS_FIN": "despesas_financeiras", "RECEITAS_FIN": "receitas_financeiras",
  "DESPESAS_NOP": "outras_nao_operacionais",
  "RECEITA": "receita_liquida", "RECEITA BRUTA": "receita_liquida",
  "CMV": "cmv", "DESPESAS": "despesas", "DESPESA": "despesas",
  // + ~25 aliases textuais para "ATIVO CIRCULANTE", "PASSIVO NAO CIRCULANTE",
  // "PATRIMONIO LIQUIDO", "ESTOQUES", "DISPONIVEL", "FORNECEDORES",
  // "CREDORES RJ", "RECUPERACAO JUDICIAL", etc. (fallback quando ref1 chega como texto e não como código de letra).
};
```
`"RESULTADO"`/`"RESULTADO_MES"`/`"ADIANTAMENTOS"`/`"ADVANCES"` e `"*_TOTAL"` são chaves sintéticas emitidas internamente pelo motor (não vêm diretamente do balancete bruto) quando uma linha-totalizadora do template BEX é detectada.

### 4.4 `FALLBACK_PATTERNS` — regex por campo quando não há Ref 1
Usado quando o balancete não traz Ref 1 explícito nem código reconhecível por `inferRefByCode`. Ordem importa — mais específico primeiro:
```ts
const FALLBACK_PATTERNS: Partial<Record<keyof BSDadosRow, RegExp | null>> = {
  despesas_financeiras: /\b(?:despesas?\s+financeir|juros\s+(?:passivo|pagos?|sobre)|encargos\s+financeir|varia[cç][oõ]es\s+monet[aá]rias?\s+passiv)/i,
  receitas_financeiras: /\b(?:receitas?\s+financeir|juros\s+(?:ativo|recebidos?|aufer)|rendimentos?\s+de\s+aplica)/i,
  depreciacao: /\bdeprecia[cç][aã]o\b/i,
  amortizacao: /\bamortiza[cç][aã]o\b/i,
  cmv: /\bc(?:mv|sv|pv)\b|\bcusto\s+(?:das?\s+)?(?:mercadoria|servi[cç]o|produto|venda)/i,
  receita_liquida: /\breceita.*l[ií]quid|venda.*l[ií]quid\b/i,
  resultado: /\b(?:lucro|preju[ií]zo|resultado)\s+(?:l[ií]quid|do\s+exerc|do\s+per[ií]odo)/i,
  despesas: /\bdespesa|gasto\s+oper/i,
  estoques: /\bestoqu/i,
  disponivel: /\b(?:caixa|disponibilidade|disponivel|bancos?|aplica[cç][aã]o\s+financ|equivalente)/i,
  contas_receber: /\b(?:contas?\s+a\s+receber|duplicatas?\s+a\s+receber|clientes)\b/i,
  imobilizado: /\b(?:imobilizado|m[aá]quina|equipamento|ve[ií]culo|edifica[cç][oõ]es|terreno)\b/i,
  intangivel: /\bintang[ií]vel|marca\s+e\s+patent|software\b/i,
  investimentos: /\b(?:investiment[oa]s?\s+em|participa[cç][oõ]es?\s+societ|coligad|controlad)/i,
  ativo_nao_circulante: /\bativo\s+n[aã]o[\s-]?circulante|ativo\s+permanente/i,
  realizavel_longo_prazo: /\brealiz[aá]vel\s+a?\s*longo\s+prazo\b/i,
  ativo_circulante: /\bativo\s+circulante\b/i,
  divida_tributaria: /\b(?:tribut|impostos?\s+a\s+(?:pagar|recolher)|icms|iss|pis|cofins|irpj|csll)/i,
  divida_trabalhista: /\b(?:sal[aá]rios?\s+a\s+pagar|f[eé]rias|13[ºo°]?|inss\s+a\s+pagar|fgts\s+a\s+pagar|encargos\s+sociais|trabalhista)/i,
  divida_financeira: /\b(?:empr[eé]stimos?|financiamentos?|deb[eê]ntures?|leasings?|arrendamentos?|cedula\s+de\s+credito|capital\s+de\s+giro|obriga[cç][oõ]es\s+financeir)/i,
  fornecedores: /\bfornecedor/i,
  credores_rj: /\b(?:credores?\s+(?:rj|recupera[cç][aã]o)|recupera[cç][aã]o\s+judic)/i,
  passivo_nao_circulante: /\bpassivo\s+n[aã]o[\s-]?circulante|exig[ií]vel\s+a?\s*longo\s+prazo\b/i,
  passivo_circulante: /\bpassivo\s+circulante\b/i,
  patrimonio_liquido: /\b(?:patrim[oô]nio\s+l[ií]quido|capital\s+social|lucros?\s+acumulad|preju[ií]zos?\s+acumulad|reservas?\s+de\s+(?:capital|lucros?))\b/i,
};
```

## 5. Detecção de Competência — Ordem de Prioridade

A resolução do mês (`YYYY-MM`) de cada balancete segue **sempre** esta ordem, implementada em `relabelYearsAsMonths` (`auditMonthDetector.ts`):

1. **Nome do arquivo** (`detectMonthFromFilename` / `detectMonthRangeFromFilename`) — maior confiança quando aplicável a documentos de período único; usada como *fallbackMonth* para rótulos ambíguos como "atual".
2. **Colunas/cabeçalho da planilha** (`extractColumnMonths` / `detectMonthFromYearLabel` sobre `parsed.years`) — prioridade quando o arquivo é multi-mês (cenário B), pois cada coluna já declara seu próprio período.
3. **Fallback** — mês corrente do sistema (`new Date()`), confiança `0.3-0.4`, usado apenas quando nenhuma evidência textual está disponível.

### 5.1 `detectMonthFromFilename` — regex reais e exemplos
```ts
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[_\-.]/g, " ").replace(/\s+/g, " ").trim();
```
Padrão 1 — `"balancete 03 2024"`, `"03/2024"`, `"03-24"`:
```ts
/(?:^|\s)(0?[1-9]|1[0-2])[\s/\-](20\d{2}|\d{2})(?:\s|$)/
```
Exemplo: `"Balancete_03-2024.xlsx"` → normalizado `"balancete 03 2024"` → match `["03","2024"]` → `key="2024-03"`, `confidence=0.9`, `source="filename"`.

Padrão 2 — `"2024 03"`, `"2024-03"`:
```ts
/(20\d{2})[\s/\-](0?[1-9]|1[0-2])(?:\s|$)/
```

Padrão 3 — nome do mês por extenso/abreviado, ex. `"balancete jan 2024"`, `"fev/24"`, `"setembro-25"`:
```ts
const monthRe = Object.keys(MONTH_NAMES_PT).join("|");
new RegExp(`(${monthRe})[\\s/\\-.]?(20\\d{2}|\\d{2})`)
```
onde `MONTH_NAMES_PT` mapeia `jan|janeiro→"01"`, ..., `dez|dezembro→"12"` (abreviações E formas por extenso, com e sem acento — `"marco"`/`"março"` ambos aceitos). Confiança `0.85`.

Exemplos reais:
| Nome do arquivo | Resultado |
|---|---|
| `"Balancete Março 2024.pdf"` | `{ key:"2024-03", label:"Mar/2024", source:"filename", confidence:0.85 }` |
| `"BAL_03_2024_v2.xlsx"` | `{ key:"2024-03", confidence:0.9 }` |
| `"balancete-2024-11.xlsx"` | `{ key:"2024-11", confidence:0.9 }` (padrão 2) |
| `"relatorio.pdf"` | `null` (nenhum padrão casa) |

### 5.2 `detectMonthRangeFromFilename` — intervalos multi-mês
Para arquivos que cobrem vários meses consecutivos: `"Balancetes 08.2025 a 01.2026 (6 meses).xlsx"`.
```ts
const numPat = /(0?[1-9]|1[0-2])[\s/\-.](20\d{2}|\d{2})\s*(?:a|ate|até|-|—|to|—|\.\.)\s*(0?[1-9]|1[0-2])[\s/\-.](20\d{2}|\d{2})/;
```
Se não casar numericamente, tenta variante por nome de mês:
```ts
new RegExp(`(${monthRe})[\\s/\\-.]?(20\\d{2}|\\d{2})\\s*(?:a|ate|até|-|—|to)\\s*(${monthRe})[\\s/\\-.]?(20\\d{2}|\\d{2})`)
```
Expande cronologicamente mês-a-mês (`guard < 60` — teto de segurança contra loop infinito) produzindo lista ordenada `MonthRef[]` com `confidence=0.85`. Exemplo: entrada acima → `["2025-08","2025-09","2025-10","2025-11","2025-12","2026-01"]`.

### 5.3 `extractColumnMonths` — colunas de cabeçalho
Detecta ano "âncora" no cabeçalho inteiro, mas **apenas em células curtas** (`s.length <= 20`), regex `\b(20\d{2})\b` — isso é um **guard anti-alucinação explícito**: sem o limite de tamanho, códigos contábeis longos como `"2110102026"` seriam confundidos com o ano `2026`. Se nenhum ano aparecer no header, tenta `detectMonthRangeFromFilename`/`detectMonthFromFilename`; por último usa `new Date().getFullYear()`.

Cada célula do header é testada por `detectMonthFromYearLabel` (confiança `>=0.8` obrigatória) e, se falhar, por casar exatamente um nome de mês abreviado/completo isolado (regex `^(${monthRe})$` sobre a célula normalizada), combinando com o ano inferido. Resultado ordenado por `mesKey.localeCompare`.

### 5.4 `reconcileMonthsWithFilename` — reconciliação pós-detecção
Quando os headers só trazem nomes de mês sem ano explícito (`AGO, SET, OUT, NOV, DEZ, JAN`) e a inferência de ano produz valores espúrios, esta função compara a quantidade de colunas detectadas com o range extraído do nome do arquivo; se o número bater, **remapeia sequencialmente** por posição (`idx`) para os primeiros N meses do range do arquivo — corrigindo a virada de ano (`DEZ/2025 → JAN/2026`) que o header sozinho não conseguiria expressar.

### 5.5 `detectMonthFromYearLabel` — normalização de rótulo avulso
Aceita, em ordem: `YYYY-MM`/`YYYY/MM` (conf. `0.95`) → `MM/YYYY`/`MM/YY` (conf. `0.95`) → `"jan/24"`/`"fev 2024"` (conf. `0.9`) → apenas `YYYY` isolado assumindo dezembro, **mas com guard textual obrigatório**:
```ts
m = n.match(/^(?:ano\s+|exerc[ií]cio\s+|per[ií]odo\s+)?(20\d{2})(?:\s*(?:anual|fechamento|dez|dezembro))?$/);
```
(conf. `0.55` — a string precisa ser o ano INTEIRO, opcionalmente com prefixo/sufixo contextual explícito, nunca um substring de um código maior) → `"atual"`/`"saldo final"` herdando `fallbackMonth` se disponível, senão mês corrente (conf. `0.4`, `source:"fallback"`).

### 5.6 Override manual do usuário
`relabelYearsAsMonths(parsed, fileName, userMonthOverride)` aceita um mês `YYYY-MM` informado manualmente na UI (validado por `/^\d{4}-(0[1-9]|1[0-2])$/`). Regra de precedência: o override só é aplicado a **todos** os `years` quando o documento é single-period (`years.length <= 1` ou é só `["atual"]`); se o documento já é multi-mês internamente (cenário B — múltiplas colunas), o override do usuário é **ignorado** em favor da detecção de coluna (a menos que reste apenas uma coluna "atual").

## 6. `mesNormalizer.ts` — Single Source of Truth de Período

### 6.1 `normalizeMesKey` — formatos aceitos
```ts
export function normalizeMesKey(input: string | null | undefined): string | null
```
Ordem de tentativa: (1) já normalizado `^(\d{4})-(0[1-9]|1[0-2])$`; (2) `YYYY[sep]MM`; (3) `MM[sep]YYYY` ou `M[sep]YY`; (4) `"março 2024"`/`"março/2024"` (nome + ano); (5) `"2024 março"` (ano + nome); (6) apenas `YYYY` → assume fechamento dezembro (`buildKey(y,12)`). Retorna `null` se nada casar (ex.: `"atual"`, `"saldo atual"` — o caller decide o fallback).

`expandYear`: 2 dígitos `00-79 → 2000-2079`, `80-99 → 1900-1999`; fora de `1900-2100` é inválido.

`mesKeyToLabel("2024-03")` → `"Março 2024"` (usa array `MES_FULL` completo, index 0-based).

`periodToMesKey(period)` — versão tolerante: se `normalizeMesKey` falhar, devolve a entrada original em trim (usada em `audit-bs-dados/index.ts` antes da validação estrita).

### 6.2 Estratégias de merge de duplicatas — `DupStrategy`
```ts
export type DupStrategy = "sum" | "max-abs" | "last" | "first";
export function mergeNumeric(a: number, b: number, strategy: DupStrategy = "sum"): number
```
- `sum` (default): soma — assume balancetes complementares (ex.: mesmo mês dividido em duas planilhas de filiais).
- `max-abs`: mantém o de maior módulo — assume um é completo e o outro parcial/rascunho.
- `last`/`first`: mantém o segundo/primeiro carregado, ignorando o outro.

`detectDuplicates(mesKeys: string[])` retorna `{ duplicates: [{mesKey, count}], hasDuplicates }` ordenado por `mesKey`.

## 7. Dedup por `content_hash` (aplicado após a detecção de mês)
A geração do `content_hash` (ver MD-PORT-03 §4.2) usa `body.documentInfo?.periodo` **como string bruta do documento**, não o `mesKey` já normalizado — logo dois envios do mesmo balancete com grafias de período diferentes (`"Março 2024"` vs `"2024-03"`) geram hashes diferentes até que a normalização de mês seja aplicada corrente abaixo, no `audit-bs-dados`. A camada de sanitização de mês no `audit-bs-dados` (§9) roda **depois** do hash — a dedup de pipeline opera sobre o payload bruto de entrada, não sobre o mês já normalizado.

## 8. Parser Fixo de Gráficos (`balanceteChartsParser.ts`)
Diferente do parser genérico, este módulo lê **por posição fixa** (não por nome de coluna) as 4 abas do template `.xlsm` oficial:

| Aba | Layout fixo | Saída |
|---|---|---|
| `"Dados para Graficos"` (aliases: "Dados para Gráficos", "Dados Graficos") | Linha 3 (`rows[2]`) = meses nas colunas D..O (índices `3..14`); linhas 4-13 (`rows[3..12]`) = categorias na coluna C (índice 2) | `BalancoChartData { meses, series }` |
| `"Folha"` | Linha 2 (`rows[1]`) = datas em colunas ímpares `1,3,5,...`; linha 3 = Nº funcionários; linha 11 = folha pagamento; linha 12 = contratados PJ | `FolhaChartData` |
| `"FCP - 6 meses"` | Linha 2 = saldo acumulado (cols `F..L`/`5..11`); linha 6 = header de meses; linha 21 = fluxo mensal (`TOTAL_ANO`) | `FCPChartData` |
| `"Fluxo de Caixa - Prev x Realiz"` | Linha 3 = meses em cols pares a partir de 2 (`C,E,G,...`), cada mês ocupa 2 colunas (Previsto/Realizado); linhas 5/6 = entradas Operacional/Não-Op; linhas 10/11 = saídas Operacional/Não-Op | `FluxoPrevRealChartData` |

Regra crítica documentada no cabeçalho do arquivo: **indexação por POSIÇÃO, nunca por nome**; **nunca reordenar/inferir/normalizar valores**; datas normalizadas para `"Mmm/AA"` pt-BR; valores nulos/`#N/A` → `null` (preserva o ponto para o Recharts, ao invés de zerar).

Conversão numérica tolerante a formato BR (`toNum`):
```ts
const n = Number(s.replace(/\./g, "").replace(",", "."));
```
(remove separador de milhar `.`, troca decimal `,` por `.`).

### 8.1 Fallback quando não é o template oficial
`resolveBalanceteCharts(files, parsed)`: tenta primeiro `parseBalanceteChartsFromFiles` (procura arquivos `.xlsx/.xls/.xlsm/.xlsb/.xltx/.xltm`, priorizando nomes com `balancete|base|relat`); se nenhum tiver `hasData=true`, cai em `deriveChartsFromParsedData(parsed)`, que reconstrói uma série simplificada "Balanço — Evolução Mensal" a partir das contas já extraídas pela IA, casando por regex textual (`ACCOUNT_PATTERNS`: Caixa e Equivalentes, Estoque, Clientes a Receber, Ativo Circulante, Ativo Total, Fornecedores, Passivo Circulante, Patrimônio Líquido).

## 9. Mapeamento Final para Tabelas

### 9.1 `balancete_lines` (linha bruta por conta/mês, `audit-bs-dados/index.ts`)
```ts
linesIns.push({
  balancete_id: balId,
  conta: String(l.conta || "").trim() || "—",
  descricao: l.descricao ? String(l.descricao).slice(0, 500) : null,
  ref1: l.ref1 ?? inferRefByCode(l.conta, l.descricao) ?? null,
  saldo,
});
```
Inserção em background, em lotes (`chunks`) de até 500 linhas, com concorrência `CONCURRENCY = 6` chamadas paralelas de `insert`.

### 9.2 `balancete_consolidado` (schema, migration `20260504172050`)
Colunas: `audit_id`, `mes_referencia date`, `codigo text`, `descricao text`, `ref_capital text`, `saldo_atual numeric default 0`, `saldo_anterior numeric`, `debito numeric`, `credito numeric`. Índices em `(audit_id)`, `(audit_id, mes_referencia)`, `(audit_id, codigo)`. RLS: `SELECT/INSERT/UPDATE/DELETE` restritos a usuários com acesso à `audits` correspondente (`EXISTS (SELECT 1 FROM audits a WHERE a.id = balancete_consolidado.audit_id ...)`).

### 9.3 `bs_dados` (linha consolidada por mês — 1 linha por `(audit_id, mes)`)
Campos gravados a partir de `BSDadosRow` (`bsDadosBuilder.ts` / `core.ts`), com `mes` sempre no formato `"${mesKey}-01"` (primeiro dia do mês, tipo `date`):
```ts
{
  audit_id, mes: `${r.mesKey}-01`,
  receita_liquida, cmv, despesas, despesas_financeiras, receitas_financeiras,
  outras_nao_operacionais, depreciacao, amortizacao, resultado,
  ativo_circulante, ativo_nao_circulante, passivo_circulante, passivo_nao_circulante,
  patrimonio_liquido, patrimonio_liquido_bruto,
  ativo_total, passivo_total,
  estoques, estoques_bruto,
  disponivel, contas_receber, imobilizado, realizavel_longo_prazo, investimentos, intangivel,
  divida_tributaria, divida_trabalhista, divida_financeira, fornecedores, credores_rj,
  outras_obrigacoes, divida_total, divida_total_bruto,
  errors, ytd_flags,
  validation_status, validation_diagnostics, confidence_by_group,
}
```
Upsert usa `onConflict: "audit_id,mes"` no modo `reprocess_audit_id`; no fluxo normal de criação, é `insert` simples porque a auditoria é sempre nova.

### 9.4 Regras de sinal aplicadas na consolidação (`bsDadosBuilder.ts` cabeçalho)
- Receita Líquida → sempre **positiva**.
- CMV / Despesas → sempre **negativos**.
- Resultado → mantém sinal natural (não normaliza).
- Componentes de dívida (`divida_financeira`, `fornecedores`, etc.) → sempre **positivos** (módulo, `Math.abs`).
- Percentuais derivados (indicadores) → sempre **positivos**.

Essas regras de sinal são reforçadas em `p1SyntheticResolver.ts` via `ABS_ROLES` — o conjunto de `CanonicalRole`s cujo valor final é publicado com `Math.abs()`:
```ts
const ABS_ROLES = new Set<CanonicalRole>([
  "ativo_total", "ativo_circulante", "ativo_nao_circulante", "realizavel_longo_prazo",
  "estoques", "disponivel", "passivo_circulante", "passivo_nao_circulante",
  "fornecedores", "fornecedores_lp", "divida_financeira_cp", "divida_financeira_lp",
]);
```

### 9.5 `emptyRow(mesKey)` — linha vazia canônica
Todo mês sem dados suficientes gera uma linha "esqueleto" com todos os campos numéricos zerados e `facts_status[campo] = "NOT_AVAILABLE"` para cada um dos ~35 campos do `BSDadosRow` — garantindo que o front-end sempre receba um shape completo e possa exibir "Dado indisponível" ao invés de `undefined`. `formula_engine_version: "BEX-ACCOUNTING-FORMULA-ENGINE-2.0"`, `data_quality: "CERTIFIED"` são gravados por padrão na linha, mas o campo correspondente em `facts_status` para esses dois começa como `"NOT_AVAILABLE"` até a consolidação real popular os valores.

## 10. Sanitização de `mesKey` no `audit-bs-dados` (barreira final)
Antes de qualquer persistência, `audit-bs-dados/index.ts` valida estritamente:
```ts
const isValidMesKey = (k: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k);
for (const b of rawBalancetes) {
  const mk = periodToMesKey(b.mes);
  if (isValidMesKey(mk)) sanitized.push({ ...b, mes: mk });
  else rejected.push({ mes: b.mes, reason: `mês inválido após normalização: "${mk}"` });
}
if (sanitized.length === 0) {
  return new Response(JSON.stringify({
    error: "Nenhum balancete com mês válido (YYYY-MM). Forneça meses explícitos antes de consolidar.",
    rejected,
  }), { status: 400, ... });
}
```
Isso impede que placeholders como `"atual"`, `"corrente"`, `"—"` cheguem ao cast `::date` no Postgres, o que quebraria a persistência inteira do lote. Meses rejeitados são reportados individualmente (`rejected[]`) sem abortar os meses válidos do mesmo request.

## 11. Checklist de Implementação

- [ ] Implementar roteamento `parseFile` por extensão exatamente com as 4 listas de `§3.1`.
- [ ] Implementar `audit-parse-pdf` com o `EXTRACTION_PROMPT` completo e `extractAndRepairJson` com as 3 camadas de reparo (limpeza simples → correção de vírgulas → bracket balancing com truncamento seguro).
- [ ] Implementar `computeOcrScore` com os pesos exatos (`0.5` base, `+0.15/+0.10/+0.05/+0.05/+0.10/+0.05`).
- [ ] Implementar `tryParseBalanceteMensalBR` com a busca de cabeçalho nas primeiras 15 linhas e o mapeamento de colunas por nome/prefixo exato.
- [ ] Implementar detecção multi-mês por colunas (verificando header atual + 2 linhas acima) usando `detectMonthFromYearLabel` com corte `confidence >= 0.8`.
- [ ] Implementar `normalizeAccountCode` exatamente (split por `.` ou `-`/`/`, remove não-dígitos, remove zeros à esquerda por segmento via `parseInt`).
- [ ] Portar a tabela `REF_BY_PREFIX` completa e na ORDEM exata (regex mais específico primeiro).
- [ ] Portar `classifyPCByDescription`/`classifyPNCByDescription` com as mesmas regex e a MESMA exceção (211 nunca por descrição).
- [ ] Portar `REF1_MAP` completo (47+ chaves) e `FALLBACK_PATTERNS` completo, respeitando a ordem de avaliação documentada.
- [ ] Implementar `detectMonthFromFilename`/`detectMonthRangeFromFilename`/`extractColumnMonths`/`reconcileMonthsWithFilename`/`detectMonthFromYearLabel` com as regex EXATAS de `§5`.
- [ ] Implementar o guard anti-alucinação de ano (célula `<= 20 chars` em `extractColumnMonths`; string INTEIRA em `detectMonthFromYearLabel` para o caso "apenas YYYY").
- [ ] Implementar `relabelYearsAsMonths` com a regra de precedência do override manual (só aplica a todos se single-period).
- [ ] Implementar `mesNormalizer.ts` completo (`normalizeMesKey`, `expandYear`, `mesKeyToLabel`, `periodToMesKey`, `mergeNumeric`, `detectDuplicates`).
- [ ] Implementar `balanceteChartsParser.ts` com leitura por POSIÇÃO fixa das 4 abas do template `.xlsm`, sem reordenação/inferência.
- [ ] Implementar `deriveChartsFromParsedData` como fallback via regex `ACCOUNT_PATTERNS` quando o arquivo não é o template oficial.
- [ ] Implementar a barreira de sanitização de `mesKey` em `audit-bs-dados` (regex `^\d{4}-(0[1-9]|1[0-2])$`, rejeição parcial sem abortar o lote inteiro).
- [ ] Implementar `emptyRow` com todos os ~35 campos e `facts_status` inicial `"NOT_AVAILABLE"`.
- [ ] Garantir gravação de `mes` como `"${mesKey}-01"` (primeiro dia do mês) em `bs_dados`/`indicadores`/`kanitz_scores`.
- [ ] Implementar `balancete_lines` insert em background, chunked (500) com concorrência 6.

## 12. Critérios de Homologação

1. Upload de `"Balancete Março 2024.pdf"` sem coluna de mês explícita no conteúdo deve resultar em `mesKey = "2024-03"` detectado por nome de arquivo (`source: "filename"`).
2. Upload de planilha multi-mês com colunas `JAN/2024...DEZ/2024` deve ignorar qualquer mês do nome do arquivo e usar exclusivamente as colunas (`source: "header"`), produzindo 12 linhas em `bs_dados` para a mesma auditoria.
3. Um código de conta `"2110102026"` presente numa célula de balancete **não** pode ser interpretado como ano 2026 em nenhuma etapa de detecção de mês (teste de regressão do guard anti-alucinação).
4. Conta com código `"211"` e descrição `"Fornecedores Diversos"` deve mapear para `ref1 = "BB"`; uma conta `"212"` com a palavra "fornecedor" na descrição **não** pode mapear para `"BB"` (deve cair em `classifyPCByDescription`).
5. Um balancete com `mes: "atual"` enviado a `audit-bs-dados` sem outro balancete válido no lote deve retornar HTTP 400 com `rejected[]` preenchido e nenhuma escrita em `bs_dados`.
6. Reprocessar (`reprocess_audit_id`) uma auditoria existente deve produzir exatamente os mesmos valores em `bs_dados` que a criação original, dado o mesmo `balancete_lines` de entrada (determinismo do motor).
7. Arquivo `"Balancetes 08.2025 a 01.2026 (6 meses).xlsx"` com headers apenas `AGO..JAN` (sem ano) deve resultar, após `reconcileMonthsWithFilename`, em 6 meses corretos incluindo a virada `2025→2026`.
8. Valores extraídos do template `.xlsm` oficial (aba "Dados para Graficos") devem bater célula-a-célula com o arquivo fonte (validação de leitura posicional, sem reordenação).
