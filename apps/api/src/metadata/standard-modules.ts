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
];
