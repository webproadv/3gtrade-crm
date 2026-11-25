import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import { useSession } from '../../session';
import { FIELD_TYPE_LABELS, type Field, type FieldType, type Module } from '../../types';

const SHARING = {
  private: 'Privato (proprietario e superiori nella gerarchia)',
  public_read: 'Pubblico in sola lettura',
  public_readwrite: 'Pubblico in lettura e scrittura',
};

export function AdminModules() {
  const { reload } = useSession();
  const [modules, setModules] = useState<Module[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const m = await api<Module[]>('/admin/modules');
    setModules(m);
    setSelected((s) => s || m[0]?.name || '');
  };
  useEffect(() => {
    void load();
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await load();
      await reload();
    } catch (e) {
      const err = e as ApiError;
      setError([err.message, ...Object.entries(err.errors ?? {}).map(([k, v]) => `${k}: ${v}`)].join(' — '));
    }
  };

  const mod = modules.find((m) => m.name === selected);

  return (
    <div>
      <h1>Moduli e campi</h1>
      {error && <div className="error">{error}</div>}
      <div className="admin-split">
        <div className="card side-list">
          {modules.map((m) => (
            <button key={m.name} className={m.name === selected ? 'active' : ''} onClick={() => setSelected(m.name)}>
              {m.label} {m.isCustom && <span className="tag">personalizzato</span>}
            </button>
          ))}
          <NewModuleForm onCreate={(b) => run(async () => setSelected((await api<Module>('/admin/modules', { method: 'POST', body: b })).name))} />
        </div>
        {mod && (
          <div>
            <section className="card">
              <h2>
                {mod.label} <span className="muted small">({mod.name})</span>
              </h2>
              <label className="inline">
                Accesso ai record
                <select
                  value={mod.sharing}
                  onChange={(e) =>
                    run(() => api(`/admin/modules/${mod.name}`, { method: 'PATCH', body: { sharing: e.target.value } }))
                  }
                >
                  {Object.entries(SHARING).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </section>
            <section className="card">
              <h2>Campi</h2>
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Etichetta</th>
                    <th>Nome tecnico</th>
                    <th>Tipo</th>
                    <th>Blocco</th>
                    <th>Obbligatorio</th>
                    <th>In lista</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {mod.fields.map((f) => (
                    <FieldRow key={f.id} field={f} run={run} />
                  ))}
                </tbody>
              </table>
            </section>
            <NewFieldForm
              modules={modules}
              onCreate={(b) => run(() => api(`/admin/modules/${mod.name}/fields`, { method: 'POST', body: b }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function FieldRow({ field: f, run }: { field: Field; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const patch = (body: object) => run(() => api(`/admin/fields/${f.id}`, { method: 'PATCH', body }));
  return (
    <tr>
      <td>
        <input
          defaultValue={f.label}
          onBlur={(e) => e.target.value !== f.label && e.target.value && patch({ label: e.target.value })}
        />
      </td>
      <td className="muted small">{f.name}</td>
      <td>
        {FIELD_TYPE_LABELS[f.type]}
        {f.type === 'relation' && <span className="muted"> → {f.options.module}</span>}
        {f.options.values && <div className="muted small">{f.options.values.join(', ')}</div>}
      </td>
      <td className="small">{f.block}</td>
      <td>
        <input type="checkbox" checked={f.required} onChange={(e) => patch({ required: e.target.checked })} />
      </td>
      <td>
        <input type="checkbox" checked={f.inList} onChange={(e) => patch({ inList: e.target.checked })} />
      </td>
      <td>
        {f.isCustom && (
          <button
            className="link danger"
            onClick={() =>
              window.confirm(`Eliminare il campo "${f.label}" e i suoi valori?`) &&
              run(() => api(`/admin/fields/${f.id}`, { method: 'DELETE' }))
            }
          >
            elimina
          </button>
        )}
      </td>
    </tr>
  );
}

function NewFieldForm({ modules, onCreate }: { modules: Module[]; onCreate: (b: object) => Promise<void> }) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [block, setBlock] = useState('');
  const [values, setValues] = useState('');
  const [target, setTarget] = useState('');
  const [required, setRequired] = useState(false);
  const [inList, setInList] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const options: Record<string, unknown> = {};
    if (type === 'picklist' || type === 'multipicklist') {
      options.values = values.split('\n').map((v) => v.trim()).filter(Boolean);
    }
    if (type === 'relation') options.module = target;
    await onCreate({ label, type, block: block || undefined, required, inList, options });
    setLabel('');
    setValues('');
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Nuovo campo personalizzato</h2>
      <div className="form-grid">
        <label>
          <span>Etichetta</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} required />
        </label>
        <label>
          <span>Tipo</span>
          <select value={type} onChange={(e) => setType(e.target.value as FieldType)}>
            {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Blocco</span>
          <input value={block} placeholder="Informazioni personalizzate" onChange={(e) => setBlock(e.target.value)} />
        </label>
        {(type === 'picklist' || type === 'multipicklist') && (
          <label className="wide">
            <span>Valori (uno per riga)</span>
            <textarea rows={4} value={values} onChange={(e) => setValues(e.target.value)} required />
          </label>
        )}
        {type === 'relation' && (
          <label>
            <span>Modulo collegato</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} required>
              <option value="">—</option>
              {modules.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Obbligatorio
        </label>
        <label className="check">
          <input type="checkbox" checked={inList} onChange={(e) => setInList(e.target.checked)} /> Mostra in lista
        </label>
      </div>
      <button className="primary">Aggiungi campo</button>
    </form>
  );
}

function NewModuleForm({ onCreate }: { onCreate: (b: object) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [labelSingular, setLabelSingular] = useState('');
  const [name, setName] = useState('');
  if (!open) {
    return (
      <button className="link" onClick={() => setOpen(true)}>
        + Nuovo modulo
      </button>
    );
  }
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        await onCreate({ name, label, labelSingular });
        setOpen(false);
      }}
    >
      <input placeholder="Etichetta (es. Progetti)" value={label} onChange={(e) => setLabel(e.target.value)} required />
      <input
        placeholder="Singolare (es. Progetto)"
        value={labelSingular}
        onChange={(e) => setLabelSingular(e.target.value)}
        required
      />
      <input placeholder="Nome tecnico (es. Projects)" value={name} onChange={(e) => setName(e.target.value)} required />
      <button className="primary">Crea</button>
    </form>
  );
}
