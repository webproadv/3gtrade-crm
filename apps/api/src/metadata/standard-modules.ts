import { FieldOptions, FieldType } from './field-types';

export interface StandardField {
  name: string;
  label: string;
  type: FieldType;
  block: string;
  required?: boolean;
  inList?: boolean;
  options?: FieldOptions;
}

export interface StandardModule {
  name: string;
  label: string;
  labelSingular: string;
  icon: string;
  labelFields: string[];
  sharing: 'private' | 'public_read' | 'public_readwrite';
  /**
   * Quando il modulo viene aggiunto a un tenant già esistente, ogni profilo
   * riceve gli stessi permessi che ha su questo modulo.
   */
  inheritPermissionsFrom?: string;
  /**
   * Azioni negate ai profili non amministratori (es. catalogo prodotti in sola lettura per le vendite).
   * Gli utenti amministratori non sono limitati dai profili.
   */
  restrictedActions?: ('create' | 'edit' | 'delete')[];
  fields: StandardField[];
}

const address = (prefix: string, block: string): StandardField[] => [
  { name: `${prefix}_street`, label: 'Indirizzo', type: 'text', block },
  { name: `${prefix}_city`, label: 'Città', type: 'text', block, inList: prefix === 'billing' },
  { name: `${prefix}_zip`, label: 'CAP', type: 'text', block },
  { name: `${prefix}_province`, label: 'Provincia', type: 'text', block },
  { name: `${prefix}_country`, label: 'Nazione', type: 'text', block },
];

