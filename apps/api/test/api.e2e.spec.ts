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
import { ensureStandardModules, provisionTenant } from '../src/tenants/provisioning';

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
    expect(byModule).toEqual({ 'Contacts.account_id': 1, 'Opportunities.account_id': 1, 'Activities.account_id': 0 });

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
    await client.query('COMMIT');
    client.release();
    expect((await as('other').get('/records/Activities')).status).toBe(404);

    const added = await ensureStandardModules(pool);
    expect(added).toEqual(['other: campo Accounts.pec', 'other: modulo Activities']);
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
