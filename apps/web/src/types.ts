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
  /** documento con righe (PDA) */
  hasLines?: boolean;
  /** nomi dei campi dei totali calcolati dalle righe */
  lineTotals?: { net: string; vat: string; adjustment: string; total: string };
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

export type FilterOp = 'eq' | 'neq' | 'contains' | 'empty' | 'notEmpty' | 'gt' | 'gte' | 'lt' | 'lte' | 'period';
export type Aggregate = 'sum' | 'avg' | 'min' | 'max';

export interface ReportConfig {
  columns: string[];
  filters: { field: string; op: FilterOp; value?: string | number | boolean }[];
  groupBy?: { field: string; dateGroup?: 'day' | 'month' | 'year' } | null;
  groupOrder: 'key' | 'count';
  totals: { field: string; fn: Aggregate }[];
  sort?: { field: string; dir: 'asc' | 'desc' } | null;
  chart: 'none' | 'bar' | 'pie';
}

export interface Report {
  id: string;
  name: string;
  description: string;
  module: string;
  shared: boolean;
  ownerId: string;
  config: ReportConfig;
  updatedAt: string;
  canEdit: boolean;
}

export interface ReportSummary {
  id: string;
  name: string;
  description: string;
  module: string;
  moduleLabel: string;
  shared: boolean;
  ownerName: string;
  updatedAt: string;
  canEdit: boolean;
}

export interface ReportColumn {
  key: string;
  label: string;
  type: FieldType;
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: { id: string; values: Record<string, unknown> }[];
  rowCount: number;
  truncated: boolean;
  totalDefs: { key: string; label: string; type: FieldType }[];
  totals: Record<string, number | null>;
  groupBy: { key: string; label: string; type: FieldType; dateGroup?: string } | null;
  groups: { key: string | null; label: string; count: number; totals: Record<string, number | null> }[] | null;
  hidden: string[];
  refs: Refs;
}

export interface DocLine {
  id?: string;
  productId: string | null;
  productLabel?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vatRate: number;
  net?: number;
  vat?: number;
  total?: number;
}
