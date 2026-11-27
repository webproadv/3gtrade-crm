import { z } from 'zod';
import { FILTER_OPS } from '../reports/report-config';

/**
 * Definizione di un workflow, come in vtenext:
 * - quando: alla creazione, a ogni salvataggio, al cambio di un campo, la prima volta che le
 *   condizioni sono vere, a una scadenza (giorni da una data o dall'ultimo cambio di un campo)
 *   oppure a mano con un pulsante sulla scheda;
 * - se: condizioni sui campi del record (gli stessi filtri dei rapporti);
 * - allora: azioni (aggiornare un campo, creare un'attività, preparare un'email).
 */
export const TRIGGER_TYPES = ['create', 'save', 'field_change', 'first_match', 'scheduled', 'manual'] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const TriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create') }),
  z.object({ type: z.literal('save') }),
  z.object({ type: z.literal('first_match') }),
  z.object({ type: z.literal('manual'), buttonLabel: z.string().trim().max(60).default('') }),
  z.object({ type: z.literal('field_change'), field: z.string().min(1, 'scegli il campo') }),
  z.object({
    type: z.literal('scheduled'),
    /** created, updated, field:<campo data> oppure changed:<campo> (ultimo cambio del campo) */
    from: z.string().regex(/^(created|updated|field:[a-z0-9_]+|changed:[a-z0-9_]+)$/, 'riferimento non valido'),
    /** giorni dopo il riferimento (negativi = prima di una data, es. 7 giorni prima della scadenza) */
    days: z.number().int().min(-365).max(365),
  }),
]);
export type Trigger = z.infer<typeof TriggerSchema>;

export const ConditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(FILTER_OPS),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

/** Destinatario: "owner" (assegnatario), "user:<id>", "field:<campo email>" o "field:<relazione>.<campo email>". */
const RECIPIENT = /^(owner|user:[0-9a-f-]{36}|field:[a-z0-9_]+(\.[a-z0-9_]+)?)$/;

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('update_field'),
    field: z.string().min(1, 'scegli il campo'),
    /** testo con segnaposto $campo$, oppure valore fisso */
    value: z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]),
  }),
  z.object({
    type: z.literal('create_activity'),
    subject: z.string().trim().min(1, 'obbligatorio').max(200),
    activityType: z.string().min(1).default('Compito'),
    /** giorni dalla data di esecuzione (0 = oggi) */
    dueDays: z.number().int().min(0).max(365).default(0),
    assignTo: z.string().regex(/^(owner|user:[0-9a-f-]{36})$/).default('owner'),
    description: z.string().max(4000).default(''),
  }),
  z.object({
    type: z.literal('send_email'),
    to: z.string().regex(RECIPIENT, 'destinatario non valido'),
    subject: z.string().trim().min(1, 'obbligatorio').max(300),
    body: z.string().max(20000).default(''),
  }),
]);
export type Action = z.infer<typeof ActionSchema>;

export const WorkflowBodySchema = z.object({
  name: z.string().trim().min(1, 'obbligatorio').max(120),
  description: z.string().max(1000).default(''),
  module: z.string().min(1),
  active: z.boolean().default(true),
  trigger: TriggerSchema,
  conditions: z.array(ConditionSchema).max(20).default([]),
  actions: z.array(ActionSchema).min(1, 'aggiungi almeno un\'azione').max(10),
});
export type WorkflowBody = z.infer<typeof WorkflowBodySchema>;

/** Un'email è per il cliente se l'indirizzo viene da un campo del record (non da un utente del CRM). */
export const isCustomerRecipient = (to: string) => to.startsWith('field:');
