/**
 * Converte um valor Firestore (Timestamp SDK, {seconds, nanos} plain, string ISO,
 * number epoch, ou null/undefined) em Date válido ou null.
 *
 * Firestore salva datas como objetos Timestamp que NÃO são Date.
 * `new Date(TimestampObject)` → Invalid Date. Este helper normaliza tudo.
 *
 * Uso:
 *   const d = toDate(record.createdAt);   // Date | null
 *   d?.toLocaleDateString('pt-BR');        // seguro
 */
export function toDate(value: any): Date | null {
  if (value === null || value === undefined) return null;

  // Firestore Timestamp SDK (possui .toDate())
  if (typeof value === "object" && typeof value.toDate === "function") {
    try { return value.toDate(); } catch { return null; }
  }

  // Plain Firestore object {seconds, nanoseconds}
  if (typeof value === "object" && "seconds" in value && typeof value.seconds === "number") {
    const d = new Date(value.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }

  // String ISO / epoch number / Date pass-through
  if (typeof value === "object" && value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Converte para timestamp ISO string seguro para ordenação e display.
 * Retorna string vazia se o valor for inválido.
 */
export function toISOString(value: any): string {
  return toDate(value)?.toISOString() ?? "";
}

/**
 * Formata como dd/MM/yyyy HH:mm no fuso de Brasília (padrão).
 */
export function formatDateBR(value: any): string {
  const d = toDate(value);
  if (!d) return "";
  try {
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return d.toLocaleString("pt-BR");
  }
}
