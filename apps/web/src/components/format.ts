const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const num = new Intl.NumberFormat('it-IT');

export const formatCurrency = (n: number) => eur.format(n);
export const formatNumber = (n: number) => num.format(n);
export const formatDate = (s: string) => new Date(s).toLocaleDateString('it-IT');
export const formatDateTime = (s: string) =>
  new Date(s).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO (UTC) -> valore per <input type="datetime-local"> nel fuso dell'utente. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

/** Chiave giorno locale AAAA-MM-GG. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
