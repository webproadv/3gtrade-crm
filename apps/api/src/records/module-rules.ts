/**
 * Regole di validazione che coinvolgono più campi dello stesso record.
 * Ricevono i dati completi (dopo la fusione con quelli esistenti) e
 * restituiscono gli errori per campo.
 */
export type ModuleRule = (data: Record<string, unknown>) => Record<string, string>;

export const MODULE_RULES: Record<string, ModuleRule[]> = {
  Activities: [
    (d): Record<string, string> =>
      d.start && d.end && Date.parse(String(d.end)) < Date.parse(String(d.start))
        ? { end: "la fine deve essere successiva all'inizio" }
        : {},
  ],
};

export function checkModuleRules(module: string, data: Record<string, unknown>): Record<string, string> {
  return Object.assign({}, ...(MODULE_RULES[module] ?? []).map((rule) => rule(data)));
}
