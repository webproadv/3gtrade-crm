import { useState } from 'react';
import { api } from '../api';
import { RecordPicker } from './RecordPicker';
import type { CrmRecord } from '../types';

interface ConvertResult {
  accountId: string;
  contactId: string;
  opportunityId: string | null;
}

const inDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Conversione del lead: crea (o collega) l'azienda, crea il contatto e, se richiesto, l'opportunità.
 * Al termine apre l'opportunità creata, altrimenti l'azienda.
 */
export function ConvertLead({
  lead,
  onCancel,
  onDone,
}: {
  lead: CrmRecord;
  onCancel: () => void;
  onDone: (r: ConvertResult) => void;
}) {
  const company = String(lead.data.company ?? '').trim();
  const person = [lead.data.last_name, lead.data.first_name].filter(Boolean).join(' ');
  const products = Array.isArray(lead.data.product_interest) ? (lead.data.product_interest as string[]).join(' + ') : '';
  const [useExisting, setUseExisting] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [withOpp, setWithOpp] = useState(true);
  const [name, setName] = useState([company || person, products].filter(Boolean).join(' - '));
  const [closeDate, setCloseDate] = useState(inDays(30));
  const [amount, setAmount] = useState(lead.data.budget != null ? String(lead.data.budget) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (useExisting && !accountId) return setError("Scegli il cliente a cui collegare il lead");
    setBusy(true);
    setError('');
    try {
      const r = await api<ConvertResult>(`/leads/${lead.id}/convert`, {
        method: 'POST',
        body: {
          ...(useExisting && accountId ? { accountId } : {}),
          createOpportunity: withOpp,
          ...(withOpp
            ? { opportunity: { name, closeDate, ...(amount.trim() ? { amount: Number(amount.replace(',', '.')) } : {}) } }
            : {}),
        },
      });
      onDone(r);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Converti lead</h2>
      <p className="muted small">
        Il lead resta nello storico con lo stato "Convertito"; le sue attività passano al nuovo cliente.
      </p>
      <div className="form-grid">
        <label className="check">
          <input type="checkbox" checked={useExisting} onChange={(e) => setUseExisting(e.target.checked)} />
          Collega a un cliente già presente
        </label>
        {useExisting ? (
          <label>
            <span>Cliente</span>
            <RecordPicker module="Accounts" value={accountId} onChange={(id) => setAccountId(id)} />
          </label>
        ) : (
          <label>
            <span>Nuovo cliente</span>
            <input value={company || person} disabled />
          </label>
        )}
        <label className="check wide">
          <input type="checkbox" checked={withOpp} onChange={(e) => setWithOpp(e.target.checked)} />
          Crea anche un'opportunità
        </label>
        {withOpp && (
          <>
            <label>
              <span>Nome opportunità</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              <span>Data chiusura prevista</span>
              <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            </label>
            <label>
              <span>Importo (€)</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          </>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <button className="primary" disabled={busy} onClick={submit}>
          {busy ? 'Conversione…' : 'Converti'}
        </button>
        <button disabled={busy} onClick={onCancel}>
          Annulla
        </button>
      </div>
    </section>
  );
}
