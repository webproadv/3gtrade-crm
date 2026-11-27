import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { ConditionsEditor } from '../../components/ConditionsEditor';
import { formatDateTime } from '../../components/format';
import { useSession } from '../../session';
import type { Field, Workflow, WorkflowAction, WorkflowRun, WorkflowTrigger } from '../../types';
import {
  ACTION_LABELS,
  TRIGGER_LABELS,
  editableFields,
  emailTargets,
  newAction,
  newTrigger,
} from './workflowText';

type Draft = Omit<Workflow, 'id' | 'lastRunAt' | 'runs' | 'errors'>;
const NUMERIC = new Set(['integer', 'number', 'currency', 'percent']);

/** Crea o modifica un workflow: quando, se (condizioni), allora (azioni); con il registro delle esecuzioni. */
export function WorkflowEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { modules, module } = useSession();
  const [wf, setWf] = useState<Draft | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const usable = modules;
  useEffect(() => {
    api('/users').then(setUsers).catch(() => setUsers([]));
    if (id) {
      api<Workflow>(`/workflows/${id}`)
        .then(({ id: _i, ...w }) => setWf(w))
        .catch((e) => setError(e.message));
      api<WorkflowRun[]>(`/workflows/${id}/runs`).then(setRuns).catch(() => setRuns([]));
    } else {
      const m = usable[0];
      setWf({
        name: '',
        description: '',
        module: m?.name ?? '',
        active: true,
        trigger: { type: 'create' },
        conditions: [],
        actions: [newAction('create_activity', m)],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, modules.length]);

  if (!wf) return error ? <div className="error">{error}</div> : <p className="muted">Caricamento…</p>;
  const mod = module(wf.module);
  const activities = module('Activities');
  const activityTypes = activities?.fields.find((f) => f.name === 'activity_type')?.options.values ?? ['Compito'];
  const patch = (p: Partial<Draft>) => setWf((w) => (w ? { ...w, ...p } : w));
  const setAction = (i: number, a: WorkflowAction) => patch({ actions: wf.actions.map((x, k) => (k === i ? a : x)) });
  const err = (k: string) => errors[k] && <span className="field-error">{errors[k]}</span>;

  const save = async () => {
    setErrors({});
    setError('');
    try {
      const saved = id
        ? await api<Workflow>(`/workflows/${id}`, { method: 'PATCH', body: wf })
        : await api<Workflow>('/workflows', { method: 'POST', body: wf });
      setSavedAt(new Date());
      if (!id) nav(`/admin/workflows/${saved.id}`, { replace: true });
      else api<WorkflowRun[]>(`/workflows/${id}/runs`).then(setRuns).catch(() => undefined);
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.errors);
      setError((e as Error).message);
    }
  };
  const remove = async () => {
    if (!id || !window.confirm(`Eliminare il workflow "${wf.name}"?`)) return;
    await api(`/workflows/${id}`, { method: 'DELETE' });
    nav('/admin/workflows');
  };

  const t = wf.trigger;
  const dateFields = mod?.fields.filter((f) => f.type === 'date' || f.type === 'datetime') ?? [];
  const targets = emailTargets(mod, modules);

  return (
    <div>
      <div className="page-head">
        <h1>{id ? wf.name || 'Workflow' : 'Nuovo workflow'}</h1>
        <Link to="/admin/workflows">‹ Tutti i workflow</Link>
      </div>

      <section className="card">
        <div className="form-grid">
          <label>
            <span>Nome</span>
            <input value={wf.name} onChange={(e) => patch({ name: e.target.value })} placeholder="es. Welcome Letter alla firma" />
            {err('name')}
          </label>
          <label>
            <span>Modulo</span>
            <select
              value={wf.module}
              onChange={(e) => {
                const m = module(e.target.value);
                patch({
                  module: e.target.value,
                  trigger: newTrigger(wf.trigger.type, m),
                  conditions: [],
                  actions: wf.actions.map((a) => newAction(a.type, m)),
                });
              }}
            >
              {usable.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            <span>Descrizione</span>
            <input value={wf.description} onChange={(e) => patch({ description: e.target.value })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={wf.active} onChange={(e) => patch({ active: e.target.checked })} />
            Attivo
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Quando</h2>
        <div className="filter-row">
          <select
            value={t.type}
            onChange={(e) => patch({ trigger: newTrigger(e.target.value as WorkflowTrigger['type'], mod) })}
          >
            {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {t.type === 'field_change' && (
            <FieldSelect fields={mod?.fields ?? []} value={t.field} onChange={(field) => patch({ trigger: { ...t, field } })} />
          )}
          {t.type === 'manual' && (
            <input
              placeholder="Testo del pulsante"
              value={t.buttonLabel}
              onChange={(e) => patch({ trigger: { ...t, buttonLabel: e.target.value } })}
            />
          )}
          {t.type === 'scheduled' && (
            <>
              <input
                type="number"
                min={0}
                max={365}
                style={{ width: '5em' }}
                value={Math.abs(t.days)}
                onChange={(e) => patch({ trigger: { ...t, days: Math.sign(t.days || 1) * Number(e.target.value || 0) } })}
              />
              <span>giorni</span>
              <select
                value={t.days < 0 ? 'before' : 'after'}
                onChange={(e) => patch({ trigger: { ...t, days: Math.abs(t.days) * (e.target.value === 'before' ? -1 : 1) } })}
              >
                <option value="after">dopo</option>
                <option value="before">prima di</option>
              </select>
              <select value={t.from} onChange={(e) => patch({ trigger: { ...t, from: e.target.value } })}>
                <option value="created">la creazione</option>
                <option value="updated">l'ultima modifica</option>
                {dateFields.map((f) => (
                  <option key={f.name} value={`field:${f.name}`}>
                    {f.label}
                  </option>
                ))}
                {mod?.fields.map((f) => (
                  <option key={`c-${f.name}`} value={`changed:${f.name}`}>
                    l'ultimo cambio di {f.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        {err('trigger.field')}
        {err('trigger.from')}
        {t.type === 'scheduled' && (
          <p className="muted small">
            Ogni record viene trattato una sola volta per scadenza. Esempio: "7 giorni dopo l'ultimo cambio di Stato" con la
            condizione Stato = Documentazione incompleta.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Se</h2>
        {wf.conditions.length === 0 && <p className="muted small">Nessuna condizione: il workflow vale per tutti i record.</p>}
        {mod && (
          <ConditionsEditor
            mod={mod}
            filters={wf.conditions}
            users={users}
            errors={errors}
            errorPrefix="conditions"
            addLabel="+ Aggiungi condizione"
            onChange={(conditions) => patch({ conditions })}
          />
        )}
      </section>

      <section className="card">
        <h2>Allora</h2>
        {err('actions')}
        {wf.actions.map((a, i) => (
          <div className="wf-action" key={i}>
            <div className="filter-row">
              <strong>{i + 1}.</strong>
              <select value={a.type} onChange={(e) => setAction(i, newAction(e.target.value as WorkflowAction['type'], mod))}>
                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button type="button" className="link danger" onClick={() => patch({ actions: wf.actions.filter((_, k) => k !== i) })}>
                Togli
              </button>
              {err(`actions.${i}`)}
            </div>

            {a.type === 'update_field' && (
              <div className="filter-row">
                <FieldSelect
                  fields={editableFields(mod)}
                  value={a.field}
                  onChange={(field) => setAction(i, { ...a, field, value: '' })}
                />
                <span>diventa</span>
                <ValueInput
                  field={mod?.fields.find((f) => f.name === a.field)}
                  value={a.value}
                  onChange={(value) => setAction(i, { ...a, value })}
                />
                {err(`actions.${i}.field`)}
              </div>
            )}

            {a.type === 'create_activity' && (
              <div className="form-grid">
                <label className="wide">
                  <span>Oggetto</span>
                  <input value={a.subject} onChange={(e) => setAction(i, { ...a, subject: e.target.value })} />
                  {err(`actions.${i}.subject`)}
                </label>
                <label>
                  <span>Tipo</span>
                  <select value={a.activityType} onChange={(e) => setAction(i, { ...a, activityType: e.target.value })}>
                    {activityTypes.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Scadenza: giorni da oggi</span>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={a.dueDays}
                    onChange={(e) => setAction(i, { ...a, dueDays: Number(e.target.value || 0) })}
                  />
                </label>
                <label>
                  <span>Assegnata a</span>
                  <select value={a.assignTo} onChange={(e) => setAction(i, { ...a, assignTo: e.target.value })}>
                    <option value="owner">Assegnatario del record</option>
                    {users.map((u) => (
                      <option key={u.id} value={`user:${u.id}`}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wide">
                  <span>Descrizione</span>
                  <textarea rows={2} value={a.description} onChange={(e) => setAction(i, { ...a, description: e.target.value })} />
                </label>
              </div>
            )}

            {a.type === 'send_email' && (
              <div className="form-grid">
                <label className="wide">
                  <span>Destinatario</span>
                  <select value={a.to} onChange={(e) => setAction(i, { ...a, to: e.target.value })}>
                    <optgroup label="Interne (partono da sole)">
                      <option value="owner">Assegnatario del record</option>
                      {users.map((u) => (
                        <option key={u.id} value={`user:${u.id}`}>
                          {u.name}
                        </option>
                      ))}
                    </optgroup>
                    {targets.length > 0 && (
                      <optgroup label="Cliente (bozza da inviare a mano)">
                        {targets.map((x) => (
                          <option key={x.value} value={x.value}>
                            {x.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {err(`actions.${i}.to`)}
                </label>
                {a.to.startsWith('field:') && (
                  <p className="notice small wide">
                    Email per il cliente: il workflow la prepara come bozza sulla scheda. Parte solo quando un utente la
                    controlla e preme Invia.
                  </p>
                )}
                <label className="wide">
                  <span>Oggetto</span>
                  <input value={a.subject} onChange={(e) => setAction(i, { ...a, subject: e.target.value })} />
                  {err(`actions.${i}.subject`)}
                </label>
                <label className="wide">
                  <span>Testo</span>
                  <textarea rows={6} value={a.body} onChange={(e) => setAction(i, { ...a, body: e.target.value })} />
                </label>
              </div>
            )}
          </div>
        ))}
        <button type="button" onClick={() => patch({ actions: [...wf.actions, newAction('create_activity', mod)] })}>
          + Aggiungi azione
        </button>
        <Placeholders fields={mod?.fields ?? []} />
      </section>

      {error && <div className="error">{error}</div>}
      {savedAt && !error && <div className="notice">Salvato alle {savedAt.toLocaleTimeString('it-IT')}.</div>}
      <div className="actions">
        <button className="primary" onClick={save}>
          Salva workflow
        </button>
        <button onClick={() => nav('/admin/workflows')}>Annulla</button>
        {id && (
          <button className="danger" onClick={remove}>
            Elimina
          </button>
        )}
      </div>

      {id && (
        <section className="card">
          <h2>Ultime esecuzioni</h2>
          {runs.length === 0 && <p className="muted small">Non è ancora stato eseguito.</p>}
          <ul className="runs">
            {runs.map((r) => (
              <li key={r.id} className={r.status === 'error' ? 'danger-text' : ''}>
                <span className="muted small">{formatDateTime(r.createdAt)}</span>{' '}
                <Link to={`/m/${r.module}/${r.recordId}`}>{r.recordLabel || '(senza nome)'}</Link>
                {' — '}
                {r.status === 'error' ? `errore: ${r.message}` : r.message || 'condizioni verificate'}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FieldSelect({ fields, value, onChange }: { fields: Field[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {fields.map((f) => (
        <option key={f.name} value={f.name}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

function ValueInput({
  field,
  value,
  onChange,
}: {
  field: Field | undefined;
  value: string | number | boolean | null;
  onChange: (v: string | number | boolean | null) => void;
}) {
  if (field?.type === 'boolean') {
    return (
      <select value={value === true ? 'true' : 'false'} onChange={(e) => onChange(e.target.value === 'true')}>
        <option value="true">Sì</option>
        <option value="false">No</option>
      </select>
    );
  }
  if (field?.type === 'picklist') {
    return (
      <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">(vuoto)</option>
        {field.options.values?.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      value={value === null ? '' : String(value)}
      placeholder={field && NUMERIC.has(field.type) ? 'numero o $campo$' : 'testo, anche con $campo$'}
      onChange={(e) => {
        const v = e.target.value;
        onChange(field && NUMERIC.has(field.type) && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);
      }}
    />
  );
}

function Placeholders({ fields }: { fields: Field[] }) {
  return (
    <details className="placeholders">
      <summary>Segnaposto utilizzabili nei testi</summary>
      <p className="muted small">
        Scrivi il nome tra due $: verrà sostituito con il valore del record. Per un record collegato aggiungi il campo dopo un
        punto, es. <code>$account_id.email$</code>. Speciali: <code>$record$</code> (nome del record), <code>$owner$</code>{' '}
        (assegnatario), <code>$today$</code> (data di oggi).
      </p>
      <ul className="checks">
        {fields.map((f) => (
          <li key={f.name}>
            <code>${f.name}$</code> {f.label}
          </li>
        ))}
      </ul>
    </details>
  );
}
