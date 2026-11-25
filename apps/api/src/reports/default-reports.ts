import { ReportConfig } from './report-config';

/** Rapporti condivisi creati con ogni nuova azienda, come esempi da cui partire. */
export const DEFAULT_REPORTS: { name: string; description: string; module: string; config: ReportConfig }[] = [
  {
    name: 'Opportunità per fase di vendita',
    description: 'Numero e valore delle opportunità in ogni fase',
    module: 'Opportunities',
    config: {
      columns: ['name', 'account_id', 'amount', 'close_date', 'ownerId'],
      filters: [],
      groupBy: { field: 'sales_stage' },
      groupOrder: 'key',
      totals: [{ field: 'amount', fn: 'sum' }],
      sort: { field: 'amount', dir: 'desc' },
      chart: 'bar',
    },
  },
  {
    name: 'Previsione chiusure per mese',
    description: 'Opportunità ancora aperte per mese di chiusura prevista',
    module: 'Opportunities',
    config: {
      columns: ['name', 'account_id', 'sales_stage', 'amount', 'close_date', 'ownerId'],
      filters: [
        { field: 'sales_stage', op: 'neq', value: 'Chiusa vinta' },
        { field: 'sales_stage', op: 'neq', value: 'Chiusa persa' },
      ],
      groupBy: { field: 'close_date', dateGroup: 'month' },
      groupOrder: 'key',
      totals: [{ field: 'amount', fn: 'sum' }],
      sort: { field: 'close_date', dir: 'asc' },
      chart: 'bar',
    },
  },
  {
    name: 'Vinte per commerciale',
    description: "Opportunità chiuse vinte quest'anno, per responsabile",
    module: 'Opportunities',
    config: {
      columns: ['name', 'account_id', 'amount', 'close_date'],
      filters: [
        { field: 'sales_stage', op: 'eq', value: 'Chiusa vinta' },
        { field: 'close_date', op: 'period', value: 'thisYear' },
      ],
      groupBy: { field: 'ownerId' },
      groupOrder: 'count',
      totals: [{ field: 'amount', fn: 'sum' }],
      sort: { field: 'amount', dir: 'desc' },
      chart: 'pie',
    },
  },
  {
    name: 'Attività del mese per tipo',
    description: 'Chiamate, appuntamenti, compiti ed email di questo mese',
    module: 'Activities',
    config: {
      columns: ['subject', 'activity_type', 'status', 'start', 'ownerId'],
      filters: [{ field: 'start', op: 'period', value: 'thisMonth' }],
      groupBy: { field: 'activity_type' },
      groupOrder: 'count',
      totals: [],
      sort: { field: 'start', dir: 'asc' },
      chart: 'pie',
    },
  },
  {
    name: 'Aziende per settore',
    description: 'Clienti e prospect suddivisi per settore',
    module: 'Accounts',
    config: {
      columns: ['name', 'account_type', 'industry', 'phone', 'ownerId'],
      filters: [],
      groupBy: { field: 'industry' },
      groupOrder: 'count',
      totals: [],
      sort: { field: 'name', dir: 'asc' },
      chart: 'bar',
    },
  },
];
