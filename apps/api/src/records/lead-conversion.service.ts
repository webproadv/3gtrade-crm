import { BadRequestException, Injectable } from '@nestjs/common';
import { Tx } from '../db/database.service';
import { LEAD_CONVERTED } from '../metadata/standard-modules';
import { SecurityContext } from '../security/security-context';
import { RecordsService, Row } from './records.service';

export interface ConvertLeadInput {
  /** collega il lead a un'azienda esistente invece di crearne una nuova */
  accountId?: string;
  /** crea anche un'opportunità (predefinito: sì) */
  createOpportunity?: boolean;
  opportunity?: { name?: string; closeDate?: string; amount?: number; salesStage?: string };
  /** assegnatario dei record creati (predefinito: chi converte) */
  ownerId?: string;
}

/** Corrispondenza tra la provenienza del lead e l'origine dell'opportunità. */
const OPPORTUNITY_SOURCE: Record<string, string> = {
  'Sito web': 'Sito web',
  Referenza: 'Passaparola',
  Fiera: 'Fiera',
  Campagna: 'Campagna email',
  'Call center': 'Telefonata',
  Partner: 'Partner',
};

const ADDRESS_PARTS = ['street', 'city', 'zip', 'province', 'country'];

const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Conversione del lead come in vtenext: crea (o collega) l'azienda, crea il contatto e,
 * se richiesto, l'opportunità; il lead resta come storico con lo stato "Convertito"
 * e i collegamenti ai record creati. Le attività del lead passano ad azienda e contatto.
 */
@Injectable()
export class LeadConversionService {
  constructor(private readonly records: RecordsService) {}

  async convert(tx: Tx, sec: SecurityContext, leadId: string, input: ConvertLeadInput) {
    // permesso di modifica sul lead e accesso al record
    const { row } = await this.records.loadWritable(tx, sec, 'Leads', leadId);
    if (row.data.converted_at) {
      throw new BadRequestException('Il lead è già stato convertito');
    }
    // solo i campi del lead che l'utente può vedere vengono copiati
    const lead = (await this.records.get(tx, sec, 'Leads', leadId)).data;
    const s = (k: string) => (typeof lead[k] === 'string' ? (lead[k] as string) : undefined);
    const person = [s('last_name'), s('first_name')].filter(Boolean).join(' ');

    let accountId = input.accountId;
    if (accountId) {
      // verifica che l'azienda esista e sia visibile all'utente
      await this.records.get(tx, sec, 'Accounts', accountId);
    } else {
      const address = Object.fromEntries(ADDRESS_PARTS.map((p) => [`billing_${p}`, lead[`lead_${p}`]]));
      const account = await this.records.createFrom(
        tx,
        sec,
        'Accounts',
        {
          // cliente privato (B2C): l'anagrafica prende il nome della persona
          name: s('company') || person,
          account_type: 'Prospect',
          industry: lead.industry,
          vat_number: lead.vat_number,
          tax_code: lead.tax_code,
          phone: lead.phone ?? lead.mobile,
          email: lead.email,
          website: lead.website,
          employees: lead.employees,
          annual_revenue: lead.annual_revenue,
          description: lead.description,
          ...address,
        },
        input.ownerId,
      );
      accountId = account.id;
    }

    const mailing = Object.fromEntries(ADDRESS_PARTS.map((p) => [`mailing_${p}`, lead[`lead_${p}`]]));
    const contact = await this.records.createFrom(
      tx,
      sec,
      'Contacts',
      {
        first_name: lead.first_name,
        last_name: lead.last_name,
        account_id: accountId,
        email: lead.email,
        phone: lead.phone,
        mobile: lead.mobile,
        email_opt_out: lead.marketing_consent_revoked === true ? true : undefined,
        ...mailing,
      },
      input.ownerId,
    );

    let opportunityId: string | undefined;
    if (input.createOpportunity !== false) {
      const o = input.opportunity ?? {};
      const products = Array.isArray(lead.product_interest) ? (lead.product_interest as string[]).join(' + ') : '';
      const opp = await this.records.createFrom(
        tx,
        sec,
        'Opportunities',
        {
          // come in vtenext: "Cliente - Prodotto"
          name: o.name?.trim() || [s('company') || person, products].filter(Boolean).join(' - '),
          account_id: accountId,
          contact_id: contact.id,
          amount: o.amount ?? lead.budget,
          close_date: o.closeDate ?? addDays(30),
          sales_stage: o.salesStage ?? 'Qualificazione',
          lead_source: OPPORTUNITY_SOURCE[String(lead.lead_source)],
          description: lead.appointment_notes ?? lead.description,
        },
        input.ownerId,
      );
      opportunityId = opp.id;
    }

    await this.records.setComputed(tx, sec, 'Leads', row, {
      lead_status: LEAD_CONVERTED,
      converted_at: new Date().toISOString(),
      converted_account_id: accountId,
      converted_contact_id: contact.id,
      ...(opportunityId ? { converted_opportunity_id: opportunityId } : {}),
    });

    await this.moveActivities(tx, sec, leadId, { account_id: accountId, contact_id: contact.id, opportunity_id: opportunityId });

    return { leadId, accountId, contactId: contact.id, opportunityId: opportunityId ?? null };
  }

  /** Le attività del lead vengono collegate anche ad azienda, contatto e opportunità (se non lo erano già). */
  private async moveActivities(tx: Tx, sec: SecurityContext, leadId: string, links: Record<string, string | undefined>) {
    const rows = (
      await tx.query<Row>(
        `SELECT * FROM records WHERE module = 'Activities' AND deleted_at IS NULL AND data->>'lead_id' = $1`,
        [leadId],
      )
    ).rows;
    for (const act of rows) {
      const values = Object.fromEntries(Object.entries(links).filter(([k, v]) => v && !act.data[k]));
      if (Object.keys(values).length) await this.records.setComputed(tx, sec, 'Activities', act, values);
    }
  }
}
