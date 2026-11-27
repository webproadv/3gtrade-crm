import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { assertAdmin } from '../admin/admin.service';
import { AuthInfo } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { isUuid } from '../metadata/field-types';
import { RecordsService } from '../records/records.service';
import { ScopeService } from '../security/scope.service';
import { EMAIL_RE, MailerService } from './mailer.service';
import { WorkflowBodySchema } from './workflow-config';
import { WorkflowEngine, errorText } from './workflow-engine';
import { WorkflowsService } from './workflows.service';

/** Definizione dei workflow: solo amministratori. */
@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly scope: ScopeService,
    private readonly workflows: WorkflowsService,
    private readonly engine: WorkflowEngine,
  ) {}

  @Get()
  list(@Auth() auth: AuthInfo, @Query('module') module?: string) {
    return this.scope.run(auth, (tx, sec) => {
      assertAdmin(sec);
      return this.workflows.list(tx, module || undefined);
    });
  }

  @Post()
  create(@Auth() auth: AuthInfo, @Body() body: unknown) {
    const b = parseBody(WorkflowBodySchema, body);
    return this.scope.run(auth, (tx, sec) => {
      assertAdmin(sec);
      return this.workflows.create(tx, sec, b);
    });
  }

  /** Esegue subito i controlli a tempo (di norma girano ogni pochi minuti). */
  @Post('run-scheduled')
  async runScheduled(@Auth() auth: AuthInfo) {
    await this.scope.run(auth, async (_tx, sec) => assertAdmin(sec));
    return { runs: await this.engine.runScheduled() };
  }

  @Get(':id')
  get(@Auth() auth: AuthInfo, @Param('id') id: string) {
    return this.scope.run(auth, (tx, sec) => {
      assertAdmin(sec);
      return this.workflows.get(tx, id);
    });
  }

  @Patch(':id')
  update(@Auth() auth: AuthInfo, @Param('id') id: string, @Body() body: unknown) {
    const b = parseBody(WorkflowBodySchema, body);
    return this.scope.run(auth, (tx, sec) => {
      assertAdmin(sec);
      return this.workflows.update(tx, sec, id, b);
    });
  }

  @Delete(':id')
  remove(@Auth() auth: AuthInfo, @Param('id') id: string) {
    return this.scope.run(auth, (tx, sec) => {
      assertAdmin(sec);
      return this.workflows.remove(tx, id);
    });
  }

  @Get(':id/runs')
  runs(@Auth() auth: AuthInfo, @Param('id') id: string) {
    return this.scope.run(auth, (tx, sec) => {
      assertAdmin(sec);
      return this.workflows.runs(tx, id);
    });
  }
}

const EmailBody = z.object({
  to: z.string().trim().max(320).default(''),
  subject: z.string().trim().max(300).default(''),
  body: z.string().max(20000).default(''),
});

const presentEmail = (e: any) => ({
  id: e.id,
  to: e.to_address,
  subject: e.subject,
  body: e.body,
  toCustomer: e.to_customer,
  status: e.status,
  error: e.error,
  workflowName: e.workflow_name ?? null,
  createdAt: e.created_at,
  sentAt: e.sent_at,
  sentByName: e.sent_by_name ?? null,
});

/**
 * Sulla scheda: pulsanti dei workflow manuali ed email del record.
 * Le email per i clienti partono solo quando l'utente preme Invia.
 */
@Controller('records/:module/:id')
export class RecordWorkflowsController {
  constructor(
    private readonly scope: ScopeService,
    private readonly records: RecordsService,
    private readonly engine: WorkflowEngine,
    private readonly mailer: MailerService,
  ) {}

