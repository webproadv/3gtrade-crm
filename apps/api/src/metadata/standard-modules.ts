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

const PRODUCT_CATEGORIES = ['Fotovoltaico', 'Accumulo', 'Pompa di calore', 'Climatizzazione', 'Infissi', 'Luce', 'Gas', 'Altro'];
const INDUSTRIES = ['Commercio', 'Manifattura', 'Servizi', 'Edilizia', 'Energia', 'Tecnologia', 'Trasporti', 'Pubblica amministrazione', 'Altro'];

/**
 * Stati della PDA, come le code di lavoro del backoffice in vtenext. I primi sette sono quelli
 * della prima versione e restano per le PDA già salvate.
 */
export const PDA_STATUSES = [
  'Bozza',
  'Firmata',
  'In verifica',
  'Approvata',
  'In installazione',
  'Completata',
  'Annullata',
  'In attesa documenti',
  'Documentazione incompleta',
  'In approvazione finanziaria',
  'Approvata - in attesa firma cliente',
  'Non approvata',
  'Sospesa',
  'Sostituita',
  'Incassato 1° acconto',
  'Incassato 2° acconto',
];

/** Stato del lead dopo la conversione in cliente: impostato dal sistema. */
export const LEAD_CONVERTED = 'Convertito';

const LEAD = {
  info: 'Informazioni lead',
  contact: 'Primo contatto',
  qualification: 'Qualificazione',
  appointment: 'Appuntamento',
  company: 'Dati azienda',
  conversion: 'Conversione',
};

/**
 * Lead: il contatto commerciale prima che diventi cliente, come in vtenext.
 * Raccoglie primo contatto, qualificazione ed esito dell'appuntamento; con la conversione
 * genera Azienda (o cliente privato), Contatto ed eventualmente Opportunità.
 */
