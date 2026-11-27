import { LINE_DOCUMENTS } from '../records/line-documents';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Tx } from '../db/database.service';
import { SecurityContext, Sharing, can } from '../security/security-context';
import { FieldDef } from './field-types';

export interface ModuleDef {
  name: string;
  label: string;
  labelSingular: string;
  icon: string | null;
  isCustom: boolean;
  sortOrder: number;
  labelFields: string[];
  sharing: Sharing;
}

const mapModule = (r: any): ModuleDef => ({
  name: r.name,
  label: r.label,
  labelSingular: r.label_singular,
  icon: r.icon,
  isCustom: r.is_custom,
  sortOrder: r.sort_order,
  labelFields: r.label_fields,
  sharing: r.sharing,
});

const mapField = (r: any): FieldDef => ({
  id: r.id,
  module: r.module,
  name: r.name,
  label: r.label,
  type: r.type,
  block: r.block,
  required: r.required,
  isCustom: r.is_custom,
  inList: r.in_list,
  sortOrder: r.sort_order,
  options: r.options ?? {},
});

@Injectable()
export class MetadataService {
  async listModules(tx: Tx): Promise<ModuleDef[]> {
    const r = await tx.query(`SELECT * FROM modules ORDER BY sort_order, label`);
    return r.rows.map(mapModule);
  }

  async getModule(tx: Tx, name: string): Promise<ModuleDef> {
    const r = await tx.query(`SELECT * FROM modules WHERE name = $1`, [name]);
    if (!r.rows[0]) throw new NotFoundException(`Modulo ${name} inesistente`);
    return mapModule(r.rows[0]);
  }

  async listFields(tx: Tx, module?: string): Promise<FieldDef[]> {
    const r = module
      ? await tx.query(`SELECT * FROM fields WHERE module = $1 ORDER BY sort_order, label`, [module])
      : await tx.query(`SELECT * FROM fields ORDER BY module, sort_order, label`);
    return r.rows.map(mapField);
  }

  /** Campi visibili all'utente, con flag "editable". */
  visibleFields(sec: SecurityContext, fields: FieldDef[]) {
    return fields
      .filter((f) => !sec.hiddenFields.has(f.id))
      .map((f) => ({ ...f, editable: !sec.readonlyFields.has(f.id) && !f.options.computed }));
  }

  /** Moduli che l'utente può vedere, con campi e permessi: alimenta l'interfaccia. */
  async describeForUser(tx: Tx, sec: SecurityContext) {
    const [modules, fields] = await Promise.all([this.listModules(tx), this.listFields(tx)]);
    return modules
      .filter((m) => can(sec, m.name, 'view'))
      .map((m) => ({
        ...m,
        hasLines: !!LINE_DOCUMENTS[m.name],
        lineTotals: LINE_DOCUMENTS[m.name]?.totals,
        permissions: {
          view: true,
          create: can(sec, m.name, 'create'),
          edit: can(sec, m.name, 'edit'),
          delete: can(sec, m.name, 'delete'),
        },
        fields: this.visibleFields(
          sec,
          fields.filter((f) => f.module === m.name),
        ),
      }));
  }
}
