const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const num = new Intl.NumberFormat('it-IT');

export const formatCurrency = (n: number) => eur.format(n);
export const formatNumber = (n: number) => num.format(n);
export const formatDate = (s: string) => new Date(s).toLocaleDateString('it-IT');
export const formatDateTime = (s: string) =>
  new Date(s).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
