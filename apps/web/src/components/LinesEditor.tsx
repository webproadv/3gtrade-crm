import { useEffect, useState } from 'react';
import { ApiError, api } from '../api';
import { useSession } from '../session';
import type { CrmRecord, DocLine, Module } from '../types';
import { formatCurrency, formatNumber } from './format';
import { lineAmounts, totalsOf } from './lineMath';
import { RecordPicker } from './RecordPicker';

interface Draft {
  key: number;
  productId: string | null;
  productLabel: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  vatRate: string;
}

let seq = 0;
const toNum = (s: string) => Number(String(s).replace(',', '.'));
const toDraft = (l: DocLine): Draft => ({
  key: ++seq,
  productId: l.productId,
  productLabel: l.productLabel ?? '',
  description: l.description,
  quantity: String(l.quantity),
  unitPrice: String(l.unitPrice),
  discount: String(l.discount),
  vatRate: String(l.vatRate),
});
const emptyDraft = (): Draft => ({
  key: ++seq,
  productId: null,
  productLabel: '',
  description: '',
  quantity: '1',
  unitPrice: '',
  discount: '0',
  vatRate: '22',
});
const numeric = (d: Draft) => ({
  quantity: toNum(d.quantity),
  unitPrice: toNum(d.unitPrice),
  discount: toNum(d.discount),
  vatRate: toNum(d.vatRate),
});

