import type { ReportResult } from '../types';
import { formatCurrency, formatNumber } from './format';

const COLORS = ['#2f6fed', '#18a87b', '#f0a020', '#d9485f', '#8a5cf6', '#14a3c7', '#e86f2d', '#5b8c2a', '#c2459b', '#6b7a90'];
const MAX_BARS = 15;
const MAX_SLICES = 8;

interface Point {
  label: string;
  value: number;
}

/** Grafico dei gruppi: a barre orizzontali o a torta, sulla prima misura (totale o numero di record). */
export function ReportChart({ result, kind }: { result: ReportResult; kind: 'bar' | 'pie' }) {
  if (!result.groups?.length) return null;
  const measure = result.totalDefs.find((t) => t.key.startsWith('sum:')) ?? result.totalDefs[0];
  const fmt = (n: number) => (measure?.type === 'currency' ? formatCurrency(n) : formatNumber(n));
  const points: Point[] = result.groups.map((g) => ({
    label: g.label,
    value: Math.max(0, Number(measure ? (g.totals[measure.key] ?? 0) : g.count)),
  }));
  const title = measure ? measure.label : 'Numero di record';

  return (
    <figure className="chart">
      <figcaption className="muted small">
        {title} per {result.groupBy?.label.toLowerCase()}
      </figcaption>
      {kind === 'bar' ? <Bars points={points} fmt={fmt} /> : <Pie points={points} fmt={fmt} />}
    </figure>
  );
}

function Bars({ points, fmt }: { points: Point[]; fmt: (n: number) => string }) {
  const shown = points.slice(0, MAX_BARS);
  const max = Math.max(...shown.map((p) => p.value), 1);
  return (
    <div className="bars">
      {shown.map((p, i) => (
        <div className="bar-row" key={i}>
          <span className="bar-label" title={p.label}>
            {p.label}
          </span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(p.value / max) * 100}%`, background: COLORS[0] }} />
          </span>
          <span className="bar-value">{fmt(p.value)}</span>
        </div>
      ))}
      {points.length > MAX_BARS && <p className="muted small">Mostrati i primi {MAX_BARS} gruppi su {points.length}.</p>}
    </div>
  );
}

function Pie({ points, fmt }: { points: Point[]; fmt: (n: number) => string }) {
  const sorted = [...points].sort((a, b) => b.value - a.value);
  const slices = sorted.slice(0, MAX_SLICES);
  const rest = sorted.slice(MAX_SLICES).reduce((s, p) => s + p.value, 0);
  if (rest > 0) slices.push({ label: 'Altri', value: rest });
  const total = slices.reduce((s, p) => s + p.value, 0);
  if (total === 0) return <p className="muted">Nessun valore da rappresentare.</p>;

  let angle = -Math.PI / 2;
  const R = 80;
  const arcs = slices.map((p, i) => {
    const a = (p.value / total) * Math.PI * 2;
    const [x1, y1] = [Math.cos(angle) * R, Math.sin(angle) * R];
    angle += a;
    const [x2, y2] = [Math.cos(angle) * R, Math.sin(angle) * R];
    const d =
      a >= Math.PI * 2 - 1e-6
        ? `M ${-R} 0 A ${R} ${R} 0 1 1 ${R} 0 A ${R} ${R} 0 1 1 ${-R} 0 Z`
        : `M 0 0 L ${x1} ${y1} A ${R} ${R} 0 ${a > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
    return <path key={i} d={d} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth={1} />;
  });

  return (
    <div className="pie">
      <svg viewBox="-90 -90 180 180" width={200} height={200} role="img">
        {arcs}
      </svg>
      <ul className="legend">
        {slices.map((p, i) => (
          <li key={i}>
            <span className="swatch" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="legend-label">{p.label}</span>
            <span className="muted">
              {fmt(p.value)} · {Math.round((p.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
