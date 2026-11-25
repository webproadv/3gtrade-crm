export type ModuleAction = 'view' | 'create' | 'edit' | 'delete';
export type Sharing = 'private' | 'public_read' | 'public_readwrite';

export interface ModulePermission {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

export interface SecurityContext {
  tenantId: string;
  userId: string;
  isAdmin: boolean;
  roleId: string;
  rolePath: string;
  modules: Record<string, ModulePermission>;
  /** id dei campi nascosti all'utente */
  hiddenFields: Set<string>;
  /** id dei campi in sola lettura */
  readonlyFields: Set<string>;
  /** l'utente stesso + gli utenti dei ruoli subordinati */
  visibleOwnerIds: string[];
}

const NONE: ModulePermission = { view: false, create: false, edit: false, delete: false };

export interface ModulePermRow {
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

/** Unione (OR) dei permessi di tutti i profili del ruolo. */
export function mergeModulePermissions(rows: ModulePermRow[]): Record<string, ModulePermission> {
  const out: Record<string, ModulePermission> = {};
  for (const r of rows) {
    const cur = out[r.module] ?? { ...NONE };
    out[r.module] = {
      view: cur.view || r.can_view,
      create: cur.create || r.can_create,
      edit: cur.edit || r.can_edit,
      delete: cur.delete || r.can_delete,
    };
  }
  // senza "view" le altre azioni non hanno senso
  for (const p of Object.values(out)) {
    if (!p.view) p.create = p.edit = p.delete = false;
  }
  return out;
}

export interface FieldPermRow {
  profile_id: string;
  field_id: string;
  visible: boolean;
  editable: boolean;
}

/**
 * Un campo è nascosto solo se TUTTI i profili dell'utente lo nascondono;
 * in sola lettura solo se nessun profilo lo rende modificabile.
 * Un profilo senza riga per il campo lo considera visibile e modificabile.
 */
export function mergeFieldPermissions(profileIds: string[], rows: FieldPermRow[]) {
  const byField = new Map<string, Map<string, FieldPermRow>>();
  for (const r of rows) {
    if (!byField.has(r.field_id)) byField.set(r.field_id, new Map());
    byField.get(r.field_id)!.set(r.profile_id, r);
  }
  const hidden = new Set<string>();
  const readonly = new Set<string>();
  for (const [fieldId, perProfile] of byField) {
    const anyVisible = profileIds.some((p) => perProfile.get(p)?.visible ?? true);
    const anyEditable = profileIds.some((p) => {
      const r = perProfile.get(p);
      return r ? r.visible && r.editable : true;
    });
    if (!anyVisible || profileIds.length === 0) hidden.add(fieldId);
    if (!anyEditable || profileIds.length === 0) readonly.add(fieldId);
  }
  return { hidden, readonly };
}

export function can(ctx: SecurityContext, module: string, action: ModuleAction): boolean {
  if (ctx.isAdmin) return true;
  return ctx.modules[module]?.[action] ?? false;
}

/** Accesso al singolo record secondo condivisione di modulo e gerarchia dei ruoli. */
export function canAccessRecord(
  ctx: SecurityContext,
  sharing: Sharing,
  ownerId: string,
  mode: 'read' | 'write',
): boolean {
  if (ctx.isAdmin) return true;
  if (sharing === 'public_readwrite') return true;
  if (sharing === 'public_read' && mode === 'read') return true;
  return ctx.visibleOwnerIds.includes(ownerId);
}
