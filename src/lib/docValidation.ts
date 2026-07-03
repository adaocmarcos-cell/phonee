// Utilitários de validação/normalização de CPF e CNPJ.
// Usados como CHAVE PRIMÁRIA para evitar duplicidade de clientes.

export const onlyDigits = (v: string) => (v || "").replace(/\D/g, "");

export function isValidCPF(raw: string): boolean {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}

export function isValidCNPJ(raw: string): boolean {
  const cnpj = onlyDigits(raw);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base: string, weights: number[]) => {
    const s = weights.reduce((acc, w, i) => acc + parseInt(base[i]) * w, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, ...w1];
  const d1 = calc(cnpj.slice(0, 12), w1);
  const d2 = calc(cnpj.slice(0, 12) + d1, w2);
  return d1 === parseInt(cnpj[12]) && d2 === parseInt(cnpj[13]);
}

export function validateDoc(raw: string, type: "cpf" | "cnpj"): { ok: boolean; message?: string } {
  const digits = onlyDigits(raw);
  if (!digits) return { ok: true };
  if (type === "cpf") {
    if (digits.length !== 11) return { ok: false, message: "CPF deve ter 11 dígitos" };
    if (!isValidCPF(digits)) return { ok: false, message: "CPF inválido" };
  } else {
    if (digits.length !== 14) return { ok: false, message: "CNPJ deve ter 14 dígitos" };
    if (!isValidCNPJ(digits)) return { ok: false, message: "CNPJ inválido" };
  }
  return { ok: true };
}