import { periodRange } from './report-config';

describe('periodRange', () => {
  const today = new Date(2026, 10, 25); // mercoledì 25 novembre 2026
  it.each([
    ['today', '2026-11-25', '2026-11-26'],
    ['thisWeek', '2026-11-23', '2026-11-30'],
    ['thisMonth', '2026-11-01', '2026-12-01'],
    ['lastMonth', '2026-10-01', '2026-11-01'],
    ['thisQuarter', '2026-10-01', '2027-01-01'],
    ['thisYear', '2026-01-01', '2027-01-01'],
    ['lastYear', '2025-01-01', '2026-01-01'],
    ['last7', '2026-11-19', '2026-11-26'],
    ['last30', '2026-10-27', '2026-11-26'],
    ['next30', '2026-11-25', '2026-12-25'],
  ] as const)('%s', (period, from, to) => {
    expect(periodRange(period, today)).toEqual([from, to]);
  });

  it('gestisce il cambio d\'anno', () => {
    expect(periodRange('lastMonth', new Date(2026, 0, 10))).toEqual(['2025-12-01', '2026-01-01']);
  });
});
