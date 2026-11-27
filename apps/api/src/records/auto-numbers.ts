/**
 * Numerazione automatica dei record: un contatore per azienda, modulo e anno.
 * Il campo numerato è calcolato dal sistema e non è modificabile dagli utenti.
 */
export interface AutoNumber {
  /** campo con il numero progressivo, es. 2026-00001 */
  field: string;
  /** prefisso facoltativo del numero, es. "LEA" → LEA-2026-00001 */
  prefix: string;
}

export const AUTO_NUMBERS: Record<string, AutoNumber> = {
  SalesOrders: { field: 'order_number', prefix: '' },
  Leads: { field: 'lead_number', prefix: 'LEA' },
};
