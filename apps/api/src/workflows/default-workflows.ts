import { WorkflowBody } from './workflow-config';

/**
 * Workflow di esempio creati con ogni azienda, presi dai processi più usati in vtenext.
 * Nessuno invia nulla ai clienti: le email per i clienti restano bozze che l'utente invia dalla scheda.
 */
export const DEFAULT_WORKFLOWS: WorkflowBody[] = [
  {
    name: 'Welcome Letter alla firma della PDA',
    description:
      "Quando la PDA passa a Firmata prepara la Welcome Letter per il cliente (da controllare e inviare dalla scheda) e una chiamata di benvenuto per l'assegnatario.",
    module: 'SalesOrders',
    active: true,
    trigger: { type: 'field_change', field: 'status' },
    conditions: [{ field: 'status', op: 'eq', value: 'Firmata' }],
    actions: [
      {
        type: 'send_email',
        to: 'field:contact_id.email',
        subject: 'Benvenuto! Conferma della proposta $order_number$',
        body:
          'Gentile cliente,\n\ngrazie per aver scelto i nostri servizi. Abbiamo ricevuto la proposta $order_number$ ($subject$) ' +
          'del $order_date$ per un totale di $grand_total$.\n\nNei prossimi giorni il suo referente $owner$ la contatterà ' +
          'per i passi successivi.\n\nCordiali saluti',
      },
      {
        type: 'create_activity',
        subject: 'Chiamata di benvenuto - $account_id$',
        activityType: 'Chiamata',
        dueDays: 2,
        assignTo: 'owner',
        description: 'PDA $order_number$ firmata: chiamare il cliente per il benvenuto e i prossimi passi.',
      },
    ],
  },
  {
    name: 'PDA in documentazione incompleta da 7 giorni',
    description: "Se la PDA resta in Documentazione incompleta per 7 giorni crea un promemoria per l'assegnatario e lo avvisa per email.",
    module: 'SalesOrders',
    active: true,
    trigger: { type: 'scheduled', from: 'changed:status', days: 7 },
    conditions: [{ field: 'status', op: 'eq', value: 'Documentazione incompleta' }],
    actions: [
      {
        type: 'create_activity',
        subject: 'Sollecitare documenti mancanti - $order_number$',
        activityType: 'Compito',
        dueDays: 0,
        assignTo: 'owner',
        description: 'La PDA $order_number$ di $account_id$ è in documentazione incompleta da 7 giorni.',
      },
      {
        type: 'send_email',
        to: 'owner',
        subject: 'PDA $order_number$ ferma in documentazione incompleta',
        body: 'La PDA $order_number$ ($account_id$) è in documentazione incompleta da 7 giorni: sollecita i documenti mancanti.',
      },
    ],
  },
  {
    name: 'Opportunità in chiusura tra 7 giorni',
    description: "Promemoria per l'assegnatario 7 giorni prima della data di chiusura prevista di un'opportunità aperta.",
    module: 'Opportunities',
    active: true,
    trigger: { type: 'scheduled', from: 'field:close_date', days: -7 },
    conditions: [
      { field: 'sales_stage', op: 'neq', value: 'Chiusa vinta' },
      { field: 'sales_stage', op: 'neq', value: 'Chiusa persa' },
    ],
    actions: [
      {
        type: 'create_activity',
        subject: 'Verificare la chiusura di $name$',
        activityType: 'Compito',
        dueDays: 0,
        assignTo: 'owner',
        description: 'Chiusura prevista il $close_date$ ($amount$).',
      },
    ],
  },
  {
    name: 'Prepara email di follow-up',
    description: "Pulsante sulla scheda dell'opportunità: prepara un'email di follow-up per il contatto, da rivedere e inviare.",
    module: 'Opportunities',
    active: true,
    trigger: { type: 'manual', buttonLabel: 'Prepara follow-up' },
    conditions: [],
    actions: [
      {
        type: 'send_email',
        to: 'field:contact_id.email',
        subject: 'La nostra proposta per $account_id$',
        body:
          'Buongiorno,\n\nla ringrazio per il tempo dedicato. Come concordato le riepilogo la nostra proposta "$name$".\n\n' +
          'Resto a disposizione per qualsiasi chiarimento.\n\nCordiali saluti\n$owner$',
      },
    ],
  },
];
