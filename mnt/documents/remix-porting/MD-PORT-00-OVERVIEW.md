# MD-PORT-00-OVERVIEW: Arquitetura e Ordem de Execução

Esta plataforma utiliza um motor financeiro certificado baseado na arquitetura **P1 Synthetic Authority**.

## Ordem de Implementação
1. **Infraestrutura**: Configuração Supabase (RLS, GRANTs, Edge Functions).
2. **Camada de Dados**: Replicação do schema (audits, bs_dados, indicadores).
3. **Core Engine**: Implementação dos services (p1SyntheticResolver, residualFactsResolver, indicatorsEngine, canonicalFinancialSnapshotService).
4. **Pipeline**: Edge Functions de extração e parsing.
5. **UI**: Componentes React de auditoria, gráficos (recharts) e relatórios PDF (paginação segura).

## Certificação
Qualquer alteração em fórmulas deve passar pelo  (Mar/Abr/Mai 2026).
