/**
 * Automatismi semplici eseguiti dal sistema al salvataggio, come i workflow più usati in vtenext.
 * Prima del salvataggio completano i dati del record; dopo il salvataggio aggiornano i record collegati
 * (vedi RecordsService.afterWrite).
 */

/** Stati della PDA che non contano come PDA attive del cliente. */
export const PDA_INACTIVE = ['Annullata', 'Sostituita', 'Non approvata', 'Bozza'];
/** Fasi delle opportunità chiuse. */
export const OPPORTUNITY_CLOSED = ['Chiusa vinta', 'Chiusa persa'];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type BeforeSave = (next: Record<string, unknown>, prev: Record<string, unknown> | null) => Record<string, unknown>;

/** Valori da impostare prima del salvataggio, calcolati dal record nuovo e da quello precedente. */
export const BEFORE_SAVE: Record<string, BeforeSave[]> = {
  Opportunities: [
    // chiusa vinta = 100%, chiusa persa = 0%, come in vtenext
    (next, prev) => {
      if (next.sales_stage === prev?.sales_stage) return {};
      if (next.sales_stage === 'Chiusa vinta') return { probability: 100 };
      if (next.sales_stage === 'Chiusa persa') return { probability: 0 };
      return {};
    },
  ],
  SalesOrders: [
    // annullando la PDA si registra la data di annullamento, se non indicata
    (next, prev) =>
      next.status === 'Annullata' && prev?.status !== 'Annullata' && !next.cancel_date ? { cancel_date: today() } : {},
  ],
};

export function beforeSave(module: string, next: Record<string, unknown>, prev: Record<string, unknown> | null) {
  return Object.assign({}, ...(BEFORE_SAVE[module] ?? []).map((fn) => fn(next, prev))) as Record<string, unknown>;
}
