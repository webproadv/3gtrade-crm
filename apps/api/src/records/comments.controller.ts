import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthInfo } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { enqueueEvent } from '../events/outbox';
import { isUuid } from '../metadata/field-types';
import { ScopeService } from '../security/scope.service';
import { RecordsService } from './records.service';

const CommentBody = z.object({ body: z.string().trim().min(1, 'scrivi un commento').max(5000) });

/**
 * Commenti sui record, come le "Conversazioni" di vtenext: chi può vedere il record
 * può leggerli e scriverne; ognuno può eliminare i propri, l'amministratore tutti.
 */
@Controller('records/:module/:id/comments')
export class CommentsController {
  constructor(
    private readonly scope: ScopeService,
    private readonly records: RecordsService,
  ) {}

  @Get()
  list(@Auth() auth: AuthInfo, @Param('module') module: string, @Param('id') id: string) {
    return this.scope.run(auth, async (tx, sec) => {
      await this.records.get(tx, sec, module, id); // verifica accesso
      const r = await tx.query(
        `SELECT c.id, c.body, c.created_at, c.user_id, trim(u.first_name || ' ' || u.last_name) AS user_name
           FROM record_comments c JOIN users u ON u.id = c.user_id
          WHERE c.record_id = $1 ORDER BY c.created_at, c.id`,
        [id],
      );
      return r.rows.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.created_at,
        userId: c.user_id,
        userName: c.user_name,
        canDelete: sec.isAdmin || c.user_id === sec.userId,
      }));
    });
  }

  @Post()
  create(@Auth() auth: AuthInfo, @Param('module') module: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parseBody(CommentBody, body);
    return this.scope.run(auth, async (tx, sec) => {
      await this.records.get(tx, sec, module, id);
      const r = await tx.query(
        `INSERT INTO record_comments (tenant_id, record_id, user_id, body) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
        [sec.tenantId, id, sec.userId, b.body],
      );
      await enqueueEvent(tx, sec.tenantId, 'comment.created', { module, recordId: id, userId: sec.userId, commentId: r.rows[0].id });
      return { id: r.rows[0].id, body: b.body, createdAt: r.rows[0].created_at, userId: sec.userId, canDelete: true };
    });
  }

  @Delete(':commentId')
  remove(
    @Auth() auth: AuthInfo,
    @Param('module') module: string,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return this.scope.run(auth, async (tx, sec) => {
      await this.records.get(tx, sec, module, id);
      if (!isUuid(commentId)) throw new NotFoundException('Commento inesistente');
      const c = (await tx.query(`SELECT user_id FROM record_comments WHERE id = $1 AND record_id = $2`, [commentId, id])).rows[0];
      if (!c) throw new NotFoundException('Commento inesistente');
      if (!sec.isAdmin && c.user_id !== sec.userId) throw new ForbiddenException('Puoi eliminare solo i tuoi commenti');
      await tx.query(`DELETE FROM record_comments WHERE id = $1`, [commentId]);
      return { ok: true };
    });
  }
}
