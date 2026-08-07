export function inferSide(conta?: string, ref1?: string | null, descricao?: string): "ATIVO" | "PASSIVO" | "RESULTADO" | "UNKNOWN" {
  const code = conta ? conta.replace(/[\s.]/g, "") : "";
  const desc = (descricao || "").toUpperCase();

  if (code.startsWith("1")) return "ATIVO";
  if (code.startsWith("2")) return "PASSIVO";
  if (code.startsWith("3") || code.startsWith("4") || code.startsWith("5") || code.startsWith("6") || code.startsWith("7") || code.startsWith("8")) return "RESULTADO";

  // Fallback by description/ref
  if (desc.includes("ATIVO")) return "ATIVO";
  if (desc.includes("PASSIVO") || desc.includes("PATRIMONIO LIQUIDO")) return "PASSIVO";
  
  return "UNKNOWN";
}
