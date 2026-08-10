# Database Schema - Audit & Financial Engine [MD-BEX-DB-SPEC-001]

## Tables

### 1. audits
- `id`: uuid (PK)
- `company_id`: uuid (FK)
- `name`: text
- `variant`: text ('completo', 'bex', 'kanitz')
- `status`: text
- `meses_count`: integer
- `metadata`: jsonb (run_id, source_hash)

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
- `resultado`: numeric
- ... (47 fields)
- `p1_facts`: jsonb (Audit trace of resolution)

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

### 7. ocr_results
- `document_id`: uuid (FK)
- `structured_json`: jsonb (Raw parsed data)
- `ocr_score`: numeric