  @Get('workflows')
  manual(@Auth() auth: AuthInfo, @Param('module') module: string, @Param('id') id: string) {
    return this.scope.run(auth, async (tx, sec) => {
      await this.records.get(tx, sec, module, id);
      const r = await tx.query(
        `SELECT id, name, description, trigger FROM workflows
          WHERE active AND module = $1 AND trigger->>'type' = 'manual' ORDER BY lower(name)`,
        [module],
      );
      return r.rows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        buttonLabel: w.trigger.buttonLabel || w.name,
      }));
    });
  }

  @Post('workflows/:wid/run')
  run(@Auth() auth: AuthInfo, @Param('module') module: string, @Param('id') id: string, @Param('wid') wid: string) {
    if (!isUuid(wid)) throw new NotFoundException('Workflow inesistente');
    return this.scope.run(auth, (tx, sec) => this.engine.runManual(tx, sec, module, id, wid));
  }

  @Get('emails')
  emails(@Auth() auth: AuthInfo, @Param('module') module: string, @Param('id') id: string) {
    return this.scope.run(auth, async (tx, sec) => {
      await this.records.get(tx, sec, module, id);
      const r = await tx.query(
        `SELECT e.*, w.name AS workflow_name, trim(u.first_name || ' ' || u.last_name) AS sent_by_name
           FROM record_emails e
           LEFT JOIN workflows w ON w.id = e.workflow_id
           LEFT JOIN users u ON u.id = e.sent_by
          WHERE e.record_id = $1 AND e.status <> 'discarded' ORDER BY e.created_at DESC`,
        [id],
      );
      return { items: r.rows.map(presentEmail), canSend: this.mailer.configured };
    });
  }

  /** Nuova bozza scritta dall'utente. */
  @Post('emails')
  createEmail(@Auth() auth: AuthInfo, @Param('module') module: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parseBody(EmailBody, body);
    return this.scope.run(auth, async (tx, sec) => {
      await this.records.loadWritable(tx, sec, module, id);
      const r = await tx.query(
        `INSERT INTO record_emails (tenant_id, record_id, to_address, subject, body, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [sec.tenantId, id, b.to, b.subject, b.body, sec.userId],
      );
      return presentEmail(r.rows[0]);
    });
  }

  private async draft(tx: any, sec: any, module: string, id: string, eid: string) {
    await this.records.loadWritable(tx, sec, module, id);
    if (!isUuid(eid)) throw new NotFoundException('Email inesistente');
    const e = (await tx.query(`SELECT * FROM record_emails WHERE id = $1 AND record_id = $2 FOR UPDATE`, [eid, id])).rows[0];
    if (!e) throw new NotFoundException('Email inesistente');
    if (e.status !== 'draft' && e.status !== 'failed') throw new BadRequestException('Email già inviata');
    return e;
  }

  @Patch('emails/:eid')
  updateEmail(
    @Auth() auth: AuthInfo,
    @Param('module') module: string,
    @Param('id') id: string,
    @Param('eid') eid: string,
    @Body() body: unknown,
  ) {
    const b = parseBody(EmailBody, body);
    return this.scope.run(auth, async (tx, sec) => {
      await this.draft(tx, sec, module, id, eid);
      const r = await tx.query(
        `UPDATE record_emails SET to_address = $2, subject = $3, body = $4 WHERE id = $1 RETURNING *`,
        [eid, b.to, b.subject, b.body],
      );
      return presentEmail(r.rows[0]);
    });
  }

  /** Invio deciso dall'utente: l'unico modo in cui un'email parte verso un cliente. */
  @Post('emails/:eid/send')
  send(@Auth() auth: AuthInfo, @Param('module') module: string, @Param('id') id: string, @Param('eid') eid: string) {
    return this.scope.run(auth, async (tx, sec) => {
      const e = await this.draft(tx, sec, module, id, eid);
      if (!EMAIL_RE.test(e.to_address)) throw new BadRequestException({ message: 'Email non valida', errors: { to: 'indirizzo email non valido' } });
      if (!e.subject.trim()) throw new BadRequestException({ message: 'Email non valida', errors: { subject: 'obbligatorio' } });
      try {
        await this.mailer.send(e.to_address, e.subject, e.body);
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        await tx.query(`UPDATE record_emails SET status = 'failed', error = $2 WHERE id = $1`, [eid, errorText(err)]);
        return presentEmail({ ...e, status: 'failed', error: errorText(err) });
      }
      const r = await tx.query(
        `UPDATE record_emails SET status = 'sent', sent_at = now(), sent_by = $2, error = NULL WHERE id = $1 RETURNING *`,
        [eid, sec.userId],
      );
      return presentEmail(r.rows[0]);
    });
  }

  @Post('emails/:eid/discard')
  discard(@Auth() auth: AuthInfo, @Param('module') module: string, @Param('id') id: string, @Param('eid') eid: string) {
    return this.scope.run(auth, async (tx, sec) => {
      await this.draft(tx, sec, module, id, eid);
      await tx.query(`UPDATE record_emails SET status = 'discarded' WHERE id = $1`, [eid]);
      return { ok: true };
    });
  }
}
