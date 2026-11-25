import { FormEvent, useState } from 'react';
import { api, ApiError } from '../api';

export function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setErrors({});
    setDone(false);
    if (next !== repeat) {
      setErrors({ repeat: 'le due password non coincidono' });
      return;
    }
    setBusy(true);
    try {
      await api('/auth/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      setDone(true);
      setCurrent('');
      setNext('');
      setRepeat('');
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.errors).length) setErrors(err.errors);
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>Cambia password</h1>
      <form className="card" onSubmit={submit} style={{ maxWidth: 420 }}>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <label>
            <span>Password attuale</span>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
            {errors.currentPassword && <span className="field-error">{errors.currentPassword}</span>}
          </label>
          <label>
            <span>Nuova password (almeno 8 caratteri)</span>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
            {errors.newPassword && <span className="field-error">{errors.newPassword}</span>}
          </label>
          <label>
            <span>Ripeti la nuova password</span>
            <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required autoComplete="new-password" />
            {errors.repeat && <span className="field-error">{errors.repeat}</span>}
          </label>
        </div>
        {error && <div className="error">{error}</div>}
        {done && <p>Password aggiornata. Usala dal prossimo accesso.</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Salvataggio…' : 'Salva la nuova password'}
        </button>
      </form>
    </div>
  );
}
