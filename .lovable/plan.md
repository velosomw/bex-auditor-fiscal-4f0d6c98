# Plano de Formatação: Relatório de Fórmulas Técnicas BEX

Este plano descreve a implementação de uma nova página de relatório e a integração da exportação PDF/Docx para o documento de fórmulas técnicas.

## 1. Novo Componente de Relatório
- Criar `src/components/audit/ReportFormulas.tsx` para renderizar o conteúdo de `mnt/documents/BEX_FORMULAS_TECNICAS.md` em formato A4 profissional.
- Utilizar o `ReportPage` e `SectionTitle` existentes para manter a identidade visual.
- Implementar as seções: Capa, Kanitz, Indicadores, Score RJ, Integridade e Taxonomia.

## 2. Integração na Página de Auditoria
- Adicionar um novo botão "Relatório de Fórmulas" no cabeçalho dos resultados em `src/pages/Audit.tsx`.
- Criar um estado `showFormulasReport` para alternar a visualização.
- Integrar as funções de exportação (PDF e DOC) específicas para este documento.

## 3. Detalhes Técnicos
- Mapear o Markdown para componentes React estilizados com Tailwind.
- Garantir que a exportação PDF respeite as margens de 26mm e altura máxima de 245mm (Core Freeze MD-001).
- Unificar a extração de metadados (empresa, data, trace_id) para rastreabilidade.

## Ações Próximas
- Desenvolver o componente `ReportFormulas`.
- Modificar `Audit.tsx` para incluir o ponto de acesso.
