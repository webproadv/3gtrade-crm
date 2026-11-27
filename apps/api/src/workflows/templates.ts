import { Tx } from '../db/database.service';
import { FieldDef } from '../metadata/field-types';

/**
 * Segnaposto dei testi dei workflow, come in vtenext: $campo$ (valore leggibile), $relazione.campo$
 * (campo del record collegato, es. $account_id.email$) e i valori speciali $record$ (nome del record),
 * $owner$ (assegnatario), $today$ (data di oggi).
 */
export const PLACEHOLDER = /\$([a-z0-9_]+(?:\.[a-z0-9_]+)?)\$/g;

export interface TemplateRecord {
  id: string;
  label: string;
  owner_id: string;
  data: Record<string, unknown>;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const itDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

/** Valore leggibile di un campo (testo per oggetto e corpo delle email). */
function display(f: FieldDef | undefined, v: unknown, labels: Map<string, string>): string {
  if (v === null || v === undefined || v === '') return '';
  if (!f) return String(v);
  switch (f.type) {
    case 'currency':
      return Number(v).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
    case 'percent':
      return `${Number(v).toLocaleString('it-IT')}%`;
    case 'number':
      return Number(v).toLocaleString('it-IT');
    case 'date':
      return itDate(String(v));
    case 'datetime': {
      const d = new Date(String(v));
      return `${itDate(d.toISOString())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    case 'boolean':
      return v ? 'Sì' : 'No';
    case 'multipicklist':
      return Array.isArray(v) ? v.join(', ') : String(v);
    case 'relation':
    case 'user':
      return labels.get(String(v)) ?? '';
    default:
      return String(v);
  }
}

export class TemplateContext {
  private labels = new Map<string, string>();
  private related = new Map<string, Record<string, unknown>>();
  private fieldsByModule = new Map<string, FieldDef[]>();

  constructor(
    private readonly tx: Tx,
    readonly record: TemplateRecord,
    readonly fields: FieldDef[],
    private readonly loadFields: (module: string) => Promise<FieldDef[]>,
  ) {}

  /** Carica etichette e dati dei record e degli utenti citati dal testo. */
  private async prepare(text: string) {
    const ids = new Set<string>([this.record.owner_id]);
    for (const m of text.matchAll(PLACEHOLDER)) {
      const [name] = m[1].split('.');
      const f = this.fields.find((x) => x.name === name);
      const v = this.record.data[name];
      if (f && (f.type === 'relation' || f.type === 'user') && typeof v === 'string') ids.add(v);
    }
    const missing = [...ids].filter((id) => !this.labels.has(id));
    if (!missing.length) return;
    const recs = await this.tx.query(`SELECT id, label, module, data FROM records WHERE id = ANY($1::uuid[])`, [missing]);
    for (const r of recs.rows) {
      this.labels.set(r.id, r.label);
      this.related.set(r.id, { ...r.data, __module: r.module });
    }
    const users = await this.tx.query(
      `SELECT id, trim(first_name || ' ' || last_name) AS name, email FROM users WHERE id = ANY($1::uuid[])`,
      [missing],
    );
    for (const u of users.rows) {
      this.labels.set(u.id, u.name);
      this.related.set(u.id, { email: u.email, __module: '__user' });
    }
  }

  /** Valore di un percorso "campo" o "relazione.campo"; raw = valore grezzo invece del testo leggibile. */
  async value(path: string, raw = false): Promise<unknown> {
    await this.prepare(`$${path}$`);
    if (path === 'record') return this.record.label;
    if (path === 'owner') return this.labels.get(this.record.owner_id) ?? '';
    if (path === 'today') return raw ? todayIso() : itDate(todayIso());
    const [name, sub] = path.split('.');
    const f = this.fields.find((x) => x.name === name);
    const v = this.record.data[name];
    if (!sub) return raw ? (v ?? null) : display(f, v, this.labels);
    if (!f || typeof v !== 'string') return raw ? null : '';
    const rel = this.related.get(v);
    if (!rel) return raw ? null : '';
    const module = String(rel.__module);
    if (module === '__user') return sub === 'email' ? rel.email : '';
    if (!this.fieldsByModule.has(module)) this.fieldsByModule.set(module, await this.loadFields(module));
    const sf = this.fieldsByModule.get(module)!.find((x) => x.name === sub);
    if (raw) return rel[sub] ?? null;
    // un campo relazione del record collegato mostra solo l'id: si usa il nome se già noto
    return display(sf, rel[sub], this.labels);
  }

  async render(text: string): Promise<string> {
    await this.prepare(text);
    let out = '';
    let last = 0;
    for (const m of text.matchAll(PLACEHOLDER)) {
      out += text.slice(last, m.index) + String(await this.value(m[1]));
      last = m.index! + m[0].length;
    }
    return out + text.slice(last);
  }
}
