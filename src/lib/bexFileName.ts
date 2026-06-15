/**
 * Padroniza nomes de arquivos salvos/baixados/impressos pela plataforma.
 * - Remove qualquer ocorrência de "Lovable" (case-insensitive).
 * - Garante prefixo "BEx_" quando ainda não estiver presente.
 *
 * Usar SEMPRE que gerar nome de arquivo para download, exportação ou
 * título de impressão (document.title antes de window.print()).
 */
export function bexFileName(raw: string): string {
  const stripped = (raw || "Relatorio")
    .replace(/lovable/gi, "")
    .replace(/[\s_-]{2,}/g, "_")
    .replace(/^[\s_-]+|[\s_-]+$/g, "")
    .trim() || "Relatorio";
  return /^bex[\s_-]/i.test(stripped) ? stripped : `BEx_${stripped}`;
}
