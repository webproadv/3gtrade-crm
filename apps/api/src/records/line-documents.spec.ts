import { documentTotals, formatDocNumber, grandTotal, lineAmounts } from './line-documents';

describe('righe dei documenti', () => {
  it('calcola imponibile scontato, IVA e totale', () => {
    expect(lineAmounts({ quantity: 3, unitPrice: 100, discount: 10, vatRate: 22 })).toEqual({ net: 270, vat: 59.4, total: 329.4 });
    expect(lineAmounts({ quantity: 1, unitPrice: 0.1, discount: 0, vatRate: 22 })).toEqual({ net: 0.1, vat: 0.02, total: 0.12 });
    expect(lineAmounts({ quantity: 2.5, unitPrice: 19.99, discount: 0, vatRate: 0 })).toEqual({ net: 49.98, vat: 0, total: 49.98 });
  });

  it('somma le righe arrotondate', () => {
    const lines = [
      lineAmounts({ quantity: 1, unitPrice: 0.105, discount: 0, vatRate: 22 }),
      lineAmounts({ quantity: 1, unitPrice: 0.105, discount: 0, vatRate: 22 }),
    ];
    expect(documentTotals(lines)).toEqual({ net: 0.22, vat: 0.04, total: 0.26 });
    expect(documentTotals([])).toEqual({ net: 0, vat: 0, total: 0 });
  });

  it('numera i documenti', () => {
    expect(formatDocNumber('', 2026, 3634)).toBe('2026-03634');
    expect(formatDocNumber('PDA', 2026, 7)).toBe('PDA-2026-00007');
    expect(formatDocNumber('', 2026, 123456)).toBe('2026-123456');
  });

  it('applica l\'arrotondamento al totale', () => {
    expect(grandTotal(12582.75, 0, -82.75)).toBe(12500);
    expect(grandTotal(100, 22, null)).toBe(122);
  });
});
