import { LoginLimiter } from './login-limiter';

describe('LoginLimiter', () => {
  it('blocca dopo troppi errori e sblocca allo scadere della finestra', () => {
    let t = 0;
    const l = new LoginLimiter(3, 1000, () => t);
    for (let i = 0; i < 3; i++) l.fail('k');
    expect(l.isBlocked('k')).toBe(true);
    expect(l.isBlocked('altro')).toBe(false);
    t = 1001;
    expect(l.isBlocked('k')).toBe(false);
  });

  it('azzera i tentativi dopo un accesso riuscito', () => {
    const l = new LoginLimiter(2, 1000, () => 0);
    l.fail('k');
    l.reset('k');
    l.fail('k');
    expect(l.isBlocked('k')).toBe(false);
  });
});
