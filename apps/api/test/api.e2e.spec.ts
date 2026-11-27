/**
 * Test end-to-end su PostgreSQL reale.
 * Richiede TEST_DATABASE_URL (default: postgres://crm:crm@localhost:5432/crm_test).
 * Il database viene svuotato all'avvio.
 */
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { loadConfig } from '../src/config';
import { assertRlsEnforced, migrate } from '../src/db/migrator';
import { EVENT_HANDLERS, EventHandler } from '../src/events/event-handlers';
import { OutboxWorker } from '../src/events/outbox.worker';
import { ensureStandardModules, provisionFromEnv, provisionTenant } from '../src/tenants/provisioning';

const DB = process.env.TEST_DATABASE_URL ?? 'postgres://crm:crm@localhost:5432/crm_test';
const PASSWORD = 'password123';

let app: INestApplication;
let pool: Pool;
let acme: Awaited<ReturnType<typeof provisionTenant>>;
const tokens: Record<string, string> = {};
const seen: string[] = [];

async function login(tenant: string, email: string, password = PASSWORD) {
  const r = await request(app.getHttpServer()).post('/api/auth/login').send({ tenant, email, password });
  expect(r.status).toBe(201);
  return r.body.accessToken as string;
}

const as = (who: string) => ({
  get: (url: string) => request(app.getHttpServer()).get(`/api${url}`).set('authorization', `Bearer ${tokens[who]}`),
  post: (url: string, body: object) =>
    request(app.getHttpServer()).post(`/api${url}`).set('authorization', `Bearer ${tokens[who]}`).send(body),
  patch: (url: string, body: object) =>
    request(app.getHttpServer()).patch(`/api${url}`).set('authorization', `Bearer ${tokens[who]}`).send(body),
  put: (url: string, body: object) =>
    request(app.getHttpServer()).put(`/api${url}`).set('authorization', `Bearer ${tokens[who]}`).send(body),
  del: (url: string) => request(app.getHttpServer()).delete(`/api${url}`).set('authorization', `Bearer ${tokens[who]}`),
});

beforeAll(async () => {
  pool = new Pool({ connectionString: DB });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await assertRlsEnforced(pool, true, () => undefined);
  await migrate(pool);
  acme = await provisionTenant(pool, {
    slug: 'acme',
    name: 'Acme',
    admin: { email: 'admin@acme.test', password: PASSWORD, firstName: 'Ada', lastName: 'Admin' },
  });
  await provisionTenant(pool, {
    slug: 'other',
    name: 'Other',
    admin: { email: 'admin@other.test', password: PASSWORD, firstName: 'Otto', lastName: 'Other' },
  });

  const spy: EventHandler = {
    name: 'spy',
    supports: () => true,
    handle: async (e) => {
      seen.push(`${e.type}:${e.payload.module}`);
    },
  };
  app = await NestFactory.create(
    AppModule.forRoot({ ...loadConfig({}), databaseUrl: DB, workerEnabled: false }),
    { logger: false },
  );
  // aggiunge un gestore di test all'elenco dei gestori di eventi
  app.get<EventHandler[]>(EVENT_HANDLERS).push(spy);
  app.setGlobalPrefix('api');
  await app.init();

  tokens.admin = await login('acme', 'admin@acme.test');
  tokens.other = await login('other', 'admin@other.test');

  const mk = async (email: string, roleId: string) =>
    (
      await as('admin').post('/admin/users', { email, password: PASSWORD, firstName: 'U', lastName: email, roleId })
    ).body.id;
  await mk('manager@acme.test', acme.roles.salesManager);
  await mk('rep1@acme.test', acme.roles.salesRep);
  await mk('rep2@acme.test', acme.roles.salesRep);
  tokens.manager = await login('acme', 'manager@acme.test');
  tokens.rep1 = await login('acme', 'rep1@acme.test');
  tokens.rep2 = await login('acme', 'rep2@acme.test');
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

describe('autenticazione', () => {
  it('rifiuta credenziali errate e richieste senza token', async () => {
    const bad = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ tenant: 'acme', email: 'admin@acme.test', password: 'sbagliata' });
    expect(bad.status).toBe(401);
    expect((await request(app.getHttpServer()).get('/api/modules')).status).toBe(401);
  });

  it('restituisce il profilo utente', async () => {
    const me = await as('rep1').get('/auth/me');
    expect(me.body).toMatchObject({ email: 'rep1@acme.test', isAdmin: false, role: 'Commerciale' });
    expect(me.body.permissions.Accounts).toEqual({ view: true, create: true, edit: true, delete: false });
  });

  it('blocca gli accessi dopo troppi tentativi falliti', async () => {
    const attempt = (password: string) =>
      request(app.getHttpServer()).post('/api/auth/login').send({ tenant: 'acme', email: 'nessuno@acme.test', password });
    for (let i = 0; i < 10; i++) expect((await attempt('sbagliata')).status).toBe(401);
    expect((await attempt('sbagliata')).status).toBe(429);
    // gli altri utenti non sono bloccati
    expect(await login('acme', 'admin@acme.test')).toBeTruthy();
  });

  it('permette di cambiare la propria password', async () => {
    const wrong = await as('other').post('/auth/password', { currentPassword: 'errata', newPassword: 'nuovapass123' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.errors.currentPassword).toBeDefined();
    const short = await as('other').post('/auth/password', { currentPassword: PASSWORD, newPassword: 'corta' });
    expect(short.status).toBe(400);
    const ok = await as('other').post('/auth/password', { currentPassword: PASSWORD, newPassword: 'nuovapass123' });
    expect(ok.status).toBe(201);
    expect(await login('other', 'admin@other.test', 'nuovapass123')).toBeTruthy();
    const old = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ tenant: 'other', email: 'admin@other.test', password: PASSWORD });
    expect(old.status).toBe(401);
  });

  it('crea l\'azienda iniziale dalle variabili INIT_* una sola volta', async () => {
    const env = {
      INIT_TENANT_SLUG: 'Nuova',
      INIT_TENANT_NAME: 'Nuova Srl',
      INIT_ADMIN_EMAIL: 'capo@nuova.test',
      INIT_ADMIN_PASSWORD: 'unapassword-lunga',
    };
    await expect(provisionFromEnv(pool, { ...env, INIT_ADMIN_PASSWORD: 'corta' })).rejects.toThrow('INIT_ADMIN_PASSWORD');
    expect(await provisionFromEnv(pool, env)).toBe('nuova');
    expect(await provisionFromEnv(pool, env)).toBeNull();
    expect(await provisionFromEnv(pool, {})).toBeNull();
    expect(await login('nuova', 'capo@nuova.test', 'unapassword-lunga')).toBeTruthy();
  });
});

