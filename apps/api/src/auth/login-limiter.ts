/**
 * Limita i tentativi di accesso falliti per chiave (IP + email) in una finestra
 * temporale. In memoria: sufficiente con una sola istanza dell'applicazione.
 */
export class LoginLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures = 10,
    private readonly windowMs = 15 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  private recent(key: string): number[] {
    const since = this.now() - this.windowMs;
    const list = (this.failures.get(key) ?? []).filter((t) => t > since);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  isBlocked(key: string): boolean {
    return this.recent(key).length >= this.maxFailures;
  }

  fail(key: string) {
    this.failures.set(key, [...this.recent(key), this.now()]);
  }

  reset(key: string) {
    this.failures.delete(key);
  }
}
