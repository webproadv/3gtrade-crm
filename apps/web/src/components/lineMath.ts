// Stesse regole di calcolo dell'API (apps/api/src/records/line-documents.ts), per l'anteprima mentre si scrive.
const round2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;

export function lineAmounts(l: { quantity: number; unitPrice: number; discount: number; vatRate: number }) {
  const net = round2((l.quantity || 0) * (l.unitPrice || 0) * (1 - (l.discount || 0) / 100));
  const vat = round2((net * (l.vatRate || 0)) / 100);
  return { net, vat, total: round2(net + vat) };
}

export function totalsOf(lines: { quantity: number; unitPrice: number; discount: number; vatRate: number }[], adjustment = 0) {
  const a = lines.map(lineAmounts);
  const net = round2(a.reduce((s, x) => s + x.net, 0));
  const vat = round2(a.reduce((s, x) => s + x.vat, 0));
  return { net, vat, adjustment, total: round2(net + vat + (adjustment || 0)) };
}
