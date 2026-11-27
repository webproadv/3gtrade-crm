import { useMemo } from 'react';
import { FilterValue } from '../pages/reports/ReportEditor';
import { columnOptions, opLabel, opsFor } from '../pages/reports/reportOptions';
import type { FilterOp, Module, ViewConfig } from '../types';

type Filter = ViewConfig['filters'][number];

/** Elenco di condizioni "campo, operatore, valore", usato da viste salvate e workflow. */
export function ConditionsEditor({
  mod,
  filters,
  users,
  errors,
  errorPrefix = 'filters',
  addLabel = '+ Aggiungi filtro',
  onChange,
}: {
  mod: Module;
  filters: Filter[];
  users: { id: string; name: string }[];
  errors: Record<string, string>;
  errorPrefix?: string;
  addLabel?: string;
  onChange: (filters: Filter[]) => void;
}) {
  const options = useMemo(() => columnOptions(mod), [mod]);
  const byKey = useMemo(() => new Map(options.map((o) => [o.key, o])), [options]);
  const setFilter = (i: number, f: Partial<Filter>) => onChange(filters.map((x, k) => (k === i ? { ...x, ...f } : x)));

  return (
    <>
      {filters.map((f, i) => {
        const col = byKey.get(f.field);
        return (
          <div className="filter-row" key={i}>
            <select
              value={f.field}
              onChange={(e) => {
                const c = byKey.get(e.target.value)!;
                setFilter(i, { field: c.key, op: opsFor(c.type)[0], value: undefined });
              }}
            >
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            {col && (
              <select value={f.op} onChange={(e) => setFilter(i, { op: e.target.value as FilterOp, value: undefined })}>
                {opsFor(col.type).map((op) => (
                  <option key={op} value={op}>
                    {opLabel(col.type, op)}
                  </option>
                ))}
              </select>
            )}
            {col && f.op !== 'empty' && f.op !== 'notEmpty' && (
              <FilterValue col={col} op={f.op} value={f.value} users={users} onChange={(value) => setFilter(i, { value })} />
            )}
            <button type="button" className="link danger" onClick={() => onChange(filters.filter((_, k) => k !== i))}>
              Togli
            </button>
            {errors[`${errorPrefix}.${i}`] && <span className="field-error">{errors[`${errorPrefix}.${i}`]}</span>}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => {
          const c = options[0];
          if (c) onChange([...filters, { field: c.key, op: opsFor(c.type)[0] }]);
        }}
      >
        {addLabel}
      </button>
    </>
  );
}