/** Moduli standard creati per ogni nuovo tenant. */
export const STANDARD_MODULES: StandardModule[] = [
  {
    name: 'Accounts',
    label: 'Aziende',
    labelSingular: 'Azienda',
    icon: 'building',
    labelFields: ['name'],
    sharing: 'private',
    fields: [
      { name: 'name', label: 'Ragione sociale', type: 'text', block: 'Informazioni azienda', required: true, inList: true },
      {
        name: 'account_type',
        label: 'Tipo',
        type: 'picklist',
        block: 'Informazioni azienda',
        inList: true,
        options: { values: ['Cliente', 'Prospect', 'Partner', 'Fornitore', 'Concorrente'] },
      },
      {
        name: 'industry',
        label: 'Settore',
        type: 'picklist',
        block: 'Informazioni azienda',
        options: {
          values: ['Commercio', 'Manifattura', 'Servizi', 'Edilizia', 'Energia', 'Tecnologia', 'Trasporti', 'Pubblica amministrazione', 'Altro'],
        },
      },
      { name: 'vat_number', label: 'Partita IVA', type: 'text', block: 'Informazioni azienda' },
      { name: 'tax_code', label: 'Codice fiscale', type: 'text', block: 'Informazioni azienda' },
      { name: 'phone', label: 'Telefono', type: 'phone', block: 'Informazioni azienda', inList: true },
      { name: 'email', label: 'Email', type: 'email', block: 'Informazioni azienda' },
      { name: 'pec', label: 'PEC', type: 'email', block: 'Informazioni azienda' },
      { name: 'website', label: 'Sito web', type: 'url', block: 'Informazioni azienda' },
      { name: 'employees', label: 'Dipendenti', type: 'integer', block: 'Informazioni azienda' },
      { name: 'annual_revenue', label: 'Fatturato annuo', type: 'currency', block: 'Informazioni azienda' },
      ...address('billing', 'Indirizzo'),
      { name: 'description', label: 'Descrizione', type: 'textarea', block: 'Descrizione' },
    ],
  },
  {
    name: 'Contacts',
    label: 'Contatti',
    labelSingular: 'Contatto',
    icon: 'user',
    labelFields: ['first_name', 'last_name'],
    sharing: 'private',
    fields: [
      {
        name: 'salutation',
        label: 'Titolo',
        type: 'picklist',
        block: 'Informazioni contatto',
        options: { values: ['Sig.', 'Sig.ra', 'Dott.', 'Dott.ssa', 'Ing.', 'Avv.'] },
      },
      { name: 'first_name', label: 'Nome', type: 'text', block: 'Informazioni contatto', inList: true },
      { name: 'last_name', label: 'Cognome', type: 'text', block: 'Informazioni contatto', required: true, inList: true },
      {
        name: 'account_id',
        label: 'Azienda',
        type: 'relation',
        block: 'Informazioni contatto',
        inList: true,
        options: { module: 'Accounts' },
      },
      { name: 'job_title', label: 'Ruolo aziendale', type: 'text', block: 'Informazioni contatto' },
      { name: 'email', label: 'Email', type: 'email', block: 'Informazioni contatto', inList: true },
      { name: 'phone', label: 'Telefono', type: 'phone', block: 'Informazioni contatto', inList: true },
      { name: 'mobile', label: 'Cellulare', type: 'phone', block: 'Informazioni contatto' },
      { name: 'birthday', label: 'Data di nascita', type: 'date', block: 'Informazioni contatto' },
      { name: 'email_opt_out', label: 'Non inviare email', type: 'boolean', block: 'Informazioni contatto' },
      ...address('mailing', 'Indirizzo'),
      { name: 'description', label: 'Descrizione', type: 'textarea', block: 'Descrizione' },
    ],
  },
  {
    name: 'Opportunities',
    label: 'Opportunità',
    labelSingular: 'Opportunità',
    icon: 'target',
    labelFields: ['name'],
    sharing: 'private',
    fields: [
      { name: 'name', label: 'Nome opportunità', type: 'text', block: 'Informazioni opportunità', required: true, inList: true },
      {
        name: 'account_id',
        label: 'Azienda',
        type: 'relation',
        block: 'Informazioni opportunità',
        required: true,
        inList: true,
        options: { module: 'Accounts' },
      },
      {
        name: 'contact_id',
        label: 'Contatto',
        type: 'relation',
        block: 'Informazioni opportunità',
        options: { module: 'Contacts' },
      },
      { name: 'amount', label: 'Importo', type: 'currency', block: 'Informazioni opportunità', inList: true },
      { name: 'close_date', label: 'Data chiusura prevista', type: 'date', block: 'Informazioni opportunità', required: true, inList: true },
      {
        name: 'sales_stage',
        label: 'Fase di vendita',
        type: 'picklist',
        block: 'Informazioni opportunità',
        required: true,
        inList: true,
        options: {
          values: ['Prospezione', 'Qualificazione', 'Analisi esigenze', 'Proposta', 'Negoziazione', 'Chiusa vinta', 'Chiusa persa'],
        },
      },
      { name: 'probability', label: 'Probabilità (%)', type: 'percent', block: 'Informazioni opportunità' },
      {
        name: 'lead_source',
        label: 'Origine',
        type: 'picklist',
        block: 'Informazioni opportunità',
        options: { values: ['Sito web', 'Passaparola', 'Fiera', 'Campagna email', 'Telefonata', 'Partner', 'Altro'] },
      },
      { name: 'next_step', label: 'Prossimo passo', type: 'text', block: 'Informazioni opportunità' },
      { name: 'description', label: 'Descrizione', type: 'textarea', block: 'Descrizione' },
    ],
  },
  {
    name: 'Activities',
    label: 'Attività',
    labelSingular: 'Attività',
    icon: 'calendar',
    labelFields: ['subject'],
    sharing: 'private',
    inheritPermissionsFrom: 'Contacts',
    fields: [
      { name: 'subject', label: 'Oggetto', type: 'text', block: 'Attività', required: true, inList: true },
      {
        name: 'activity_type',
        label: 'Tipo',
        type: 'picklist',
        block: 'Attività',
        required: true,
        inList: true,
        options: { values: ['Chiamata', 'Appuntamento', 'Compito', 'Email'], default: 'Compito' },
      },
      {
        name: 'status',
        label: 'Stato',
        type: 'picklist',
        block: 'Attività',
        required: true,
        inList: true,
        options: { values: ['Pianificata', 'Completata', 'Annullata'], default: 'Pianificata' },
      },
      {
        name: 'priority',
        label: 'Priorità',
        type: 'picklist',
        block: 'Attività',
        options: { values: ['Alta', 'Media', 'Bassa'], default: 'Media' },
      },
      { name: 'start', label: 'Inizio / scadenza', type: 'datetime', block: 'Attività', required: true, inList: true },
      { name: 'end', label: 'Fine', type: 'datetime', block: 'Attività' },
      { name: 'all_day', label: 'Tutto il giorno', type: 'boolean', block: 'Attività' },
      { name: 'location', label: 'Luogo', type: 'text', block: 'Attività' },
      { name: 'account_id', label: 'Azienda', type: 'relation', block: 'Collegamenti', inList: true, options: { module: 'Accounts' } },
      { name: 'contact_id', label: 'Contatto', type: 'relation', block: 'Collegamenti', options: { module: 'Contacts' } },
      {
        name: 'opportunity_id',
        label: 'Opportunità',
        type: 'relation',
        block: 'Collegamenti',
        options: { module: 'Opportunities' },
      },
      { name: 'description', label: 'Descrizione', type: 'textarea', block: 'Descrizione' },
    ],
  },
  {
    name: 'Products',
    label: 'Prodotti e servizi',
    labelSingular: 'Prodotto o servizio',
    icon: 'package',
    labelFields: ['name'],
    sharing: 'public_read',
    inheritPermissionsFrom: 'Accounts',
    restrictedActions: ['create', 'edit', 'delete'],
    fields: [
      { name: 'name', label: 'Nome', type: 'text', block: 'Informazioni prodotto', required: true, inList: true },
      { name: 'product_code', label: 'Codice', type: 'text', block: 'Informazioni prodotto', inList: true },
      {
        name: 'product_type',
        label: 'Tipo',
        type: 'picklist',
        block: 'Informazioni prodotto',
        inList: true,
        options: { values: ['Prodotto', 'Servizio'], default: 'Prodotto' },
      },
      { name: 'category', label: 'Categoria', type: 'text', block: 'Informazioni prodotto' },
      {
        name: 'unit',
        label: 'Unità di misura',
        type: 'picklist',
        block: 'Prezzo',
        options: { values: ['pz', 'ore', 'giorni', 'kg', 'm', 'mq', 'l', 'a corpo'], default: 'pz' },
      },
      { name: 'unit_price', label: 'Prezzo di listino', type: 'currency', block: 'Prezzo', required: true, inList: true },
      { name: 'vat_rate', label: 'Aliquota IVA', type: 'percent', block: 'Prezzo', inList: true, options: { default: 22 } },
      { name: 'active', label: 'Attivo', type: 'boolean', block: 'Prezzo', options: { default: true } },
      { name: 'description', label: 'Descrizione', type: 'textarea', block: 'Descrizione' },
    ],
  },
  {
    name: 'SalesOrders',
    label: 'PDA',
    labelSingular: 'PDA',
    icon: 'cart',
    labelFields: ['order_number', 'subject'],
    sharing: 'private',
    inheritPermissionsFrom: 'Opportunities',
    fields: [
      { name: 'subject', label: 'Oggetto PDA', type: 'text', block: 'Informazioni PDA', required: true, inList: true },
      {
        name: 'order_number',
        label: 'Numero PDA',
        type: 'text',
        block: 'Informazioni PDA',
        inList: true,
        options: { computed: true },
      },
      { name: 'order_date', label: 'Data PDA', type: 'date', block: 'Informazioni PDA', inList: true, options: { default: '$today' } },
      {
        name: 'account_id',
        label: 'Cliente',
        type: 'relation',
        block: 'Informazioni PDA',
        required: true,
        inList: true,
        options: { module: 'Accounts' },
      },
      { name: 'contact_id', label: 'Contatto', type: 'relation', block: 'Informazioni PDA', options: { module: 'Contacts' } },
      {
        name: 'opportunity_id',
        label: 'Opportunità',
        type: 'relation',
        block: 'Informazioni PDA',
        options: { module: 'Opportunities' },
      },
      {
        name: 'status',
        label: 'Stato',
        type: 'picklist',
        block: 'Informazioni PDA',
        required: true,
        inList: true,
        options: {
          values: ['Bozza', 'Firmata', 'In verifica', 'Approvata', 'In installazione', 'Completata', 'Annullata'],
          default: 'Bozza',
        },
      },
      {
        name: 'product_category',
        label: 'Categoria prodotto',
        type: 'picklist',
        block: 'Informazioni PDA',
        inList: true,
        options: {
          values: ['Fotovoltaico', 'Accumulo', 'Pompa di calore', 'Climatizzazione', 'Infissi', 'Luce', 'Gas', 'Altro'],
        },
      },
      {
        name: 'source',
        label: 'Provenienza',
        type: 'picklist',
        block: 'Informazioni PDA',
        options: { values: ['Call center', 'Agente', 'Sito web', 'Referenza', 'Fiera', 'Altro'] },
      },
      { name: 'cancel_date', label: 'Data annullamento', type: 'date', block: 'Informazioni PDA' },
      { name: 'agent_notes', label: 'Note agente', type: 'textarea', block: 'Informazioni PDA' },
      {
        name: 'payment_type',
        label: 'Tipo pagamento',
        type: 'picklist',
        block: 'Informazioni finanziarie',
        options: { values: ['Bonifico', 'Finanziamento', 'Locazione operativa', 'Contanti', 'Assegno', 'Altro'] },
      },
      { name: 'financing_company', label: 'Finanziaria', type: 'text', block: 'Informazioni finanziarie' },
      { name: 'financed_amount', label: 'Importo finanziato', type: 'currency', block: 'Informazioni finanziarie' },
      { name: 'down_payment', label: 'Anticipo', type: 'currency', block: 'Informazioni finanziarie' },
      { name: 'survey_date', label: 'Data sopralluogo', type: 'date', block: 'Sopralluogo e installazione' },
      { name: 'installation_date', label: 'Data installazione', type: 'date', block: 'Sopralluogo e installazione' },
      { name: 'installer', label: 'Installatore', type: 'text', block: 'Sopralluogo e installazione' },
      { name: 'subtotal', label: 'Imponibile', type: 'currency', block: 'Totali', options: { computed: true } },
      { name: 'vat_total', label: 'IVA', type: 'currency', block: 'Totali', options: { computed: true } },
      { name: 'adjustment', label: 'Arrotondamento', type: 'currency', block: 'Totali' },
      { name: 'grand_total', label: 'Totale documento', type: 'currency', block: 'Totali', inList: true, options: { computed: true } },
      { name: 'notes', label: 'Note PDA', type: 'textarea', block: 'Note' },
    ],
  },
];
