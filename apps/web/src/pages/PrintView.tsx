import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { groupByBlock } from '../components/blocks';
import { FieldValue } from '../components/FieldValue';
import { formatCurrency, formatNumber } from '../components/format';
import { useSession } from '../session';
import type { CrmRecord, DocLine } from '../types';

/** Versione stampabile di un documento con righe (PDA): intestazione, campi, righe, totali e firma. */
export function PrintView() {
  const { module: name = '', id = '' } = useParams();
  const { module, me } = useSession();
  const mod = module(name);
  const [rec, setRec] = useState<CrmRecord | null>(null);
  const [lines, setLines] = useState<DocLine[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api<CrmRecord>(`/records/${name}/${id}`), api<DocLine[]>(`/records/${name}/${id}/lines`)])
      .then(([r, l]) => {
        setRec(r);
        setLines(l);
      })
      .catch((e) => setError(e.message));
  }, [name, id]);

  useEffect(() => {
    if (rec && lines) {
      document.title = `${mod?.labelSingular ?? ''} ${rec.label}`.trim();
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [rec, lines, mod]);

  if (error) return <div className="error">{error}</div>;
  if (!mod || !rec || !lines) return <p className="muted">Caricamento…</p>;
  if (!mod.lineTotals) return <div className="error">Questo modulo non ha una versione stampabile.</div>;

  const t = mod.lineTotals;
  const totalsBlock = mod.fields.find((f) => f.name === t.total)?.block;
  const num = (f: string) => Number(rec.data[f]) || 0;
  const blocks = groupByBlock(
    mod.fields.filter((f) => f.block !== totalsBlock && rec.data[f.name] != null && rec.data[f.name] !== ''),
  );

  return (
    <div className="print-doc">
      <div className="print-actions no-print">
        <button className="primary" onClick={() => window.print()}>
          Stampa
        </button>
        <button onClick={() => window.close()}>Chiudi</button>
      </div>
      <header className="print-head">
        <div>
          <div className="print-company">{me?.tenantName}</div>
        </div>
        <div className="print-title">
          <h1>{mod.labelSingular}</h1>
          <div>{rec.label}</div>
        </div>
      </header>

      {blocks.map(([block, fields]) => (
        <section key={block} className="print-block">
          <h2>{block}</h2>
          <dl className="fields">
            {fields.map((f) => (
              <div key={f.name} className={f.type === 'textarea' ? 'wide' : ''}>
                <dt>{f.label}</dt>
                <dd>
                  <FieldValue field={f} value={rec.data[f.name]} refs={rec.refs} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <section className="print-block">
        <h2>Prodotti e servizi</h2>
        <table className="table lines">
          <thead>
            <tr>
              <th>Descrizione</th>
              <th className="num">Q.tà</th>
              <th className="num">Prezzo unit.</th>
              <th className="num">Sconto %</th>
              <th className="num">IVA %</th>
              <th className="num">Imponibile</th>
              <th className="num">Totale</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Nessuna riga.
                </td>
              </tr>
            )}
            {lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td className="num">{formatNumber(l.quantity)}</td>
                <td className="num">{formatCurrency(l.unitPrice)}</td>
                <td className="num">{l.discount ? formatNumber(l.discount) : '—'}</td>
                <td className="num">{formatNumber(l.vatRate)}</td>
                <td className="num">{formatCurrency(l.net ?? 0)}</td>
                <td className="num">{formatCurrency(l.total ?? 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="num">Imponibile</td>
              <td className="num">{formatCurrency(num(t.net))}</td>
            </tr>
            <tr>
              <td colSpan={6} className="num">IVA</td>
              <td className="num">{formatCurrency(num(t.vat))}</td>
            </tr>
            {num(t.adjustment) !== 0 && (
              <tr>
                <td colSpan={6} className="num">Arrotondamento</td>
                <td className="num">{formatCurrency(num(t.adjustment))}</td>
              </tr>
            )}
            <tr className="grand">
              <td colSpan={6} className="num">Totale documento</td>
              <td className="num">{formatCurrency(num(t.total))}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <footer className="print-signatures">
        <div>
          <div className="sign-line" />
          Data e luogo
        </div>
        <div>
          <div className="sign-line" />
          Firma del cliente
        </div>
      </footer>
    </div>
  );
}
