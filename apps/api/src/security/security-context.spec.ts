import { SecurityContext, canAccessRecord, mergeFieldPermissions, mergeModulePermissions } from './security-context';

describe('mergeModulePermissions', () => {
  it('unisce i permessi dei profili in OR', () => {
    const r = mergeModulePermissions([
      { module: 'Accounts', can_view: true, can_create: false, can_edit: true, can_delete: false },
      { module: 'Accounts', can_view: true, can_create: true, can_edit: false, can_delete: false },
    ]);
    expect(r.Accounts).toEqual({ view: true, create: true, edit: true, delete: false });
  });

  it('senza view nessun altro permesso', () => {
    const r = mergeModulePermissions([
      { module: 'Accounts', can_view: false, can_create: true, can_edit: true, can_delete: true },
    ]);
    expect(r.Accounts).toEqual({ view: false, create: false, edit: false, delete: false });
  });
});

describe('mergeFieldPermissions', () => {
  it('nasconde un campo solo se tutti i profili lo nascondono', () => {
    const rows = [{ profile_id: 'p1', field_id: 'f1', visible: false, editable: false }];
    expect(mergeFieldPermissions(['p1'], rows).hidden.has('f1')).toBe(true);
    // p2 non ha righe: il campo è visibile e modificabile
    const both = mergeFieldPermissions(['p1', 'p2'], rows);
    expect(both.hidden.has('f1')).toBe(false);
    expect(both.readonly.has('f1')).toBe(false);
  });

  it('sola lettura se nessun profilo lo rende modificabile', () => {
    const rows = [
      { profile_id: 'p1', field_id: 'f1', visible: true, editable: false },
      { profile_id: 'p2', field_id: 'f1', visible: false, editable: false },
    ];
    const r = mergeFieldPermissions(['p1', 'p2'], rows);
    expect(r.hidden.has('f1')).toBe(false);
    expect(r.readonly.has('f1')).toBe(true);
  });
});

describe('canAccessRecord', () => {
  const ctx = { isAdmin: false, visibleOwnerIds: ['me', 'sub'] } as SecurityContext;

  it('rispetta gerarchia e condivisione', () => {
    expect(canAccessRecord(ctx, 'private', 'sub', 'write')).toBe(true);
    expect(canAccessRecord(ctx, 'private', 'boss', 'read')).toBe(false);
    expect(canAccessRecord(ctx, 'public_read', 'boss', 'read')).toBe(true);
    expect(canAccessRecord(ctx, 'public_read', 'boss', 'write')).toBe(false);
    expect(canAccessRecord(ctx, 'public_readwrite', 'boss', 'write')).toBe(true);
    expect(canAccessRecord({ ...ctx, isAdmin: true }, 'private', 'boss', 'write')).toBe(true);
  });
});