/** Righe del documento (prodotti/servizi) con totali; modificabili se l'utente può modificare il record. */
export function LinesEditor({ mod, rec, onSaved }: { mod: Module; rec: CrmRecord; onSaved: () => void }) {
  const { module } = useSession();
  const canProducts = !!module('Products');
  const t = mod.lineTotals!;
  const [lines, setLines] = useState<DocLine[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<DocLine[]>(`/records/${mod.name}/${rec.id}/lines`).then(setLines).catch((e) => setError(e.message));
  }, [mod.name, rec.id]);

  const adjustment = Number(rec.data[t.adjustment]) || 0;
  const editing = drafts !== null;

  const update = (key: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds!.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const pickProduct = async (key: number, id: string | null, label?: string) => {
    if (!id) return update(key, { productId: null, productLabel: '' });
    update(key, { productId: id, productLabel: label ?? '' });
    try {
      const p = await api<CrmRecord>(`/records/Products/${id}`);
      update(key, {
        description: String(p.data.name ?? label ?? ''),
        unitPrice: p.data.unit_price != null ? String(p.data.unit_price) : '',
        vatRate: p.data.vat_rate != null ? String(p.data.vat_rate) : '22',
      });
    } catch {
      /* resta la scelta del prodotto, i valori si inseriscono a mano */
    }
  };

  const move = (i: number, dir: -1 | 1) =>
    setDrafts((ds) => {
      const a = [...ds!];
      const j = i + dir;
      if (j < 0 || j >= a.length) return a;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });

  const save = async () => {
    setSaving(true);
    setErrors({});
    setError('');
    try {
      const body = {
        lines: drafts!.map((d) => ({
          productId: d.productId,
          description: d.description,
          ...numeric(d),
        })),
      };
      const r = await api<{ lines: DocLine[] }>(`/records/${mod.name}/${rec.id}/lines`, { method: 'PUT', body });
      setLines(r.lines);
      setDrafts(null);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError) setErrors(e.errors);
    } finally {
      setSaving(false);
    }
  };

  const totals = editing
    ? totalsOf(drafts!.map(numeric), adjustment)
    : {
        net: Number(rec.data[t.net]) || 0,
        vat: Number(rec.data[t.vat]) || 0,
        adjustment,
        total: Number(rec.data[t.total]) || 0,
      };

  return (
    <section className="card">
      <div className="section-head">
        <h2>Dettagli prodotti e servizi</h2>
        {!editing && rec.permissions?.edit && lines && (
          <button
            onClick={() => {
              setErrors({});
              setError('');
              setDrafts(lines.length ? lines.map(toDraft) : [emptyDraft()]);
            }}
          >
            Modifica righe
          </button>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      {!lines ? (
        <p className="muted">Caricamento…</p>
      ) : (
        <div className="table-wrap">
          <table className="table lines">
            <thead>
              <tr>
                <th>{editing ? 'Prodotto / descrizione' : 'Descrizione'}</th>
                <th className="num">Q.tà</th>
                <th className="num">Prezzo unit.</th>
                <th className="num">Sconto %</th>
                <th className="num">IVA %</th>
                <th className="num">Imponibile</th>
                <th className="num">Totale</th>
                {editing && <th />}
              </tr>
            </thead>
            <tbody>
              {!editing && lines.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    Nessuna riga. {rec.permissions?.edit ? 'Usa “Modifica righe” per aggiungere prodotti o servizi.' : ''}
                  </td>
                </tr>
              )}
              {!editing &&
                lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.description}
                      {l.productLabel && l.productLabel !== l.description && (
                        <div className="muted small">{l.productLabel}</div>
                      )}
                    </td>
                    <td className="num">{formatNumber(l.quantity)}</td>
                    <td className="num">{formatCurrency(l.unitPrice)}</td>
                    <td className="num">{l.discount ? formatNumber(l.discount) : '—'}</td>
                    <td className="num">{formatNumber(l.vatRate)}</td>
                    <td className="num">{formatCurrency(l.net ?? 0)}</td>
                    <td className="num">{formatCurrency(l.total ?? 0)}</td>
                  </tr>
                ))}
              {editing &&
                drafts!.map((d, i) => {
                  const err = (f: string) => errors[`lines.${i}.${f}`];
                  const a = lineAmounts(numeric(d));
                  return (
                    <tr key={d.key}>
                      <td className="line-desc">
                        {canProducts && (
                          <RecordPicker
                            module="Products"
                            value={d.productId}
                            initialLabel={d.productLabel}
                            onChange={(id, label) => pickProduct(d.key, id, label)}
                          />
                        )}
                        <input
                          placeholder="Descrizione"
                          value={d.description}
                          onChange={(e) => update(d.key, { description: e.target.value })}
                          aria-label="Descrizione"
                        />
                        {(err('productId') || err('description')) && (
                          <div className="field-error">{err('productId') || err('description')}</div>
                        )}
                      </td>
                      {(['quantity', 'unitPrice', 'discount', 'vatRate'] as const).map((f) => (
                        <td key={f} className="num">
                          <input
                            className="num"
                            inputMode="decimal"
                            value={d[f]}
                            onChange={(e) => update(d.key, { [f]: e.target.value })}
                            aria-label={f}
                          />
                          {err(f) && <div className="field-error">{err(f)}</div>}
                        </td>
                      ))}
                      <td className="num">{formatCurrency(a.net)}</td>
                      <td className="num">{formatCurrency(a.total)}</td>
                      <td className="line-actions">
                        <button type="button" className="link" title="Sposta su" onClick={() => move(i, -1)} disabled={i === 0}>
                          ↑
                        </button>
                        <button
                          type="button"
                          className="link"
                          title="Sposta giù"
                          onClick={() => move(i, 1)}
                          disabled={i === drafts!.length - 1}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="link danger"
                          title="Rimuovi riga"
                          onClick={() => setDrafts((ds) => ds!.filter((x) => x.key !== d.key))}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} className="num">Imponibile</td>
                <td className="num">{formatCurrency(totals.net)}</td>
                {editing && <td />}
              </tr>
              <tr>
                <td colSpan={6} className="num">IVA</td>
                <td className="num">{formatCurrency(totals.vat)}</td>
                {editing && <td />}
              </tr>
              {totals.adjustment !== 0 && (
                <tr>
                  <td colSpan={6} className="num">Arrotondamento</td>
                  <td className="num">{formatCurrency(totals.adjustment)}</td>
                  {editing && <td />}
                </tr>
              )}
              <tr className="grand">
                <td colSpan={6} className="num">Totale documento</td>
                <td className="num">{formatCurrency(totals.total)}</td>
                {editing && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {editing && (
        <div className="lines-bar">
          <button type="button" onClick={() => setDrafts((ds) => [...ds!, emptyDraft()])}>
            + Aggiungi riga
          </button>
          <span className="spacer" />
          <button type="button" onClick={() => setDrafts(null)} disabled={saving}>
            Annulla
          </button>
          <button type="button" className="primary" onClick={save} disabled={saving}>
            {saving ? 'Salvataggio…' : 'Salva righe'}
          </button>
        </div>
      )}
      {!editing && rec.permissions?.edit && (
        <p className="muted small">L'arrotondamento si modifica dalla scheda con “Modifica”.</p>
      )}
    </section>
  );
}
