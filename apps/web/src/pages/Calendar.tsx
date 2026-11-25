import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { dayKey, formatTime } from '../components/format';
import { useSession } from '../session';
import type { CrmRecord, ListResult } from '../types';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const shift = (x.getDay() + 6) % 7; // lunedì = 0
  x.setDate(x.getDate() - shift);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function parseDay(s: string | null): Date {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function Calendar() {
  const { me, module } = useSession();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view') === 'week' ? 'week' : 'month';
  const anchor = parseDay(sp.get('date'));
  const owner = sp.get('owner') ?? 'me';
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<ListResult | null>(null);
  const [error, setError] = useState('');
  const mod = module('Activities');

  const { from, days } = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(anchor);
      return { from: start, days: Array.from({ length: 7 }, (_, i) => addDays(start, i)) };
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = startOfWeek(first);
    return { from: start, days: Array.from({ length: 42 }, (_, i) => addDays(start, i)) };
  }, [view, dayKey(anchor)]);

  const to = addDays(days[days.length - 1], 1);

  useEffect(() => {
    api('/users').then(setUsers).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    setError('');
    const ownerId = owner === 'me' ? me?.id : owner === 'all' ? undefined : owner;
    api<ListResult>(`/calendar${qs({ from: from.toISOString(), to: to.toISOString(), ownerId })}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [from.getTime(), view, owner, me?.id]);

  const byDay = useMemo(() => {
    const map = new Map<string, CrmRecord[]>();
    for (const a of data?.items ?? []) {
      const k = dayKey(new Date(String(a.data.start)));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    }
    return map;
  }, [data]);

  if (!mod) return <p>Il modulo Attività non è disponibile per il tuo profilo.</p>;

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setSp(next);
  };
  const move = (dir: number) => {
    const d =
      view === 'week'
        ? addDays(anchor, dir * 7)
        : new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
    set({ date: dayKey(d) });
  };
  const title =
    view === 'week'
      ? `${days[0].toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('it-IT', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}`
      : anchor.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const today = dayKey(new Date());
  const newAt = (d: Date) => {
    if (!mod.permissions?.create) return;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0);
    nav(`/m/Activities/new?${new URLSearchParams({ start: start.toISOString(), activity_type: 'Appuntamento' })}`);
  };

  const item = (a: CrmRecord) => (
    <Link
      key={a.id}
      to={`/m/Activities/${a.id}`}
      className={`cal-item ${a.data.status === 'Completata' ? 'done' : ''} ${a.data.status === 'Annullata' ? 'cancelled' : ''}`}
      data-type={String(a.data.activity_type ?? '')}
      title={`${a.data.activity_type ?? ''} · ${a.label}`}
      onClick={(e) => e.stopPropagation()}
    >
      {!a.data.all_day && <span className="cal-time">{formatTime(String(a.data.start))}</span>}
      {a.label}
    </Link>
  );

  return (
    <div>
      <div className="page-head">
        <h1>Calendario</h1>
        {mod.permissions?.create && (
          <button className="primary" onClick={() => nav('/m/Activities/new')}>
            Nuova attività
          </button>
        )}
      </div>
      <div className="toolbar cal-toolbar">
        <button onClick={() => move(-1)} aria-label="Precedente">
          ‹
        </button>
        <button onClick={() => set({ date: dayKey(new Date()) })}>Oggi</button>
        <button onClick={() => move(1)} aria-label="Successivo">
          ›
        </button>
        <strong className="cal-title">{title}</strong>
        <span className="spacer" />
        <select value={owner} onChange={(e) => set({ owner: e.target.value })}>
          <option value="me">Le mie attività</option>
          <option value="all">Tutte quelle che posso vedere</option>
          {users
            .filter((u) => u.id !== me?.id)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>
        <div className="segmented">
          <button className={view === 'month' ? 'active' : ''} onClick={() => set({ view: 'month' })}>
            Mese
          </button>
          <button className={view === 'week' ? 'active' : ''} onClick={() => set({ view: 'week' })}>
            Settimana
          </button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}

      <div className={`cal cal-${view}`}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-head">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const k = dayKey(d);
          const items = byDay.get(k) ?? [];
          const outside = view === 'month' && d.getMonth() !== anchor.getMonth();
          const max = view === 'month' ? 4 : items.length;
          return (
            <div
              key={k}
              className={`cal-day ${outside ? 'outside' : ''} ${k === today ? 'today' : ''}`}
              onClick={() => newAt(d)}
            >
              <div className="cal-date">
                {view === 'week' ? d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : d.getDate()}
              </div>
              {items.slice(0, max).map(item)}
              {items.length > max && (
                <button
                  className="link small"
                  onClick={(e) => {
                    e.stopPropagation();
                    set({ view: 'week', date: k });
                  }}
                >
                  altre {items.length - max}…
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="cal-legend muted small">
        {['Chiamata', 'Appuntamento', 'Compito', 'Email'].map((t) => (
          <span key={t} className="cal-item legend" data-type={t}>
            {t}
          </span>
        ))}
        {mod.permissions?.create && <span>Fai clic su un giorno per aggiungere un appuntamento.</span>}
      </div>
    </div>
  );
}
