import { Link } from 'react-router-dom';
import type { Field, FieldType, ReportResult } from '../types';
import { FieldValue } from './FieldValue';
import { formatCurrency, formatNumber } from './format';
import { ReportChart } from './ReportChart';

const asField = (key: string, label: string, type: FieldType) =>
  ({ name: key, label, type, options: {} }) as unknown as Field;

const NUMERIC = new Set<FieldType>(['integer', 'number', 'currency', 'percent']);
/** tipi che sono già un link: la prima colonna non li avvolge nel link al record */
const LINKS = new Set<FieldType>(['relation', 'email', 'url', 'phone']);

function Total({ type, value }: { type: FieldType; value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  return <>{type === 'currency' ? formatCurrency(value) : formatNumber(Math.round(value * 100) / 100)}</>;
}

export function ReportResultView({
  result,
  chart,
  module,
}: {
  result: ReportResult;
  chart: 'none' | 'bar' | 'pie';
  module: string;
}) {
  const { columns, rows, groups, totalDefs, totals } = result;
  return (
    <div>
      {result.hidden.length > 0 && (
        <div className="notice">
          Alcuni campi non sono visibili con il tuo profilo e sono stati ignorati: {result.hidden.join(', ')}.
        </div>
      )}

      {groups && chart !== 'none' && groups.length > 0 && (
        <div className="card">
          <ReportChart result={result} kind={chart} />
        </div>
      )}

      {groups && result.groupBy && (
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table className="table compact">
            <thead>
              <tr>
                <th>{result.groupBy.label}</th>
                <th className="num">Record</th>
                {totalDefs.map((t) => (
                  <th key={t.key} className="num">
                    {t.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g, i) => (
                <tr key={i}>
                  <td>{g.label}</td>
                  <td className="num">{formatNumber(g.count)}</td>
                  {totalDefs.map((t) => (
                    <td key={t.key} className="num">
                      <Total type={t.type} value={g.totals[t.key]} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="total-row">
                <td>Totale</td>
                <td className="num">{formatNumber(totals.count ?? 0)}</td>
                {totalDefs.map((t) => (
                  <td key={t.key} className="num">
                    <Total type={t.type} value={totals[t.key]} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="section-head">
        <h2>
          Dettaglio <span className="muted small">({formatNumber(result.rowCount)} record)</span>
        </h2>
      </div>
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={NUMERIC.has(c.type) ? 'num' : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="empty muted" colSpan={columns.length}>
                  Nessun record corrisponde ai filtri.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                {columns.map((c, i) => (
                  <td key={c.key} className={NUMERIC.has(c.type) ? 'num' : undefined}>
                    {i === 0 && !LINKS.has(c.type) ? (
                      <Link to={`/m/${module}/${r.id}`}>
                        <FieldValue field={asField(c.key, c.label, c.type)} value={r.values[c.key]} refs={result.refs} />
                      </Link>
                    ) : (
                      <FieldValue field={asField(c.key, c.label, c.type)} value={r.values[c.key]} refs={result.refs} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {!groups && totalDefs.length > 0 && rows.length > 0 && (
              <tr className="total-row">
                <td colSpan={columns.length}>
                  {totalDefs.map((t) => (
                    <span key={t.key} className="total-item">
                      {t.label}: <strong><Total type={t.type} value={totals[t.key]} /></strong>
                    </span>
                  ))}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {result.truncated && (
        <p className="muted small">
          Mostrati i primi {formatNumber(rows.length)} record: l'esportazione per Excel li contiene tutti.
        </p>
      )}
    </div>
  );
}