const LEADS: StandardModule = {
  name: 'Leads',
  label: 'Lead',
  labelSingular: 'Lead',
  icon: 'user-plus',
  labelFields: ['first_name', 'last_name'],
  sharing: 'private',
  inheritPermissionsFrom: 'Contacts',
  fields: [
    { name: 'lead_number', label: 'Numero lead', type: 'text', block: LEAD.info, inList: true, options: { computed: true } },
    { name: 'first_name', label: 'Nome', type: 'text', block: LEAD.info, inList: true },
    { name: 'last_name', label: 'Cognome', type: 'text', block: LEAD.info, required: true, inList: true },
    { name: 'company', label: 'Società', type: 'text', block: LEAD.info, inList: true },
    {
      name: 'customer_type',
      label: 'Tipologia cliente',
      type: 'picklist',
      block: LEAD.info,
      options: { values: ['B2C', 'B2B'], default: 'B2C' },
    },
    { name: 'email', label: 'Email', type: 'email', block: LEAD.info, inList: true },
    { name: 'phone', label: 'Telefono', type: 'phone', block: LEAD.info, inList: true },
    { name: 'mobile', label: 'Cellulare', type: 'phone', block: LEAD.info },
    {
      name: 'lead_status',
      label: 'Stato lead',
      type: 'picklist',
      block: LEAD.info,
      required: true,
      inList: true,
      options: {
        values: ['Nuovo', 'Da contattare', 'Contattato', 'Appuntamento fissato', 'Qualificato', 'Non qualificato', LEAD_CONVERTED],
        default: 'Nuovo',
      },
    },
    {
      name: 'lead_source',
      label: 'Provenienza',
      type: 'picklist',
      block: LEAD.info,
      options: { values: ['Call center', 'Sito web', 'Social', 'Referenza', 'Fiera', 'Campagna', 'Agente', 'Partner', 'Altro'] },
    },
    {
      name: 'product_interest',
      label: 'Prodotto di interesse',
      type: 'multipicklist',
      block: LEAD.info,
      options: { values: PRODUCT_CATEGORIES },
    },
    { name: 'lead_score', label: 'Leadscore', type: 'integer', block: LEAD.info },
    { name: 'newsletter', label: 'Riceve newsletter', type: 'boolean', block: LEAD.info },
    { name: 'marketing_consent_revoked', label: 'Revoca consenso marketing', type: 'boolean', block: LEAD.info },

    { name: 'first_contact_date', label: 'Data primo contatto', type: 'date', block: LEAD.contact },
    {
      name: 'first_contact_outcome',
      label: 'Esito primo contatto',
      type: 'picklist',
      block: LEAD.contact,
      options: { values: ['Da ricontattare', 'Appuntamento fissato', 'Non interessato', 'Non raggiungibile', 'Numero errato'] },
    },
    {
      name: 'contact_mode',
      label: 'Modalità di contatto',
      type: 'picklist',
      block: LEAD.contact,
      options: { values: ['Telefono', 'Email', 'WhatsApp', 'Di persona'] },
    },
    { name: 'decision_maker_differs', label: 'Decisore diverso dal referente', type: 'boolean', block: LEAD.contact },
    { name: 'contact_notes', label: 'Note sul contatto', type: 'textarea', block: LEAD.contact },

    { name: 'provides_bills', label: 'Il cliente fornisce le bollette', type: 'boolean', block: LEAD.qualification },
    { name: 'existing_system', label: 'Impianto già presente', type: 'boolean', block: LEAD.qualification },
    {
      name: 'installation_type',
      label: 'Tipologia installazione',
      type: 'picklist',
      block: LEAD.qualification,
      options: { values: ['Tetto inclinato', 'Tetto piano', 'A terra', 'Pensilina', 'Altro'] },
    },
    { name: 'budget', label: 'Budget indicativo', type: 'currency', block: LEAD.qualification },
    {
      name: 'decision_time',
      label: 'Tempi di decisione',
      type: 'picklist',
      block: LEAD.qualification,
      options: { values: ['Subito', 'Entro 3 mesi', 'Entro 6 mesi', 'Oltre 6 mesi'] },
    },
    {
      name: 'probability',
      label: 'Probabilità percepita',
      type: 'picklist',
      block: LEAD.qualification,
      options: { values: ['Alta', 'Media', 'Bassa'] },
    },
    { name: 'annual_kwh', label: 'Consumo annuo luce (kWh)', type: 'number', block: LEAD.qualification },
    { name: 'annual_smc', label: 'Consumo annuo gas (Smc)', type: 'number', block: LEAD.qualification },

    { name: 'appointment_date', label: 'Data appuntamento', type: 'datetime', block: LEAD.appointment },
    {
      name: 'appointment_outcome',
      label: 'Esito appuntamento',
      type: 'picklist',
      block: LEAD.appointment,
      inList: true,
      options: { values: ['Da fissare', 'Fissato', 'Positivo', 'Negativo', 'Da richiamare', 'Non lavorabile'] },
    },
    { name: 'outcome_reason', label: 'Motivazione', type: 'text', block: LEAD.appointment },
    { name: 'appointment_notes', label: 'Note esito appuntamento', type: 'textarea', block: LEAD.appointment },

    { name: 'vat_number', label: 'Partita IVA', type: 'text', block: LEAD.company },
    { name: 'tax_code', label: 'Codice fiscale', type: 'text', block: LEAD.company },
    { name: 'industry', label: 'Settore', type: 'picklist', block: LEAD.company, options: { values: INDUSTRIES } },
    { name: 'website', label: 'Sito web', type: 'url', block: LEAD.company },
    { name: 'employees', label: 'Dipendenti', type: 'integer', block: LEAD.company },
    { name: 'annual_revenue', label: 'Fatturato annuo', type: 'currency', block: LEAD.company },

    ...address('lead', 'Indirizzo'),
    { name: 'description', label: 'Descrizione', type: 'textarea', block: 'Descrizione' },

    { name: 'converted_at', label: 'Convertito il', type: 'datetime', block: LEAD.conversion, options: { computed: true } },
    {
      name: 'converted_account_id',
      label: 'Azienda / cliente',
      type: 'relation',
      block: LEAD.conversion,
      options: { module: 'Accounts', computed: true },
    },
    {
      name: 'converted_contact_id',
      label: 'Contatto',
      type: 'relation',
      block: LEAD.conversion,
      options: { module: 'Contacts', computed: true },
    },
    {
      name: 'converted_opportunity_id',
      label: 'Opportunità',
      type: 'relation',
      block: LEAD.conversion,
      options: { module: 'Opportunities', computed: true },
    },
  ],
};

