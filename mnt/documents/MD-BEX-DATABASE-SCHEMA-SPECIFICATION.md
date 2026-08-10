# Database Schema - Audit & Financial Engine [MD-BEX-DB-SPEC-002]

## Tables

### 1. audits
- `id`: uuid (PK)
- `company_id`: uuid (FK)
- `name`: text
- `variant`: text ('completo', 'bex', 'kanitz')
- `status`: text
- `meses_count`: integer
- `metadata`: jsonb (run_id, source_hash, runtime_trace_id)

### 2. balancetes
- `id`: uuid (PK)
- `audit_id`: uuid (FK)
- `mes_referencia`: date
- `file_name`: text
- `total_linhas`: integer
- `pipeline_document_id`: uuid (FK)

### 3. balancete_lines
- `id`: uuid (PK)
- `balancete_id`: uuid (FK)
- `conta`: text
- `descricao`: text
- `ref1`: text (Ref BEx)
- `saldo`: numeric

### 4. bs_dados
- `audit_id`: uuid (FK)
- `mes`: date (PK)
- `ativo_circulante`: numeric
- `ativo_nao_circulante`: numeric
- `patrimonio_liquido`: numeric
- `receita_liquida`: numeric
- `resultado`: numeric (Acumulado)
- `resultado_competencia`: numeric (Variação do período)
- `resultado_acumulado`: numeric (Sincronizado com saldo do balancete)
- `ativo_total`: numeric (P1 Synthetic Authority)
- ... (47 fields)
- `p1_facts`: jsonb (Audit trace of resolution / Certified Facts)
- `integrity_gates`: jsonb (Resultados dos Integrity Gates A01-A07)
- `residual_facts`: jsonb (Certified facts: tax.noncurrent, borrowings.total, ebitda, interest_coverage)

### 5. indicadores
- `audit_id`: uuid (FK)
- `mes`: date (PK)
- `liquidez_corrente`: numeric
- `liquidez_seca`: numeric
- ... (30+ indicators)

### 6. kanitz_scores
- `audit_id`: uuid (FK)
- `mes`: date (PK)
- `score`: numeric (K)
- `rating`: text
- `isg`: numeric
- `applicable`: boolean (False if PL <= 0)

### 7. ocr_results
- `document_id`: uuid (FK)
- `structured_json`: jsonb (Raw parsed data)
- `ocr_score`: numeric

### 8. companies
- `id`: uuid (PK)
- `name`: text (Auto-detected from structural header)
- `cnpj`: text
- `metadata`: jsonb

---

## RLS & Security Policies
- **Core Rule:** Every table has `ENABLE ROW LEVEL SECURITY`.
- **Policy:** `authenticated` users can only access data where `user_id` matches `auth.uid()`.
- **Grants:** Explicit `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated`.

*Atualizado em 10/08/2026 para inclusão de campos de certificação final.*
