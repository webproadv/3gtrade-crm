/**
 * Documenti con righe (PDA/ordini; in futuro preventivi e fatture): campi dei totali calcolati
 * dalle righe. La numerazione automatica è in auto-numbers.ts.
 */
export interface LineDocument {
  /** adjustment: arrotondamento modificabile a mano, sommato al totale */
  totals: { net: string; vat: string; adjustment: string; total: string };
}

export const LINE_DOCUMENTS: Record<string, LineDocument> = {
  SalesOrders: {
    totals: { net: 'subtotal', vat: 'vat_total', adjustment: 'adjustment', total: 'grand_total' },
  },
};

export interface LineInput {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  /** sconto in percentuale, 0-100 */
  discount: number;
  /** aliquota IVA in percentuale, 0-100 */
  vatRate: number;
}

export interface LineAmounts {
  net: number;
  vat: number;
  total: number;
}

// toPrecision elimina l'errore binario (2,5 × 19,99 = 49,97499…) prima di arrotondare il mezzo centesimo per eccesso
const round2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;

/** Importi di una riga: imponibile scontato, IVA e totale, arrotondati al centesimo. */
export function lineAmounts(l: Pick<LineInput, 'quantity' | 'unitPrice' | 'discount' | 'vatRate'>): LineAmounts {
  const net = round2(l.quantity * l.unitPrice * (1 - l.discount / 100));
  const vat = round2((net * l.vatRate) / 100);
  return { net, vat, total: round2(net + vat) };
}

/** Totali del documento come somma delle righe già arrotondate. */
export function documentTotals(lines: LineAmounts[]): LineAmounts {
  const net = round2(lines.reduce((s, l) => s + l.net, 0));
  const vat = round2(lines.reduce((s, l) => s + l.vat, 0));
  return { net, vat, total: round2(net + vat) };
}

/** Numero leggibile del documento, es. 2026-00007 o, con prefisso, PDA-2026-00007. */
export const formatDocNumber = (prefix: string, year: number, n: number) =>
  `${prefix ? `${prefix}-` : ''}${year}-${String(n).padStart(5, '0')}`;

/** Totale del documento: imponibile + IVA + arrotondamento (che può essere negativo). */
export const grandTotal = (net: number, vat: number, adjustment: unknown) =>
  round2(net + vat + (Number(adjustment) || 0));
