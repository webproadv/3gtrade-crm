import { FormEvent, useState } from 'react';
import { useSession } from '../session';

export function Login() {
  const { login } = useSession();
  const [tenant, setTenant] = useState('demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(tenant, email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="card login" onSubmit={submit}>
        <h1>3Gtrade CRM</h1>
        <label>
          Azienda (tenant)
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy}>
          {busy ? 'Accesso…' : 'Accedi'}
        </button>
      </form>
    </div>
  );
}
