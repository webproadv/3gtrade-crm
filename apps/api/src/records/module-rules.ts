/**
 * Regole di validazione che coinvolgono più campi dello stesso record.
 * Ricevono i dati completi (dopo la fusione con quelli esistenti) e
 * restituiscono gli errori per campo.
 */
export type ModuleRule = (data: Record<string, unknown>) => Record<string, string>;

export const MODULE_RULES: Record<string, ModuleRule[]> = {
  Activities: [
    (d): Record<string, string> =>
      d.start && d.end && Date.parse(String(d.end)) < Date.parse(String(d.start))
        ? { end: "la fine deve essere successiva all'inizio" }
        : {},
  ],
  SalesOrders: [
    (d): Record<string, string> => {
      const pct = ['down_payment_pct', 'start_works_pct', 'balance_pct'].reduce((s, k) => s + (Number(d[k]) || 0), 0);
      return pct > 100 ? { balance_pct: 'anticipo, inizio lavori e saldo superano il 100%' } : {};
    },
    (d): Record<string, string> =>
      d.status === 'Annullata' && !d.cancel_date ? { cancel_date: 'indica la data di annullamento' } : {},
  ],
};

export function checkModuleRules(module: string, data: Record<string, unknown>): Record<string, string> {
  return Object.assign({}, ...(MODULE_RULES[module] ?? []).map((rule) => rule(data)));
}
