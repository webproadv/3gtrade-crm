export type FieldType =
  | 'text' | 'textarea' | 'email' | 'phone' | 'url' | 'integer' | 'number' | 'currency'
  | 'percent' | 'date' | 'datetime' | 'boolean' | 'picklist' | 'multipicklist' | 'relation' | 'user';

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Testo', textarea: 'Testo lungo', email: 'Email', phone: 'Telefono', url: 'Sito web',
  integer: 'Numero intero', number: 'Numero', currency: 'Importo (€)', percent: 'Percentuale',
  date: 'Data', datetime: 'Data e ora', boolean: 'Sì/No', picklist: 'Elenco a scelta singola',
  multipicklist: 'Elenco a scelta multipla', relation: 'Collegamento a record', user: 'Utente',
};

export interface Field {
  id: string;
  module: string;
  name: string;
  label: string;
  type: FieldType;
  block: string;
  required: boolean;
  isCustom: boolean;
  inList: boolean;
  sortOrder: number;
  options: { values?: string[]; module?: string; maxLength?: number };
  editable?: boolean;
}

export interface Perm { view: boolean; create: boolean; edit: boolean; delete: boolean }

export interface Module {
  name: string;
  label: string;
  labelSingular: string;
  icon: string | null;
  isCustom: boolean;
  labelFields: string[];
  sharing: 'private' | 'public_read' | 'public_readwrite';
  permissions?: Perm;
  fields: Field[];
}

export interface Refs {
  records: Record<string, { label: string; module: string }>;
  users: Record<string, string>;
}

export interface CrmRecord {
  id: string;
  module: string;
  label: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  data: Record<string, unknown>;
  refs?: Refs;
  permissions?: { edit: boolean; delete: boolean };
}

export interface ListResult {
  items: CrmRecord[];
  total: number;
  page: number;
  pageSize: number;
  refs: Refs;
}

export interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  role: string;
  tenantName: string;
}
