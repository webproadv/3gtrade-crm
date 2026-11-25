/**
 * Tenant dimostrativo con utenti e dati di esempio.
 */
import * as bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { computeLabel } from '../metadata/field-types';
import { STANDARD_MODULES } from '../metadata/standard-modules';
import { documentTotals, formatDocNumber, grandTotal, lineAmounts } from '../records/line-documents';
import { provisionTenant } from './provisioning';

export interface DemoOptions {
  slug?: string;
  password?: string;
  /** ricrea il tenant se esiste già */
  reset?: boolean;
}

export const DEMO_USERS = [
  ['admin@3gtrade.local', 'amministratore'],
  ['giulia.bianchi@3gtrade.local', 'responsabile vendite'],
  ['marco.rossi@3gtrade.local', 'commerciale'],
  ['luca.verdi@3gtrade.local', 'commerciale'],
] as const;

/** Crea il tenant demo; restituisce false se esisteva già e non è stato ricreato. */
export async function seedDemo(pool: Pool, opts: DemoOptions = {}): Promise<boolean> {
  const SLUG = opts.slug ?? 'demo';
  const PASSWORD = opts.password ?? 'demo1234';
  const existing = await pool.query(`SELECT id FROM tenants WHERE slug = $1`, [SLUG]);
  if (existing.rowCount) {
    if (!opts.reset) return false;
    await pool.query(`DELETE FROM tenants WHERE slug = $1`, [SLUG]);
  }

  const t = await provisionTenant(pool, {
    slug: SLUG,
    name: '3Gtrade Demo',
    admin: { email: 'admin@3gtrade.local', password: PASSWORD, firstName: 'Amministratore', lastName: 'Sistema' },
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [t.tenantId]);
    const hash = await bcrypt.hash(PASSWORD, 10);
    const user = async (email: string, first: string, last: string, roleId: string) =>
      (
        await client.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [t.tenantId, email, hash, first, last, roleId],
        )
      ).rows[0].id as string;
    const manager = await user('giulia.bianchi@3gtrade.local', 'Giulia', 'Bianchi', t.roles.salesManager);
    const rep1 = await user('marco.rossi@3gtrade.local', 'Marco', 'Rossi', t.roles.salesRep);
    const rep2 = await user('luca.verdi@3gtrade.local', 'Luca', 'Verdi', t.roles.salesRep);

    const labelFields = Object.fromEntries(STANDARD_MODULES.map((m) => [m.name, m.labelFields]));
    const rec = async (module: string, owner: string, data: Record<string, unknown>) => {
      const id: string = (
        await client.query(
          `INSERT INTO records (tenant_id, module, label, owner_id, data, created_by)
           VALUES ($1, $2, $3, $4, $5, $4) RETURNING id`,
          [t.tenantId, module, computeLabel(labelFields[module], data), owner, JSON.stringify(data)],
        )
      ).rows[0].id;
      await client.query(
        `INSERT INTO record_history (tenant_id, record_id, user_id, action, changes) VALUES ($1, $2, $3, 'create', $4)`,
        [t.tenantId, id, owner, JSON.stringify(data)],
      );
      return id;
    };

    const acc1 = await rec('Accounts', rep1, {
      name: 'Officine Meccaniche Lombarde S.r.l.',
      account_type: 'Cliente',
      industry: 'Manifattura',
      vat_number: '01234567890',
      phone: '+39 02 1234567',
      email: 'info@oml.example',
      billing_city: 'Milano',
      billing_province: 'MI',
      billing_country: 'Italia',
      employees: 85,
      annual_revenue: 12500000,
    });
    const acc2 = await rec('Accounts', rep2, {
      name: 'Solare Adriatico S.p.A.',
      account_type: 'Prospect',
      industry: 'Energia',
      phone: '+39 071 765432',
      billing_city: 'Ancona',
      billing_province: 'AN',
      billing_country: 'Italia',
    });
    const acc3 = await rec('Accounts', manager, {
      name: 'Logistica Tirrenica S.r.l.',
      account_type: 'Partner',
      industry: 'Trasporti',
      billing_city: 'Livorno',
      billing_province: 'LI',
      billing_country: 'Italia',
    });

    const c1 = await rec('Contacts', rep1, {
      salutation: 'Ing.',
      first_name: 'Paolo',
      last_name: 'Ferri',
      account_id: acc1,
      job_title: 'Direttore tecnico',
      email: 'paolo.ferri@oml.example',
      phone: '+39 02 1234568',
    });
    await rec('Contacts', rep1, { first_name: 'Sara', last_name: 'Colombo', account_id: acc1, job_title: 'Acquisti' });
    const c3 = await rec('Contacts', rep2, {
      salutation: 'Dott.ssa',
      first_name: 'Elena',
      last_name: 'Marchetti',
      account_id: acc2,
      email: 'e.marchetti@solareadriatico.example',
    });
    await rec('Contacts', manager, { first_name: 'Andrea', last_name: 'Neri', account_id: acc3 });

    const opp1 = await rec('Opportunities', rep1, {
      name: 'Fornitura linea di assemblaggio',
      account_id: acc1,
      contact_id: c1,
      amount: 180000,
      close_date: '2027-02-28',
      sales_stage: 'Proposta',
      probability: 60,
      lead_source: 'Fiera',
    });
    await rec('Opportunities', rep1, {
      name: 'Contratto manutenzione 2027',
      account_id: acc1,
      amount: 24000,
      close_date: '2026-12-20',
      sales_stage: 'Negoziazione',
      probability: 80,
    });
    await rec('Opportunities', rep2, {
      name: 'Impianto fotovoltaico 500 kW',
      account_id: acc2,
      contact_id: c3,
      amount: 420000,
      close_date: '2027-04-15',
      sales_stage: 'Qualificazione',
      probability: 30,
      lead_source: 'Sito web',
    });

    // attività attorno alla data odierna, così calendario e panoramica mostrano qualcosa
    const at = (days: number, hour: number, minute = 0) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      d.setHours(hour, minute, 0, 0);
      return d.toISOString();
    };
    const act = (owner: string, data: Record<string, unknown>) =>
      rec('Activities', owner, { status: 'Pianificata', priority: 'Media', ...data });
    await act(rep1, {
      subject: 'Inviare offerta aggiornata',
      activity_type: 'Compito',
      priority: 'Alta',
      start: at(-1, 17),
      account_id: acc1,
      opportunity_id: opp1,
    });
    await act(rep1, {
      subject: 'Chiamata con Ing. Ferri',
      activity_type: 'Chiamata',
      start: at(0, 10),
      end: at(0, 10, 30),
      account_id: acc1,
      contact_id: c1,
    });
    await act(rep1, {
      subject: 'Visita in stabilimento',
      activity_type: 'Appuntamento',
      start: at(2, 9, 30),
      end: at(2, 12),
      location: 'Milano',
      account_id: acc1,
      opportunity_id: opp1,
    });
    await act(rep1, {
      subject: 'Follow-up contratto manutenzione',
      activity_type: 'Email',
      start: at(4, 11),
      account_id: acc1,
    });
    await act(rep1, {
      subject: 'Riunione kick-off',
      activity_type: 'Appuntamento',
      status: 'Completata',
      start: at(-6, 14),
      end: at(-6, 15),
      account_id: acc1,
    });
    await act(rep2, {
      subject: 'Sopralluogo impianto',
      activity_type: 'Appuntamento',
      start: at(1, 15),
      end: at(1, 17),
      location: 'Ancona',
      account_id: acc2,
      contact_id: c3,
    });
    await act(manager, {
      subject: 'Revisione pipeline con il team',
      activity_type: 'Appuntamento',
      start: at(3, 9),
      end: at(3, 10),
    });
    // catalogo prodotti e una PDA con righe (dati di fantasia)
    const prod = (data: Record<string, unknown>) => rec('Products', manager, { active: true, vat_rate: 22, ...data });
    const pFv = await prod({
      name: 'Modulo fotovoltaico 430 W',
      product_code: 'FV-430',
      product_type: 'Prodotto',
      category: 'Fotovoltaico',
      unit: 'pz',
      unit_price: 165,
    });
    const pInv = await prod({
      name: 'Inverter ibrido 6 kW',
      product_code: 'INV-6H',
      product_type: 'Prodotto',
      category: 'Fotovoltaico',
      unit: 'pz',
      unit_price: 1450,
    });
    const pBat = await prod({
      name: 'Batteria di accumulo 10 kWh',
      product_code: 'ACC-10',
      product_type: 'Prodotto',
      category: 'Accumulo',
      unit: 'pz',
      unit_price: 4200,
    });
    await prod({
      name: 'Pompa di calore 8 kW',
      product_code: 'PDC-8',
      product_type: 'Prodotto',
      category: 'Pompa di calore',
      unit: 'pz',
      unit_price: 5900,
    });
    const pInst = await prod({
      name: 'Installazione e collaudo',
      product_code: 'SRV-INST',
      product_type: 'Servizio',
      category: 'Servizi',
      unit: 'a corpo',
      unit_price: 2200,
      vat_rate: 10,
    });

    const year = new Date().getFullYear();
    const pdaLines = [
      { productId: pFv, description: 'Modulo fotovoltaico 430 W', quantity: 14, unitPrice: 165, discount: 5, vatRate: 10 },
      { productId: pInv, description: 'Inverter ibrido 6 kW', quantity: 1, unitPrice: 1450, discount: 0, vatRate: 10 },
      { productId: pBat, description: 'Batteria di accumulo 10 kWh', quantity: 1, unitPrice: 4200, discount: 0, vatRate: 10 },
      { productId: pInst, description: 'Installazione e collaudo', quantity: 1, unitPrice: 2200, discount: 0, vatRate: 10 },
    ].map((l) => ({ ...l, amounts: lineAmounts(l) }));
    const totals = documentTotals(pdaLines.map((l) => l.amounts));
    const adjustment = -Math.round((totals.total % 50) * 100) / 100; // arrotonda alla cinquantina inferiore
    await client.query(
      `INSERT INTO record_counters (tenant_id, module, year, last_value) VALUES ($1, 'SalesOrders', $2, 1)`,
      [t.tenantId, year],
    );
    const pda = await rec('SalesOrders', rep2, {
      subject: 'Impianto fotovoltaico 6 kW con accumulo',
      order_number: formatDocNumber('', year, 1),
      order_date: new Date().toISOString().slice(0, 10),
      account_id: acc2,
      contact_id: c3,
      status: 'Firmata',
      product_category: 'Fotovoltaico',
      source: 'Sito web',
      payment_type: 'Finanziamento',
      financing_company: 'Finanziaria di esempio',
      financed_amount: grandTotal(totals.net, totals.vat, adjustment),
      down_payment: 0,
      subtotal: totals.net,
      vat_total: totals.vat,
      adjustment,
      grand_total: grandTotal(totals.net, totals.vat, adjustment),
    });
    for (const [i, l] of pdaLines.entries()) {
      await client.query(
        `INSERT INTO record_lines (tenant_id, record_id, position, product_id, description, quantity, unit_price,
                                   discount, vat_rate, net_amount, vat_amount, total_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [t.tenantId, pda, i + 1, l.productId, l.description, l.quantity, l.unitPrice, l.discount, l.vatRate,
         l.amounts.net, l.amounts.vat, l.amounts.total],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return true;
}
