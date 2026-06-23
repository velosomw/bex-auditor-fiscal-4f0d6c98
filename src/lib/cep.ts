// Padrão de CEP da plataforma: XX.XXX.XXX (8 dígitos com pontos)
export function formatCep(value: string): string {
  const digits = (value || "").replace(/\D/g, "").slice(0, 8);
  const p1 = digits.slice(0, 2);
  const p2 = digits.slice(2, 5);
  const p3 = digits.slice(5, 8);
  let out = p1;
  if (digits.length > 2) out += "." + p2;
  if (digits.length > 5) out += "." + p3;
  return out;
}

export function isValidCep(value: string): boolean {
  return (value || "").replace(/\D/g, "").length === 8;
}
