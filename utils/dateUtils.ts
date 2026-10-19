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

  // String "YYYY-MM-DD" (formato do campo `date` de pedidos/despesas): o padrão
  // ECMAScript parseia como meia-noite UTC — em São Paulo (UTC-3) vira o dia
  // ANTERIOR às 21h, jogando vendas do dia 1º para o mês anterior e tirando as
  // vendas de hoje dos filtros "hoje". Constrói a meia-noite LOCAL para o dia
  // continuar o MESMO dia do ciclo de caixa (fechamento/dashboards/DRE).
  if (typeof value === "string") {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (dateOnly) {
      const d = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
      return isNaN(d.getTime()) ? null : d;
    }
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
 * Dia LOCAL atual do sistema (America/Cuiaba) como "AAAA-MM-DD".
 * Espelha o `dataDiaLocalMT()` das Cloud Functions — usar em vez de
 * `new Date().toISOString().slice(0,10)`, que devolve a data em UTC e, a partir
 * das ~20h locais, já mostra o dia seguinte.
 */
export function diaLocalMT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cuiaba' });
}

/**
 * Segunda-feira da semana atual (America/Cuiaba) como "AAAA-MM-DD".
 * O backstop do reset semanal no cliente precisa produzir a MESMA string que o
 * servidor grava em settings/maintenance.lastWeeklyReset; se divergir (ex.: UTC
 * vs fuso local), o aviso de defasagem dispara toda vez, sem defasagem real.
 */
export function segundaFeiraLocalMT(): string {
  const [ano, mes, dia] = diaLocalMT().split('-').map(Number);
  const ref = new Date(Date.UTC(ano, mes - 1, dia));
  const dow = ref.getUTCDay(); // 0 = domingo
  ref.setUTCDate(ref.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return ref.toISOString().slice(0, 10);
}
