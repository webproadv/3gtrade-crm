import type { Field, Module, WorkflowAction, WorkflowTrigger } from '../../types';

export const TRIGGER_LABELS: Record<WorkflowTrigger['type'], string> = {
  create: 'Alla creazione del record',
  save: 'A ogni salvataggio (creazione e modifica)',
  field_change: 'Quando cambia un campo',
  first_match: 'La prima volta che le condizioni sono vere',
  scheduled: 'A una scadenza (controllo automatico ogni pochi minuti)',
  manual: 'Con un pulsante sulla scheda',
};

export const ACTION_LABELS: Record<WorkflowAction['type'], string> = {
  update_field: 'Aggiorna un campo',
  create_activity: "Crea un'attività",
  send_email: "Prepara un'email",
};

export function newTrigger(type: WorkflowTrigger['type'], mod: Module | undefined): WorkflowTrigger {
  const first = mod?.fields[0]?.name ?? '';
  switch (type) {
    case 'field_change':
      return { type, field: first };
    case 'scheduled':
      return { type, from: 'updated', days: 7 };
    case 'manual':
      return { type, buttonLabel: '' };
    default:
      return { type };
  }
}

export function newAction(type: WorkflowAction['type'], mod: Module | undefined): WorkflowAction {
  switch (type) {
    case 'update_field':
      return { type, field: editableFields(mod)[0]?.name ?? '', value: '' };
    case 'create_activity':
      return { type, subject: '', activityType: 'Compito', dueDays: 0, assignTo: 'owner', description: '' };
    case 'send_email':
      return { type, to: 'owner', subject: '', body: '' };
  }
}

export const editableFields = (mod: Module | undefined): Field[] =>
  (mod?.fields ?? []).filter((f) => !f.options.computed);

const fieldLabel = (mod: Module | undefined, name: string) => mod?.fields.find((f) => f.name === name)?.label ?? name;

/** Riferimento delle scadenze: "created", "updated", "field:x", "changed:x". */
export function fromLabel(mod: Module | undefined, from: string) {
  if (from === 'created') return 'la creazione';
  if (from === 'updated') return "l'ultima modifica";
  if (from.startsWith('field:')) return fieldLabel(mod, from.slice(6));
  return `l'ultimo cambio di ${fieldLabel(mod, from.slice(8))}`;
}

export function triggerSummary(mod: Module | undefined, t: WorkflowTrigger) {
  switch (t.type) {
    case 'field_change':
      return `Quando cambia ${fieldLabel(mod, t.field)}`;
    case 'scheduled': {
      const n = Math.abs(t.days);
      const when = t.days < 0 ? 'prima di' : 'dopo';
      return `${n} giorni ${when} ${fromLabel(mod, t.from)}`;
    }
    case 'manual':
      return `Pulsante "${t.buttonLabel || 'Esegui'}"`;
    default:
      return TRIGGER_LABELS[t.type];
  }
}

/** Destinatari possibili delle email: utenti del CRM (interne) o indirizzi presi dal record (clienti). */
export function emailTargets(mod: Module | undefined, modules: Module[]) {
  const out: { value: string; label: string; customer: boolean }[] = [];
  for (const f of mod?.fields ?? []) {
    if (f.type === 'email') out.push({ value: `field:${f.name}`, label: f.label, customer: true });
    if (f.type === 'relation') {
      const target = modules.find((m) => m.name === f.options.module);
      for (const sf of target?.fields ?? []) {
        if (sf.type === 'email') out.push({ value: `field:${f.name}.${sf.name}`, label: `${f.label} › ${sf.label}`, customer: true });
      }
    }
  }
  return out;
}
