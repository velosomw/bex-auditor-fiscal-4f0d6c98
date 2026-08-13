# MD-PORT-06-CANONICAL-SNAPSHOT-SERVICE
Código: `src/services/canonicalFinancialSnapshotService.ts`
Lógica:
- Single Source of Truth (SSOT).
- `Object.freeze` em objetos de fato para garantir imutabilidade pós-certificação.
- Traceability: `processing_run_id`, `runtime_trace_id`.
