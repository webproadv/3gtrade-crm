import { FieldDef, FieldValidationError, computeLabel, customFieldName, normalizeValue, validateRecordData } from './field-types';

const f = (name: string, type: FieldDef['type'], extra: Partial<FieldDef> = {}): FieldDef => ({
  id: name,
  module: 'Test',
  name,
  label: name,
  type,
  block: 'b',
  required: false,
  isCustom: false,
  inList: false,
  sortOrder: 0,
  options: {},
  ...extra,
});

describe('normalizeValue', () => {
  it.each([
    [f('a', 'email'), ' Mario@Example.COM ', 'mario@example.com'],
    [f('a', 'number'), '12,5', 12.5],
    [f('a', 'currency'), 10.555, 10.56],
    [f('a', 'integer'), '42', 42],
    [f('a', 'boolean'), 'true', true],
    [f('a', 'url'), 'example.com', 'https://example.com'],
    [f('a', 'date'), '2026-11-25', '2026-11-25'],
    [f('a', 'picklist', { options: { values: ['A', 'B'] } }), 'B', 'B'],
    [f('a', 'multipicklist', { options: { values: ['A', 'B'] } }), ['A', 'A', 'B'], ['A', 'B']],
  ])('normalizza %#', (field, input, expected) => {
    expect(normalizeValue(field, input)).toEqual([expected, undefined]);
  });

  it.each([
    [f('a', 'email'), 'non-email'],
    [f('a', 'integer'), '1.5'],
    [f('a', 'percent'), 120],
    [f('a', 'date'), '25/11/2026'],
    [f('a', 'picklist', { options: { values: ['A'] } }), 'Z'],
    [f('a', 'relation'), 'not-a-uuid'],
    [f('a', 'text', { options: { maxLength: 3 } }), 'abcd'],
  ])('rifiuta valori non validi %#', (field, input) => {
    expect(normalizeValue(field, input)[1]).toBeDefined();
  });

  it('tratta stringa vuota come null', () => {
    expect(normalizeValue(f('a', 'number'), '')).toEqual([null, undefined]);
  });
});

describe('validateRecordData', () => {
  const fields = [f('name', 'text', { required: true }), f('amount', 'currency'), f('secret', 'text')];
  const editable = new Set(['name', 'amount']);

  it('richiede i campi obbligatori in creazione', () => {
    expect(() => validateRecordData(fields, { amount: 1 }, { isCreate: true, editable })).toThrow(FieldValidationError);
  });

  it('non richiede gli obbligatori in modifica parziale', () => {
    expect(validateRecordData(fields, { amount: '3' }, { isCreate: false, editable })).toEqual({ amount: 3 });
  });

  it('impedisce di svuotare un obbligatorio', () => {
    expect(() => validateRecordData(fields, { name: '' }, { isCreate: false, editable })).toThrow(FieldValidationError);
  });

  it('rifiuta campi sconosciuti o non modificabili', () => {
    try {
      validateRecordData(fields, { name: 'x', foo: 1, secret: 'y' }, { isCreate: true, editable });
      fail('doveva fallire');
    } catch (e) {
      expect((e as FieldValidationError).errors).toEqual({ foo: 'campo inesistente', secret: 'campo non modificabile' });
    }
  });
});

describe('utility', () => {
  it('genera nomi tecnici per i campi personalizzati', () => {
    expect(customFieldName('Codice SDI / Città')).toBe('cf_codice_sdi_citta');
    expect(customFieldName('!!!')).toBe('cf_campo');
  });

  it('calcola le etichette', () => {
    expect(computeLabel(['first_name', 'last_name'], { last_name: 'Rossi' })).toBe('Rossi');
    expect(computeLabel(['first_name', 'last_name'], { first_name: 'Mario', last_name: 'Rossi' })).toBe('Mario Rossi');
  });
});
