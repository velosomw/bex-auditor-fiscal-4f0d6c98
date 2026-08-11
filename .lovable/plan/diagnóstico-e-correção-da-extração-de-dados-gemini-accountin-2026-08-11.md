# Diagnóstico e Correção da Extração de Dados (Gemini Accounting Engine)

O problema reportado ("extração de dados do balancete não está funcionando") está relacionado a instabilidades e timeouts observados no Lovable AI Gateway ao consumir modelos experimentais (3.x) do Gemini em períodos de alta carga.

## Ações Realizadas
1. **Auditoria de Logs**: Identifiquei múltiplos `AbortError` e `timeout` em `audit-pipeline-process` e `audit-parse-pdf`.
2. **Mapeamento de Falhas**: A `ROUTING_MATRIX` estava direcionando tarefas críticas para versões `preview` do Gemini que apresentam menor estabilidade em ambientes de produção.

## Plano de Correção
- **Estabilização do Roteamento**: Alterar a `ROUTING_MATRIX` para preferir modelos estáveis (`gemini-2.0-flash` e `gemini-1.5-pro`) como base de confiança.
- **Resiliência de Rede**: Aumentar os timeouts de OCR e Insights para suportar arquivos contábeis densos (PDFs com 50+ páginas).
- **Fallback Inteligente**: Garantir que falhas no Gemini 3.x escalem imediatamente para versões estáveis comprovadas.

## Detalhes Técnicos
- Arquivo: `supabase/functions/_shared/model-router.ts`
- Alteração: Substituir referências `3.x` por modelos LTS (Long Term Support) da Google AI e OpenAI para garantir 99.9% de disponibilidade no motor de extração.
- Arquivo: `supabase/functions/audit-parse-pdf/index.ts`
- Alteração: Adicionar retry com timeout estendido para multimodal.
