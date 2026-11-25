import type { Field } from '../types';

/** Raggruppa i campi per blocco mantenendo l'ordine. */
export function groupByBlock(fields: Field[]): [string, Field[]][] {
  const map = new Map<string, Field[]>();
  for (const f of [...fields].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!map.has(f.block)) map.set(f.block, []);
    map.get(f.block)!.push(f);
  }
  return [...map.entries()];
}