describe('record e permessi', () => {
  let accountId: string;

  it('crea un\'azienda con validazione dei campi', async () => {
    const bad = await as('rep1').post('/records/Accounts', { data: { email: 'x' } });
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toMatchObject({ email: expect.any(String), name: 'campo obbligatorio' });

    const ok = await as('rep1').post('/records/Accounts', {
      data: { name: 'Rossi S.r.l.', account_type: 'Cliente', employees: '12' },
    });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ label: 'Rossi S.r.l.', data: { employees: 12 }, permissions: { edit: true, delete: false } });
    accountId = ok.body.id;
  });

  it('applica la gerarchia dei ruoli', async () => {
    expect((await as('rep1').get(`/records/Accounts/${accountId}`)).status).toBe(200);
    expect((await as('manager').get(`/records/Accounts/${accountId}`)).status).toBe(200);
    expect((await as('rep2').get(`/records/Accounts/${accountId}`)).status).toBe(403);
    expect((await as('rep2').get('/records/Accounts')).body.total).toBe(0);
    expect((await as('manager').get('/records/Accounts')).body.total).toBe(1);
  });

  it('isola i tenant', async () => {
    expect((await as('other').get(`/records/Accounts/${accountId}`)).status).toBe(404);
    expect((await as('other').get('/records/Accounts')).body.total).toBe(0);
  });

  it('rispetta la condivisione a livello di modulo', async () => {
    await as('admin').patch('/admin/modules/Accounts', { sharing: 'public_read' });
    expect((await as('rep2').get(`/records/Accounts/${accountId}`)).body.permissions).toEqual({ edit: false, delete: false });
    expect((await as('rep2').patch(`/records/Accounts/${accountId}`, { data: { phone: '1' } })).status).toBe(403);
    await as('admin').patch('/admin/modules/Accounts', { sharing: 'private' });
  });

  it('nega le azioni non previste dal profilo', async () => {
    expect((await as('rep1').del(`/records/Accounts/${accountId}`)).status).toBe(403);
    expect((await as('rep1').get('/admin/users')).status).toBe(403);
  });

  it('valida le relazioni e mostra liste correlate e storico', async () => {
    const badRel = await as('rep1').post('/records/Contacts', {
      data: { last_name: 'Bianchi', account_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(badRel.status).toBe(400);

    const contact = await as('rep1').post('/records/Contacts', {
      data: { first_name: 'Anna', last_name: 'Bianchi', account_id: accountId },
    });
    expect(contact.status).toBe(201);
    expect(contact.body.label).toBe('Anna Bianchi');
    expect(contact.body.refs.records[accountId].label).toBe('Rossi S.r.l.');

    const opp = await as('rep1').post('/records/Opportunities', {
      data: { name: 'Fornitura', account_id: accountId, amount: 1000, close_date: '2027-01-31', sales_stage: 'Proposta' },
    });
    expect(opp.status).toBe(201);

    const rel = await as('rep1').get(`/records/Accounts/${accountId}/related`);
    const byModule = Object.fromEntries(rel.body.map((r: any) => [`${r.module}.${r.field}`, r.total]));
    expect(byModule).toEqual({
      'Leads.converted_account_id': 0,
      'Accounts.parent_account_id': 0,
      'Contacts.account_id': 1,
      'Opportunities.account_id': 1,
      'Activities.account_id': 0,
      'SalesOrders.account_id': 0,
    });

    const upd = await as('rep1').patch(`/records/Opportunities/${opp.body.id}`, { data: { sales_stage: 'Chiusa vinta' } });
    expect(upd.body.data.sales_stage).toBe('Chiusa vinta');
    const hist = await as('rep1').get(`/records/Opportunities/${opp.body.id}/history`);
    expect(hist.body.map((h: any) => h.action)).toEqual(['update', 'create']);
    expect(hist.body[0].changes.sales_stage).toEqual(['Proposta', 'Chiusa vinta']);
  });

  it('filtra, cerca e ordina', async () => {
    await as('rep1').post('/records/Accounts', { data: { name: 'Alfa SpA', account_type: 'Prospect', employees: 500 } });
    const q = await as('rep1').get('/records/Accounts?q=alfa');
    expect(q.body.items.map((i: any) => i.label)).toEqual(['Alfa SpA']);
    const f = await as('rep1').get('/records/Accounts?filter[account_type]=Cliente');
    expect(f.body.items.map((i: any) => i.label)).toEqual(['Rossi S.r.l.']);
    const s = await as('rep1').get('/records/Accounts?sort=employees&dir=desc');
    expect(s.body.items.map((i: any) => i.data.employees)).toEqual([500, 12]);
    expect((await as('rep1').get('/records/Accounts?sort=nonesiste')).status).toBe(400);
  });
});

describe('metadati personalizzabili', () => {
  it('aggiunge un campo personalizzato e lo valida', async () => {
    const field = await as('admin').post('/admin/modules/Accounts/fields', {
      label: 'Classe cliente',
      type: 'picklist',
      inList: true,
      options: { values: ['A', 'B', 'C'] },
    });
    expect(field.status).toBe(201);
    expect(field.body).toMatchObject({ name: 'cf_classe_cliente', isCustom: true });

    const mod = await as('rep1').get('/modules/Accounts');
    expect(mod.body.fields.map((f: any) => f.name)).toContain('cf_classe_cliente');

    expect((await as('rep1').post('/records/Accounts', { data: { name: 'Z', cf_classe_cliente: 'Z' } })).status).toBe(400);
    const ok = await as('rep1').post('/records/Accounts', { data: { name: 'Beta', cf_classe_cliente: 'B' } });
    expect(ok.body.data.cf_classe_cliente).toBe('B');
  });

  it('nasconde i campi secondo il profilo', async () => {
    const mod = await as('admin').get('/admin/modules');
    const revenue = mod.body.find((m: any) => m.name === 'Accounts').fields.find((f: any) => f.name === 'annual_revenue');
    await as('admin').put(`/admin/profiles/${acme.profiles.sales}/permissions`, {
      fields: { [revenue.id]: { visible: false, editable: false } },
    });
    const created = await as('admin').post('/records/Accounts', { data: { name: 'Gamma', annual_revenue: 1000 } });
    await as('admin').patch(`/records/Accounts/${created.body.id}`, { ownerId: (await as('rep1').get('/auth/me')).body.id });

    const seenByRep = await as('rep1').get(`/records/Accounts/${created.body.id}`);
    expect(seenByRep.body.data.annual_revenue).toBeUndefined();
    expect(seenByRep.body.data.name).toBe('Gamma');
    const write = await as('rep1').patch(`/records/Accounts/${created.body.id}`, { data: { annual_revenue: 5 } });
    expect(write.status).toBe(400);
  });

  it('crea un modulo personalizzato utilizzabile subito', async () => {
    const m = await as('admin').post('/admin/modules', { name: 'Projects', label: 'Progetti', labelSingular: 'Progetto' });
    expect(m.status).toBe(201);
    await as('admin').post('/admin/modules/Projects/fields', { label: 'Cliente', type: 'relation', options: { module: 'Accounts' } });
    const r = await as('admin').post('/records/Projects', { data: { name: 'Nuovo stabilimento' } });
    expect(r.status).toBe(201);
    // i commerciali non hanno ancora permessi sul nuovo modulo
    expect((await as('rep1').get('/records/Projects')).status).toBe(403);
    await as('admin').put(`/admin/profiles/${acme.profiles.sales}/permissions`, {
      modules: { Projects: { view: true, create: true, edit: true, delete: false } },
    });
    expect((await as('rep1').get('/records/Projects')).status).toBe(200);
  });
});

describe('attività e calendario', () => {
  let accountId: string;
  let activityId: string;

  beforeAll(async () => {
    accountId = (await as('rep1').post('/records/Accounts', { data: { name: 'Delta Srl' } })).body.id;
  });

  it('crea un\'attività con i valori predefiniti', async () => {
    const r = await as('rep1').post('/records/Activities', {
      data: { subject: 'Chiamare il cliente', start: '2027-03-10T09:00:00+01:00', account_id: accountId },
    });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({
      activity_type: 'Compito',
      status: 'Pianificata',
      priority: 'Media',
      start: '2027-03-10T08:00:00.000Z',
    });
    activityId = r.body.id;
    const rel = await as('rep1').get(`/records/Accounts/${accountId}/related`);
    expect(rel.body.find((x: any) => x.module === 'Activities').total).toBe(1);
  });

  it('rifiuta una fine precedente all\'inizio, anche in modifica', async () => {
    const bad = await as('rep1').post('/records/Activities', {
      data: { subject: 'X', start: '2027-03-10T10:00:00Z', end: '2027-03-10T09:00:00Z' },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.end).toBeDefined();
    const upd = await as('rep1').patch(`/records/Activities/${activityId}`, { data: { end: '2027-03-10T07:00:00Z' } });
    expect(upd.status).toBe(400);
  });

  it('restituisce le attività dell\'intervallo nel calendario, rispettando la visibilità', async () => {
    await as('rep1').post('/records/Activities', {
      data: { subject: 'Riunione', activity_type: 'Appuntamento', start: '2027-03-12T14:00:00Z', end: '2027-03-12T15:00:00Z' },
    });
    await as('rep1').post('/records/Activities', { data: { subject: 'Fuori intervallo', start: '2027-04-20T09:00:00Z' } });

    const cal = await as('rep1').get('/calendar?from=2027-03-01T00:00:00Z&to=2027-04-01T00:00:00Z');
    expect(cal.status).toBe(200);
    expect(cal.body.items.map((i: any) => i.label)).toEqual(['Chiamare il cliente', 'Riunione']);
    expect((await as('rep2').get('/calendar?from=2027-03-01T00:00:00Z&to=2027-04-01T00:00:00Z')).body.total).toBe(0);
    expect((await as('manager').get('/calendar?from=2027-03-01T00:00:00Z&to=2027-04-01T00:00:00Z')).body.total).toBe(2);
    expect((await as('rep1').get('/calendar?from=2027-01-01T00:00:00Z&to=2027-06-01T00:00:00Z')).status).toBe(400);
  });

  it('filtra per intervallo nelle liste e valida i campi ammessi', async () => {
    const r = await as('rep1').get('/records/Activities?after[start]=2027-03-11T00:00:00Z&sort=start&dir=asc');
    expect(r.body.items.map((i: any) => i.label)).toEqual(['Riunione', 'Fuori intervallo']);
    expect((await as('rep1').get('/records/Activities?after[subject]=a')).status).toBe(400);
    const num = await as('rep1').get('/records/Accounts?after[employees]=100');
    expect(num.body.items.every((i: any) => i.data.employees >= 100)).toBe(true);
  });

  it('aggiunge il modulo Attività ai tenant esistenti ereditando i permessi', async () => {
    const tenant = (await pool.query(`SELECT id FROM tenants WHERE slug = 'other'`)).rows[0].id;
    const client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
    await client.query(`DELETE FROM profile_module_permissions WHERE module = 'Activities'`);
    await client.query(`DELETE FROM modules WHERE name = 'Activities'`);
    await client.query(`DELETE FROM fields WHERE module = 'Accounts' AND name = 'pec'`);
    await client.query(`UPDATE modules SET label = 'Aziende', label_singular = 'Azienda' WHERE name = 'Accounts'`);
    // un elenco con un valore personalizzato dell'azienda e senza uno dei valori standard
    await client.query(
      `UPDATE fields SET options = jsonb_set(options, '{values}', '["Cliente", "Prospect", "Partner", "Fornitore", "Rivenditore"]')
        WHERE module = 'Accounts' AND name = 'account_type'`,
    );
    await client.query('COMMIT');
    client.release();
    expect((await as('other').get('/records/Activities')).status).toBe(404);

    const added = await ensureStandardModules(pool);
    expect(added).toEqual([
      'other: modulo Accounts rinominato in Clienti',
      'other: valori Accounts.account_type (Concorrente)',
      'other: campo Accounts.pec',
      'other: modulo Activities',
    ]);
    const meta = await as('other').get('/modules/Accounts');
    expect(meta.body.label).toBe('Clienti');
    expect(meta.body.fields.find((f: any) => f.name === 'account_type').options.values).toEqual([
      'Cliente', 'Prospect', 'Partner', 'Fornitore', 'Rivenditore', 'Concorrente',
    ]);
    expect((await as('other').get('/records/Activities')).status).toBe(200);
    expect(await ensureStandardModules(pool)).toEqual([]);
  });
});

describe('eventi in background', () => {
  it('processa l\'outbox con i gestori registrati', async () => {
    const worker = app.get(OutboxWorker);
    while ((await worker.tick()) > 0);
    expect(seen).toEqual(expect.arrayContaining(['record.created:Accounts', 'record.updated:Opportunities']));
    const client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.worker', 'on', true)`);
    const counts = await client.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE processed_at IS NULL)::int AS pending FROM outbox_events`,
    );
    await client.query('COMMIT');
    client.release();
    expect(counts.rows[0].total).toBeGreaterThan(0);
    expect(counts.rows[0].pending).toBe(0);
  });
});

describe('rapporti', () => {
  let rpt: Awaited<ReturnType<typeof provisionTenant>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    rpt = await provisionTenant(pool, {
      slug: 'rpt',
      name: 'Rapporti',
      admin: { email: 'admin@rpt.test', password: PASSWORD, firstName: 'Ada', lastName: 'Rpt' },
    });
    tokens.rptAdmin = await login('rpt', 'admin@rpt.test');
    for (const u of ['rep1', 'rep2']) {
      const r = await as('rptAdmin').post('/admin/users', {
        email: `${u}@rpt.test`,
        password: PASSWORD,
        firstName: u,
        lastName: 'Rpt',
        roleId: rpt.roles.salesRep,
      });
      ids[u] = r.body.id;
      tokens[`rpt_${u}`] = await login('rpt', `${u}@rpt.test`);
    }
    const opp = async (who: string, name: string, amount: number, stage: string, close: string) => {
      const acc = await as(who).post('/records/Accounts', { data: { name: `Az ${name}` } });
      const r = await as(who).post('/records/Opportunities', {
        data: { name, account_id: acc.body.id, amount, sales_stage: stage, close_date: close },
      });
      expect(r.status).toBe(201);
    };
    await opp('rpt_rep1', 'Uno', 1000, 'Proposta', '2026-01-15');
    await opp('rpt_rep1', 'Due', 2500.5, 'Chiusa vinta', '2026-01-20');
    await opp('rpt_rep2', 'Tre', 4000, 'Proposta', '2026-02-03');
    await opp('rpt_rep2', 'Quattro', 500, 'Chiusa persa', '2026-03-10');
  });

  const config = {
    columns: ['name', 'amount', 'sales_stage', 'ownerId'],
    filters: [],
    groupBy: { field: 'sales_stage' },
    totals: [{ field: 'amount', fn: 'sum' }],
    sort: { field: 'amount', dir: 'desc' },
    chart: 'bar',
  };

  it('raggruppa e totalizza rispettando la visibilità dei record', async () => {
    const all = await as('rptAdmin').post('/reports/run', { module: 'Opportunities', config });
    expect(all.status).toBe(201);
    expect(all.body.totals).toEqual({ count: 4, 'sum:amount': 8000.5 });
    expect(all.body.groups.map((g: any) => [g.label, g.count, g.totals['sum:amount']])).toEqual([
      ['Chiusa persa', 1, 500],
      ['Chiusa vinta', 1, 2500.5],
      ['Proposta', 2, 5000],
    ]);
    // ordinati per fase e poi per importo decrescente
    expect(all.body.rows.map((r: any) => r.values.name)).toEqual(['Quattro', 'Due', 'Tre', 'Uno']);
    expect(all.body.refs.users[ids.rep1]).toBe('rep1 Rpt');

    const mine = await as('rpt_rep1').post('/reports/run', { module: 'Opportunities', config });
    expect(mine.body.totals).toEqual({ count: 2, 'sum:amount': 3500.5 });
  });

  it('filtra per valore, intervallo e utente, e raggruppa per mese', async () => {
    const run = (filters: object[], extra: object = {}) =>
      as('rptAdmin').post('/reports/run', { module: 'Opportunities', config: { ...config, groupBy: null, filters, ...extra } });
    expect((await run([{ field: 'sales_stage', op: 'eq', value: 'Proposta' }])).body.totals.count).toBe(2);
    expect((await run([{ field: 'sales_stage', op: 'neq', value: 'Proposta' }])).body.totals.count).toBe(2);
    expect((await run([{ field: 'amount', op: 'gte', value: 2500.5 }])).body.totals.count).toBe(2);
    expect((await run([{ field: 'name', op: 'contains', value: 'TR' }])).body.rows[0].values.name).toBe('Tre');
    expect((await run([{ field: 'close_date', op: 'lte', value: '2026-01-31' }])).body.totals.count).toBe(2);
    expect((await run([{ field: 'ownerId', op: 'eq', value: ids.rep2 }])).body.totals['sum:amount']).toBe(4500);
    expect((await run([{ field: 'createdAt', op: 'period', value: 'today' }])).body.totals.count).toBe(4);
    expect((await run([{ field: 'description', op: 'empty' }])).body.totals.count).toBe(4);

    const byMonth = await run([], { groupBy: { field: 'close_date', dateGroup: 'month' }, groupOrder: 'key' });
    expect(byMonth.body.groups.map((g: any) => [g.label, g.count])).toEqual([
      ['Gennaio 2026', 2],
      ['Febbraio 2026', 1],
      ['Marzo 2026', 1],
    ]);
    const byOwner = await run([], { groupBy: { field: 'ownerId' }, groupOrder: 'count' });
    expect(byOwner.body.groups.map((g: any) => g.label).sort()).toEqual(['rep1 Rpt', 'rep2 Rpt']);

    const bad = await run([{ field: 'name', op: 'gt', value: 'x' }, { field: 'boh', op: 'eq', value: 1 }]);
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.errors)).toEqual(['filters.0', 'filters.1']);
  });

  it('salva, condivide ed esporta in CSV', async () => {
    const created = await as('rpt_rep1').post('/reports', {
      name: 'Opportunità per fase',
      module: 'Opportunities',
      config,
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    // privato: rep2 non lo vede finché non è condiviso
    const mineOnly = (body: any[]) => body.filter((r) => r.id === id);
    expect(mineOnly((await as('rpt_rep2').get('/reports')).body)).toEqual([]);
    expect((await as('rpt_rep2').get(`/reports/${id}`)).status).toBe(404);
    await as('rpt_rep1').patch(`/reports/${id}`, { name: 'Opportunità per fase', module: 'Opportunities', shared: true, config });
    const list = await as('rpt_rep2').get('/reports');
    expect(mineOnly(list.body).map((r: any) => [r.name, r.canEdit])).toEqual([['Opportunità per fase', false]]);

    // stesso rapporto, dati diversi: rep2 vede solo i suoi record
    const run = await as('rpt_rep2').get(`/reports/${id}/run`);
    expect(run.body.result.totals.count).toBe(2);
    expect((await as('rpt_rep2').del(`/reports/${id}`)).status).toBe(403);

    const csv = await as('rpt_rep1').get(`/reports/${id}/export`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('opportunita-per-fase.csv');
    const lines = csv.text.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('Nome opportunità;Importo;Fase di vendita;Assegnato a');
    expect(lines).toContain('Due;2500,5;Chiusa vinta;rep1 Rpt');
    const summary = await as('rpt_rep1').get(`/reports/${id}/export?part=summary`);
    expect(summary.text.trim().split('\r\n').slice(-1)[0]).toBe('Totale;2;3500,5');

    expect((await as('rpt_rep1').del(`/reports/${id}`)).status).toBe(200);
    expect((await as('rptAdmin').get(`/reports/${id}`)).status).toBe(404);
  });

  it('ignora i campi nascosti all\'utente e li rifiuta al salvataggio', async () => {
    const mod = await as('rptAdmin').get('/admin/modules');
    const amount = mod.body.find((m: any) => m.name === 'Opportunities').fields.find((f: any) => f.name === 'amount');
    await as('rptAdmin').put(`/admin/profiles/${rpt.profiles.sales}/permissions`, {
      fields: { [amount.id]: { visible: false, editable: false } },
    });
    // il rapporto salvato dall'amministratore si apre comunque, senza i campi nascosti
    const saved = await as('rptAdmin').post('/reports', { name: 'Con importi', module: 'Opportunities', shared: true, config });
    const run = await as('rpt_rep1').get(`/reports/${saved.body.id}/run`).then((r) => ({ status: r.status, body: r.body.result }));
    expect(run.status).toBe(200);
    expect(run.body.hidden).toEqual(['Importo']);
    expect(run.body.columns.map((c: any) => c.key)).toEqual(['name', 'sales_stage', 'ownerId']);
    expect(run.body.totals).toEqual({ count: 2 });
    expect(run.body.rows[0].values.amount).toBeUndefined();

    const save = await as('rpt_rep1').post('/reports', { name: 'X', module: 'Opportunities', config });
    expect(save.status).toBe(400);
    expect(save.body.errors['columns.1']).toContain('Importo');
    const preview = await as('rpt_rep1').post('/reports/run', { module: 'Opportunities', config });
    expect(preview.status).toBe(400);
  });

  it('non mostra rapporti né dati di altre aziende o di moduli non consentiti', async () => {
    const r = await as('rptAdmin').post('/reports', { name: 'Interno', module: 'Opportunities', config });
    expect((await as('admin').get(`/reports/${r.body.id}`)).status).toBe(404);
    expect((await as('admin').get('/reports')).body.find((x: any) => x.id === r.body.id)).toBeUndefined();
  });

  it('crea i rapporti di esempio con ogni nuova azienda, eseguibili', async () => {
    const list = await as('rpt_rep2').get('/reports');
    const defaults = list.body.filter((r: any) => r.shared && r.ownerName === 'Ada Rpt');
    expect(defaults.map((r: any) => r.name)).toEqual(
      expect.arrayContaining(['Opportunità per fase di vendita', 'Previsione chiusure per mese', 'Attività del mese per tipo']),
    );
    for (const r of defaults) {
      const run = await as('rpt_rep2').get(`/reports/${r.id}/run`);
      expect(run.status).toBe(200);
    }
    const forecast = defaults.find((r: any) => r.name === 'Previsione chiusure per mese');
    const res = (await as('rpt_rep2').get(`/reports/${forecast.id}/run`)).body.result;
    expect(res.totals.count).toBe(1); // "Tre" (Proposta); "Quattro" è chiusa persa
  });

  it('aggiunge una sola volta i rapporti di esempio alle aziende già esistenti', async () => {
    await pool.query(`UPDATE tenants SET default_reports_at = NULL WHERE slug = 'other'`);
    expect(await ensureStandardModules(pool)).toEqual(['other: rapporti di esempio']);
    expect(await ensureStandardModules(pool)).toEqual([]);
    const list = await as('other').get('/reports');
    expect(list.body.filter((r: any) => r.name === 'Opportunità per fase di vendita')).toHaveLength(2);
  });
});

describe('PDA e prodotti', () => {
  let pda: Awaited<ReturnType<typeof provisionTenant>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    pda = await provisionTenant(pool, {
      slug: 'pda',
      name: 'PDA',
      admin: { email: 'admin@pda.test', password: PASSWORD, firstName: 'Ada', lastName: 'Pda' },
    });
    tokens.pdaAdmin = await login('pda', 'admin@pda.test');
    for (const u of ['rep1', 'rep2']) {
      await as('pdaAdmin').post('/admin/users', {
        email: `${u}@pda.test`, password: PASSWORD, firstName: u, lastName: 'Pda', roleId: pda.roles.salesRep,
      });
      tokens[`pda_${u}`] = await login('pda', `${u}@pda.test`);
    }
    ids.account = (await as('pda_rep1').post('/records/Accounts', { data: { name: 'Hotel Prova' } })).body.id;
  });

  it('il catalogo prodotti è in sola lettura per le vendite', async () => {
    const denied = await as('pda_rep1').post('/records/Products', { data: { name: 'X', unit_price: 1 } });
    expect(denied.status).toBe(403);
    const pv = await as('pdaAdmin').post('/records/Products', {
      data: { name: 'Fotovoltaico 7 kWp', product_code: 'FV7', unit_price: 12105 },
    });
    expect(pv.status).toBe(201);
    expect(pv.body.data).toMatchObject({ vat_rate: 22, unit: 'pz', active: true, product_type: 'Prodotto' });
    ids.pv = pv.body.id;
    ids.opt = (await as('pdaAdmin').post('/records/Products', { data: { name: 'Ottimizzatori', unit_price: 50, vat_rate: 10 } })).body.id;
    const seen = await as('pda_rep1').get('/records/Products');
    expect(seen.body.total).toBe(2);
  });

  it('numera le PDA e calcola i campi di sistema', async () => {
    const a = await as('pda_rep1').post('/records/SalesOrders', { data: { subject: 'Hotel - FV', account_id: ids.account } });
    expect(a.status).toBe(201);
    const year = new Date().getFullYear();
    expect(a.body.data.order_number).toBe(`${year}-00001`);
    expect(a.body.label).toBe(`${year}-00001 Hotel - FV`);
    expect(a.body.data).toMatchObject({ status: 'Bozza', subtotal: 0, vat_total: 0, grand_total: 0 });
    expect(a.body.data.order_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    ids.order = a.body.id;
    const b = await as('pda_rep2').post('/records/SalesOrders', { data: { subject: 'Altra', account_id: ids.account } });
    expect(b.body.data.order_number).toBe(`${year}-00002`);
    ids.order2 = b.body.id;

    const forced = await as('pda_rep1').patch(`/records/SalesOrders/${ids.order}`, { data: { order_number: 'X', grand_total: 1 } });
    expect(forced.status).toBe(400);
    expect(Object.keys(forced.body.errors).sort()).toEqual(['grand_total', 'order_number']);
  });

  it('salva le righe con prezzi di listino, sconti e IVA e aggiorna i totali', async () => {
    const put = await as('pda_rep1').put(`/records/SalesOrders/${ids.order}/lines`, {
      lines: [
        { productId: ids.pv, quantity: 1, discount: 5 },
        { productId: ids.opt, quantity: 6, unitPrice: 50, discount: 5, vatRate: 22, description: 'Ottimizzatori SolarEdge' },
        { description: 'Zavorre', quantity: 7, unitPrice: 120, discount: 5, vatRate: 0 },
      ],
    });
    expect(put.status).toBe(200);
    expect(put.body.lines.map((l: any) => [l.description, l.unitPrice, l.vatRate, l.net, l.vat])).toEqual([
      ['Fotovoltaico 7 kWp', 12105, 22, 11499.75, 2529.95],
      ['Ottimizzatori SolarEdge', 50, 22, 285, 62.7],
      ['Zavorre', 120, 0, 798, 0],
    ]);
    expect(put.body.lines[0].productLabel).toBe('Fotovoltaico 7 kWp');
    const rec = await as('pda_rep1').get(`/records/SalesOrders/${ids.order}`);
    expect(rec.body.data).toMatchObject({ subtotal: 12582.75, vat_total: 2592.65, grand_total: 15175.4 });

    // arrotondamento a mano: il totale si ricalcola
    const adj = await as('pda_rep1').patch(`/records/SalesOrders/${ids.order}`, { data: { adjustment: -175.4 } });
    expect(adj.body.data.grand_total).toBe(15000);
    const hist = await as('pda_rep1').get(`/records/SalesOrders/${ids.order}/history`);
    expect(hist.body[0].changes.grand_total).toEqual([15175.4, 15000]);

    // sostituendo le righe i totali seguono, l'arrotondamento resta
    const one = await as('pda_rep1').put(`/records/SalesOrders/${ids.order}/lines`, {
      lines: [{ description: 'Sopralluogo', quantity: 1, unitPrice: 200, vatRate: 22 }],
    });
    expect(one.body.totals).toEqual({ net: 200, vat: 44, total: 244 });
    const after = await as('pda_rep1').get(`/records/SalesOrders/${ids.order}`);
    expect(after.body.data).toMatchObject({ subtotal: 200, vat_total: 44, grand_total: 68.6 });
    expect((await as('pda_rep1').get(`/records/SalesOrders/${ids.order}/lines`)).body).toHaveLength(1);
  });

  it('valida le righe', async () => {
    const other = await as('other').post('/records/Products', { data: { name: 'Altrui', unit_price: 1 } });
    const bad = await as('pda_rep1').put(`/records/SalesOrders/${ids.order}/lines`, {
      lines: [
        { quantity: 1, unitPrice: 10 },
        { description: 'Senza prezzo', quantity: 1 },
        { productId: other.body.id, quantity: 1 },
        { description: 'x', quantity: 0, unitPrice: 1 },
      ],
    });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.errors).sort()).toEqual(
      expect.arrayContaining(['lines.3.quantity']),
    );
    const bad2 = await as('pda_rep1').put(`/records/SalesOrders/${ids.order}/lines`, {
      lines: [{ quantity: 1, unitPrice: 10 }, { description: 'Senza prezzo', quantity: 1 }, { productId: other.body.id, quantity: 1 }],
    });
    expect(bad2.body.errors).toEqual({
      'lines.0.description': 'descrizione obbligatoria',
      'lines.1.unitPrice': 'prezzo obbligatorio',
      'lines.2.productId': 'prodotto inesistente',
    });
    // le righe precedenti non sono state toccate
    expect((await as('pda_rep1').get(`/records/SalesOrders/${ids.order}/lines`)).body).toHaveLength(1);
    expect((await as('pda_rep1').put(`/records/Accounts/${ids.account}/lines`, { lines: [] })).status).toBe(404);
  });

  it('rispetta la visibilità delle PDA anche sulle righe', async () => {
    expect((await as('pda_rep2').get(`/records/SalesOrders/${ids.order}/lines`)).status).toBe(403);
    expect((await as('pda_rep2').put(`/records/SalesOrders/${ids.order}/lines`, { lines: [] })).status).toBe(403);
    expect((await as('pdaAdmin').get(`/records/SalesOrders/${ids.order}/lines`)).status).toBe(200);
    expect((await as('admin').get(`/records/SalesOrders/${ids.order}/lines`)).status).toBe(404);
    // le PDA non si eliminano con il profilo vendite
    expect((await as('pda_rep1').del(`/records/SalesOrders/${ids.order}`)).status).toBe(403);
  });

  it('valida percentuali e annullamento della PDA', async () => {
    const pct = await as('pda_rep1').patch(`/records/SalesOrders/${ids.order}`, {
      data: { down_payment_pct: 30, start_works_pct: 40, balance_pct: 40 },
    });
    expect(pct.status).toBe(400);
    expect(pct.body.errors.balance_pct).toBeDefined();
    const ok = await as('pda_rep1').patch(`/records/SalesOrders/${ids.order}`, {
      data: { down_payment_pct: 30, start_works_pct: 40, balance_pct: 30, financing_approval: 'In attesa', pod: 'IT001E12345678' },
    });
    expect(ok.status).toBe(200);
    const cancel = await as('pda_rep1').patch(`/records/SalesOrders/${ids.order}`, { data: { status: 'Annullata' } });
    expect(cancel.body.errors.cancel_date).toBeDefined();
    const st = await as('pda_rep1').patch(`/records/SalesOrders/${ids.order}`, { data: { status: 'In approvazione finanziaria' } });
    expect(st.body.data.status).toBe('In approvazione finanziaria');
  });

  it('i totali delle PDA si usano nei rapporti', async () => {
    const r = await as('pdaAdmin').post('/reports/run', {
      module: 'SalesOrders',
      config: { columns: ['order_number', 'grand_total'], groupBy: { field: 'status' }, totals: [{ field: 'grand_total', fn: 'sum' }] },
    });
    expect(r.body.totals).toEqual({ count: 2, 'sum:grand_total': 68.6 });
  });
});

describe('lead e conversione', () => {
  const ids: Record<string, string> = {};

  it('numera i lead e propone lo stato iniziale', async () => {
    const a = await as('rep1').post('/records/Leads', {
      data: {
        first_name: 'Mario',
        last_name: 'Verdi',
        company: 'Hotel Sole',
        customer_type: 'B2B',
        email: 'info@hotelsole.test',
        phone: '0541000000',
        lead_source: 'Referenza',
        product_interest: ['Fotovoltaico', 'Accumulo'],
        budget: 25000,
        vat_number: '01234567890',
        lead_city: 'Rimini',
        appointment_notes: 'Tetto piano 400 mq',
      },
    });
    expect(a.status).toBe(201);
    expect(a.body.data.lead_number).toMatch(/^LEA-\d{4}-00001$/);
    expect(a.body.data.lead_status).toBe('Nuovo');
    ids.lead = a.body.id;
    const b = await as('rep1').post('/records/Leads', { data: { last_name: 'Neri' } });
    expect(b.body.data.lead_number).toMatch(/^LEA-\d{4}-00002$/);
    ids.privateLead = b.body.id;
    const forced = await as('rep1').patch(`/records/Leads/${ids.lead}`, { data: { lead_number: 'X', converted_at: '2026-01-01T00:00:00Z' } });
    expect(forced.status).toBe(400);
    const act = await as('rep1').post('/records/Activities', {
      data: { subject: 'Richiamare', activity_type: 'Chiamata', start: '2027-01-10T09:00:00Z', lead_id: ids.lead },
    });
    expect(act.status).toBe(201);
    ids.activity = act.body.id;
  });

  it('converte il lead in azienda, contatto e opportunità', async () => {
    expect((await as('rep2').post(`/leads/${ids.lead}/convert`, {})).status).toBe(403);
    const r = await as('rep1').post(`/leads/${ids.lead}/convert`, { opportunity: { closeDate: '2027-03-31' } });
    expect(r.status).toBe(201);
    const { accountId, contactId, opportunityId } = r.body;

    const acc = await as('rep1').get(`/records/Accounts/${accountId}`);
    expect(acc.body.data).toMatchObject({
      name: 'Hotel Sole', vat_number: '01234567890', billing_city: 'Rimini', account_type: 'Prospect', email: 'info@hotelsole.test',
    });
    const con = await as('rep1').get(`/records/Contacts/${contactId}`);
    expect(con.body.label).toBe('Mario Verdi');
    expect(acc.body.data.customer_type).toBe('B2B');
    expect(con.body.data.account_id).toBe(accountId);
    const opp = await as('rep1').get(`/records/Opportunities/${opportunityId}`);
    expect(opp.body.data).toMatchObject({
      name: 'Hotel Sole - Fotovoltaico + Accumulo', account_id: accountId, contact_id: contactId, amount: 25000,
      close_date: '2027-03-31', sales_stage: 'Qualificazione', lead_source: 'Passaparola', description: 'Tetto piano 400 mq',
    });

    const lead = await as('rep1').get(`/records/Leads/${ids.lead}`);
    expect(lead.body.data).toMatchObject({
      lead_status: 'Convertito', converted_account_id: accountId, converted_contact_id: contactId, converted_opportunity_id: opportunityId,
    });
    expect(lead.body.data.converted_at).toBeTruthy();
    const act = await as('rep1').get(`/records/Activities/${ids.activity}`);
    expect(act.body.data).toMatchObject({ lead_id: ids.lead, account_id: accountId, contact_id: contactId, opportunity_id: opportunityId });

    // l'azienda mostra il lead di provenienza tra i collegati
    const rel = await as('rep1').get(`/records/Accounts/${accountId}/related`);
    expect(rel.body.find((x: any) => x.module === 'Leads').total).toBe(1);

    const again = await as('rep1').post(`/leads/${ids.lead}/convert`, {});
    expect(again.status).toBe(400);
    ids.account = accountId;
  });

  it('cliente privato senza opportunità o collegato a un\'azienda esistente', async () => {
    const r = await as('rep1').post(`/leads/${ids.privateLead}/convert`, { createOpportunity: false });
    expect(r.status).toBe(201);
    expect(r.body.opportunityId).toBeNull();
    expect((await as('rep1').get(`/records/Accounts/${r.body.accountId}`)).body.label).toBe('Neri');

    const lead = (await as('rep1').post('/records/Leads', { data: { last_name: 'Gialli', company: 'Hotel Sole' } })).body.id;
    const linked = await as('rep1').post(`/leads/${lead}/convert`, { accountId: ids.account, createOpportunity: false });
    expect(linked.status).toBe(201);
    expect(linked.body.accountId).toBe(ids.account);
    const contacts = await as('rep1').get(`/records/Accounts/${ids.account}/related`);
    expect(contacts.body.find((x: any) => x.module === 'Contacts').total).toBe(2);

    // azienda di un altro tenant o inesistente
    const bad = await as('rep1').post(`/leads/${lead}/convert`, { accountId: '00000000-0000-0000-0000-000000000000' });
    expect([400, 404]).toContain(bad.status);
  });
});

describe('viste salvate delle liste', () => {
  let v: Awaited<ReturnType<typeof provisionTenant>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    v = await provisionTenant(pool, {
      slug: 'viste',
      name: 'Viste',
      admin: { email: 'admin@viste.test', password: PASSWORD, firstName: 'Ada', lastName: 'Viste' },
    });
    tokens.vAdmin = await login('viste', 'admin@viste.test');
    for (const u of ['rep1', 'rep2']) {
      await as('vAdmin').post('/admin/users', {
        email: `${u}@viste.test`, password: PASSWORD, firstName: u, lastName: 'Viste', roleId: v.roles.salesRep,
      });
      tokens[`v_${u}`] = await login('viste', `${u}@viste.test`);
    }
    const mk = (who: string, data: object) => as(who).post('/records/Leads', { data });
    await mk('v_rep1', { last_name: 'Alfa', lead_status: 'Nuovo', budget: 5000 });
    await mk('v_rep1', { last_name: 'Beta', lead_status: 'Da contattare', budget: 20000 });
    await mk('v_rep1', { last_name: 'Gamma', lead_status: 'Da contattare', budget: 1000 });
    await mk('vAdmin', { last_name: 'Delta', lead_status: 'Da contattare', budget: 9000 });
  });

  it('esegue una definizione con filtri, ordinamento, ricerca e assegnatario', async () => {
    const config = {
      columns: ['last_name', 'lead_status', 'budget', 'ownerId'],
      filters: [{ field: 'lead_status', op: 'eq', value: 'Da contattare' }],
      sort: { field: 'budget', dir: 'desc' },
    };
    const all = await as('vAdmin').post('/list-views/query', { module: 'Leads', config });
    expect(all.status).toBe(201);
    expect(all.body.items.map((x: any) => x.data.last_name)).toEqual(['Beta', 'Delta', 'Gamma']);
    expect(all.body.columns.map((c: any) => c.key)).toEqual(config.columns);

    const mine = await as('vAdmin').post('/list-views/query', { module: 'Leads', config, owner: 'mine' });
    expect(mine.body.items.map((x: any) => x.data.last_name)).toEqual(['Delta']);
    const others = await as('vAdmin').post('/list-views/query', { module: 'Leads', config, owner: 'others', sort: { field: 'last_name', dir: 'asc' } });
    expect(others.body.items.map((x: any) => x.data.last_name)).toEqual(['Beta', 'Gamma']);
    const search = await as('vAdmin').post('/list-views/query', { module: 'Leads', config, q: 'gam' });
    expect(search.body.total).toBe(1);

    // il commerciale vede solo i propri record anche attraverso la vista
    const rep2 = await as('v_rep2').post('/list-views/query', { module: 'Leads', config });
    expect(rep2.body.total).toBe(0);
  });

  it('salva viste personali e pubbliche e ne controlla i permessi', async () => {
    const body = {
      name: 'Da contattare',
      module: 'Leads',
      shared: true,
      config: { columns: ['last_name', 'budget'], filters: [{ field: 'lead_status', op: 'eq', value: 'Da contattare' }] },
    };
    const pub = await as('v_rep1').post('/list-views', body);
    expect(pub.status).toBe(201);
    ids.pub = pub.body.id;
    const priv = await as('v_rep1').post('/list-views', { ...body, name: 'Le mie', shared: false });
    ids.priv = priv.body.id;

    const seenBy2 = await as('v_rep2').get('/list-views?module=Leads');
    expect(seenBy2.body.map((x: any) => x.name)).toEqual(['Da contattare']);
    expect(seenBy2.body[0].canEdit).toBe(false);
    expect((await as('v_rep2').get(`/list-views/${ids.priv}`)).status).toBe(404);
    expect((await as('v_rep2').patch(`/list-views/${ids.pub}`, body)).status).toBe(403);
    expect((await as('v_rep2').del(`/list-views/${ids.pub}`)).status).toBe(403);

    const run = await as('vAdmin').post('/list-views/query', { module: 'Leads', viewId: ids.pub });
    expect(run.body.total).toBe(3);
    expect((await as('vAdmin').post('/list-views/query', { module: 'Accounts', viewId: ids.pub })).status).toBe(400);

    const bad = await as('v_rep1').post('/list-views', { ...body, config: { columns: ['nope'], filters: [] } });
    expect(bad.status).toBe(400);
    expect((await as('other').get(`/list-views/${ids.pub}`)).status).toBe(404);

    expect((await as('vAdmin').patch(`/list-views/${ids.pub}`, { ...body, name: 'Rinominata' })).body.name).toBe('Rinominata');
    expect((await as('v_rep1').del(`/list-views/${ids.priv}`)).status).toBe(200);
  });
});

describe('cliente unico B2B/B2C', () => {
  it('gestisce clienti privati (B2C) e la gerarchia dei clienti', async () => {
    const parent = await as('rep1').post('/records/Accounts', { data: { name: 'Gruppo Alberghi S.p.A.' } });
    expect(parent.body.data.customer_type).toBe('B2B');
    const child = await as('rep1').post('/records/Accounts', {
      data: { name: 'Hotel Mare', parent_account_id: parent.body.id, sdi_code: 'ABC1234', legal_rep_last_name: 'Neri' },
    });
    expect(child.status).toBe(201);
    const privato = await as('rep1').post('/records/Accounts', {
      data: { name: 'Rossi Mario', customer_type: 'B2C', first_name: 'Mario', last_name: 'Rossi', sepa_status: 'Attivo', sepa_iban: 'IT60X0542811101000000123456' },
    });
    expect(privato.status).toBe(201);
    expect((await as('rep1').post('/records/Accounts', { data: { name: 'X', sdi_code: 'TROPPOLUNGO' } })).status).toBe(400);
    const rel = await as('rep1').get(`/records/Accounts/${parent.body.id}/related`);
    expect(rel.body.find((r: any) => r.field === 'parent_account_id').total).toBe(1);
  });
});