/** Moduli standard creati per ogni nuovo tenant. */
export const STANDARD_MODULES: StandardModule[] = [
  LEADS,
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
        options: { values: INDUSTRIES },
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
      { name: 'lead_id', label: 'Lead', type: 'relation', block: 'Collegamenti', options: { module: 'Leads' } },
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
          values: PDA_STATUSES,
          default: 'Bozza',
        },
      },
      {
        name: 'product_category',
        label: 'Categoria prodotto',
        type: 'picklist',
        block: 'Informazioni PDA',
        inList: true,
        options: { values: PRODUCT_CATEGORIES },
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
      { name: 'job_number', label: 'ID commessa', type: 'text', block: 'Informazioni PDA' },
      {
        name: 'pda_type',
        label: 'Tipo',
        type: 'picklist',
        block: 'Informazioni PDA',
        options: { values: ['Standard', 'Prenotazione', 'Integrativa'], default: 'Standard' },
      },
      { name: 'division', label: 'Divisione', type: 'text', block: 'Informazioni PDA' },
      { name: 'partner', label: 'Partner', type: 'text', block: 'Informazioni PDA' },
      { name: 'referrer', label: 'Segnalatore', type: 'text', block: 'Informazioni PDA' },
      { name: 'product_size', label: 'Taglia prodotto', type: 'text', block: 'Informazioni PDA' },
      { name: 'promo_gift', label: 'Omaggio promo', type: 'text', block: 'Informazioni PDA' },
      {
        name: 'replaces_pda_id',
        label: 'Sostituisce la PDA',
        type: 'relation',
        block: 'Informazioni PDA',
        options: { module: 'SalesOrders' },
      },
      { name: 'reworkable', label: 'Pratica rielaborabile', type: 'boolean', block: 'Informazioni PDA' },
      { name: 'backoffice_activity', label: 'Attività backoffice', type: 'boolean', block: 'Informazioni PDA' },
      { name: 'docs_to_integrate', label: 'Documenti da integrare', type: 'textarea', block: 'Documentazione' },
      { name: 'docs_notes', label: 'Note documenti', type: 'textarea', block: 'Documentazione' },
      { name: 'docs_uploaded', label: 'Documentazione caricata', type: 'boolean', block: 'Documentazione' },
      { name: 'files_link', label: 'Cartella documenti', type: 'url', block: 'Documentazione' },
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
      { name: 'payment_date', label: 'Data pagamento', type: 'date', block: 'Informazioni finanziarie' },
      { name: 'transfer_amount', label: 'Importo bonifico', type: 'currency', block: 'Informazioni finanziarie' },
      { name: 'transfer_done', label: 'Bonifico effettuato', type: 'boolean', block: 'Informazioni finanziarie' },
      { name: 'down_payment_pct', label: 'Perc. anticipo', type: 'percent', block: 'Informazioni finanziarie' },
      { name: 'start_works_pct', label: 'Perc. inizio lavori', type: 'percent', block: 'Informazioni finanziarie' },
      { name: 'balance_pct', label: 'Perc. saldo fine lavori', type: 'percent', block: 'Informazioni finanziarie' },
      { name: 'financing_with_guarantor', label: 'Finanziamento con garante', type: 'boolean', block: 'Informazioni finanziarie' },
      { name: 'financing_upload_date', label: 'Data caricamento finanziaria', type: 'date', block: 'Informazioni finanziarie' },
      {
        name: 'financing_approval',
        label: 'Approvazione finanziaria',
        type: 'picklist',
        block: 'Informazioni finanziarie',
        options: { values: ['In attesa', 'Approvata', 'Non approvata'] },
      },
      { name: 'financing_digital_signature', label: 'Firma digitale finanziaria', type: 'boolean', block: 'Informazioni finanziarie' },
      { name: 'financing_contract_sent', label: 'Contratto finanziamento inviato', type: 'boolean', block: 'Informazioni finanziarie' },
      {
        name: 'liquidation_status',
        label: 'Stato liquidazione finanziaria',
        type: 'picklist',
        block: 'Informazioni finanziarie',
        options: { values: ['Da richiedere', 'Richiesta', 'Liquidata'] },
      },
      { name: 'liquidation_request_date', label: 'Data richiesta liquidazione', type: 'date', block: 'Informazioni finanziarie' },
      { name: 'iban', label: 'IBAN', type: 'text', block: 'Informazioni finanziarie' },
      { name: 'payment_exceptions', label: 'Eccezioni pagamento', type: 'boolean', block: 'Informazioni finanziarie' },
      { name: 'financing_notes', label: 'Note finanziarie', type: 'textarea', block: 'Informazioni finanziarie' },
      { name: 'survey_date', label: 'Data sopralluogo', type: 'date', block: 'Sopralluogo e installazione' },
      { name: 'installation_date', label: 'Data installazione', type: 'date', block: 'Sopralluogo e installazione' },
      { name: 'installer', label: 'Installatore', type: 'text', block: 'Sopralluogo e installazione' },
      { name: 'survey_done', label: 'Sopralluogo effettuato', type: 'boolean', block: 'Sopralluogo e installazione' },
      { name: 'installation_end_date', label: 'Fine installazione', type: 'date', block: 'Sopralluogo e installazione' },
      { name: 'installation_done', label: 'Installazione effettuata', type: 'boolean', block: 'Sopralluogo e installazione' },
      { name: 'dico', label: 'DICO', type: 'boolean', block: 'Sopralluogo e installazione' },
      { name: 'dico_date', label: 'Data DICO', type: 'date', block: 'Sopralluogo e installazione' },
      { name: 'warranty_sent', label: 'Garanzie inviate', type: 'boolean', block: 'Sopralluogo e installazione' },
      { name: 'installation_notes', label: 'Note installazione', type: 'textarea', block: 'Sopralluogo e installazione' },
      { name: 'pod', label: 'POD', type: 'text', block: 'Luce e gas' },
      { name: 'pdr', label: 'PDR', type: 'text', block: 'Luce e gas' },
      { name: 'annual_kwh', label: 'Consumo annuo (kWh)', type: 'number', block: 'Luce e gas' },
      { name: 'annual_smc', label: 'Consumo annuo (Smc)', type: 'number', block: 'Luce e gas' },
      { name: 'supplier', label: 'Fornitore', type: 'text', block: 'Luce e gas' },
      { name: 'expected_activation_date', label: 'Data attivazione prevista', type: 'date', block: 'Luce e gas' },
      { name: 'service_end_date', label: 'Data fine servizio', type: 'date', block: 'Luce e gas' },
      { name: 'welcome_letter_sent', label: 'Welcome letter inviata', type: 'boolean', block: 'Comunicazioni al cliente' },
      { name: 'activation_letter_sent', label: 'Activation letter inviata', type: 'boolean', block: 'Comunicazioni al cliente' },
      { name: 'activation_confirmed_sent', label: 'Conferma attivazione inviata', type: 'boolean', block: 'Comunicazioni al cliente' },
      {
        name: 'admin_status',
        label: 'Stato amministrativo',
        type: 'picklist',
        block: 'Amministrazione',
        options: { values: ['Da fatturare', 'Fatturato acconto', 'Fatturato 100%', 'Incassato', 'Insoluto'] },
      },
      { name: 'admin_status_date', label: 'Data stato amministrativo', type: 'date', block: 'Amministrazione' },
      { name: 'credit_recovery_by', label: 'Recupero credito affidato a', type: 'text', block: 'Amministrazione' },
      { name: 'credit_recovery_notes', label: 'Note recupero credito', type: 'textarea', block: 'Amministrazione' },
      { name: 'subtotal', label: 'Imponibile', type: 'currency', block: 'Totali', options: { computed: true } },
      { name: 'vat_total', label: 'IVA', type: 'currency', block: 'Totali', options: { computed: true } },
      { name: 'adjustment', label: 'Arrotondamento', type: 'currency', block: 'Totali' },
      { name: 'grand_total', label: 'Totale documento', type: 'currency', block: 'Totali', inList: true, options: { computed: true } },
      { name: 'notes', label: 'Note PDA', type: 'textarea', block: 'Note' },
    ],
  },
];
