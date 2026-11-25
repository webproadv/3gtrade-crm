import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { AuthInfo } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { Tx } from '../db/database.service';
import { FIELD_TYPES } from '../metadata/field-types';
import { SecurityContext } from '../security/security-context';
import { ScopeService } from '../security/scope.service';
import { AdminService, assertAdmin } from './admin.service';

const uuid = z.string().uuid();
const perm = z.object({ view: z.boolean(), create: z.boolean(), edit: z.boolean(), delete: z.boolean() });
const options = z
  .object({
    values: z.array(z.string().min(1)).optional(),
    module: z.string().optional(),
    maxLength: z.number().int().positive().optional(),
  })
  .optional();

const S = {
  createUser: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'minimo 8 caratteri'),
    firstName: z.string().default(''),
    lastName: z.string().min(1),
    roleId: uuid,
    isAdmin: z.boolean().optional(),
  }),
  updateUser: z.object({
    email: z.string().email().optional(),
    password: z.string().min(8, 'minimo 8 caratteri').optional(),
    firstName: z.string().optional(),
    lastName: z.string().min(1).optional(),
    roleId: uuid.optional(),
    isAdmin: z.boolean().optional(),
    active: z.boolean().optional(),
  }),
  createRole: z.object({ name: z.string().min(1), parentId: uuid, profileIds: z.array(uuid).default([]) }),
  updateRole: z.object({ name: z.string().min(1).optional(), profileIds: z.array(uuid).optional() }),
  createProfile: z.object({ name: z.string().min(1), description: z.string().optional(), copyFrom: uuid.optional() }),
  permissions: z.object({
    modules: z.record(z.string(), perm).optional(),
    fields: z.record(uuid, z.object({ visible: z.boolean(), editable: z.boolean() })).optional(),
  }),
  createModule: z.object({
    name: z.string(),
    label: z.string().min(1),
    labelSingular: z.string().min(1),
    icon: z.string().optional(),
  }),
  updateModule: z.object({
    label: z.string().min(1).optional(),
    labelSingular: z.string().min(1).optional(),
    sharing: z.enum(['private', 'public_read', 'public_readwrite']).optional(),
    labelFields: z.array(z.string()).optional(),
  }),
  createField: z.object({
    label: z.string().min(1).max(80),
    type: z.enum(FIELD_TYPES),
    block: z.string().optional(),
    required: z.boolean().optional(),
    inList: z.boolean().optional(),
    options,
  }),
  updateField: z.object({
    label: z.string().min(1).max(80).optional(),
    block: z.string().min(1).optional(),
    required: z.boolean().optional(),
    inList: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    options,
  }),
};

/** Amministrazione: utenti, ruoli, profili, moduli e campi personalizzati. */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly scope: ScopeService,
    private readonly admin: AdminService,
  ) {}

  private run<T>(auth: AuthInfo, fn: (tx: Tx, sec: SecurityContext) => Promise<T>) {
    return this.scope.run(auth, (tx, sec) => {
      assertAdmin(sec);
      return fn(tx, sec);
    });
  }

  @Get('users')
  users(@Auth() a: AuthInfo) {
    return this.run(a, (tx) => this.admin.listUsers(tx));
  }

  @Post('users')
  createUser(@Auth() a: AuthInfo, @Body() body: unknown) {
    const b = parseBody(S.createUser, body);
    return this.run(a, (tx, sec) => this.admin.createUser(tx, sec, b));
  }

  @Patch('users/:id')
  updateUser(@Auth() a: AuthInfo, @Param('id') id: string, @Body() body: unknown) {
    const b = parseBody(S.updateUser, body);
    return this.run(a, (tx, sec) => this.admin.updateUser(tx, sec, id, b));
  }

  @Get('roles')
  roles(@Auth() a: AuthInfo) {
    return this.run(a, (tx) => this.admin.listRoles(tx));
  }

  @Post('roles')
  createRole(@Auth() a: AuthInfo, @Body() body: unknown) {
    const b = parseBody(S.createRole, body);
    return this.run(a, (tx, sec) => this.admin.createRole(tx, sec, b));
  }

  @Patch('roles/:id')
  updateRole(@Auth() a: AuthInfo, @Param('id') id: string, @Body() body: unknown) {
    const b = parseBody(S.updateRole, body);
    return this.run(a, (tx, sec) => this.admin.updateRole(tx, sec, id, b));
  }

  @Delete('roles/:id')
  deleteRole(@Auth() a: AuthInfo, @Param('id') id: string) {
    return this.run(a, (tx) => this.admin.deleteRole(tx, id));
  }

  @Get('profiles')
  profiles(@Auth() a: AuthInfo) {
    return this.run(a, (tx) => this.admin.listProfiles(tx));
  }

  @Post('profiles')
  createProfile(@Auth() a: AuthInfo, @Body() body: unknown) {
    const b = parseBody(S.createProfile, body);
    return this.run(a, (tx, sec) => this.admin.createProfile(tx, sec, b));
  }

  @Put('profiles/:id/permissions')
  setPermissions(@Auth() a: AuthInfo, @Param('id') id: string, @Body() body: unknown) {
    const b = parseBody(S.permissions, body);
    return this.run(a, (tx, sec) => this.admin.setProfilePermissions(tx, sec, id, b));
  }

  @Get('modules')
  modules(@Auth() a: AuthInfo) {
    return this.run(a, (tx) => this.admin.listModules(tx));
  }

  @Post('modules')
  createModule(@Auth() a: AuthInfo, @Body() body: unknown) {
    const b = parseBody(S.createModule, body);
    return this.run(a, (tx, sec) => this.admin.createModule(tx, sec, b));
  }

  @Patch('modules/:name')
  updateModule(@Auth() a: AuthInfo, @Param('name') name: string, @Body() body: unknown) {
    const b = parseBody(S.updateModule, body);
    return this.run(a, (tx) => this.admin.updateModule(tx, name, b));
  }

  @Post('modules/:name/fields')
  createField(@Auth() a: AuthInfo, @Param('name') name: string, @Body() body: unknown) {
    const b = parseBody(S.createField, body);
    return this.run(a, (tx, sec) => this.admin.createField(tx, sec, name, b));
  }

  @Patch('fields/:id')
  updateField(@Auth() a: AuthInfo, @Param('id') id: string, @Body() body: unknown) {
    const b = parseBody(S.updateField, body);
    return this.run(a, (tx) => this.admin.updateField(tx, id, b));
  }

  @Delete('fields/:id')
  deleteField(@Auth() a: AuthInfo, @Param('id') id: string) {
    return this.run(a, (tx) => this.admin.deleteField(tx, id));
  }
}

/** Elenco utenti attivi, per scegliere l'assegnatario di un record. */
@Controller('users')
export class UsersController {
  constructor(private readonly scope: ScopeService) {}

  @Get()
  list(@Auth() a: AuthInfo) {
    return this.scope.run(a, async (tx) => {
      const r = await tx.query(
        `SELECT id, first_name, last_name, email FROM users WHERE active ORDER BY last_name, first_name`,
      );
      return r.rows.map((u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}`.trim(), email: u.email }));
    });
  }
}
