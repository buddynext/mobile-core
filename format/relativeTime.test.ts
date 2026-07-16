/**
 * relativeTime — the feed clock, deterministic because now is passed in.
 */

import { parseTimestamp, relativeTime } from './relativeTime';

// A fixed "now": 2026-07-16 12:00:00 UTC.
const NOW = Date.UTC(2026, 6, 16, 12, 0, 0);
const ago = (ms: number) => NOW - ms;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('the social-feed scale', () => {
  it('sub-minute is "now"', () => {
    expect(relativeTime(ago(0), NOW)).toBe('now');
    expect(relativeTime(ago(30_000), NOW)).toBe('now');
  });

  it('minutes', () => {
    expect(relativeTime(ago(5 * MIN), NOW)).toBe('5m');
    expect(relativeTime(ago(59 * MIN), NOW)).toBe('59m');
  });

  it('hours', () => {
    expect(relativeTime(ago(1 * HOUR), NOW)).toBe('1h');
    expect(relativeTime(ago(23 * HOUR), NOW)).toBe('23h');
  });

  it('days', () => {
    expect(relativeTime(ago(1 * DAY), NOW)).toBe('1d');
    expect(relativeTime(ago(6 * DAY), NOW)).toBe('6d');
  });

  it('older than a week is a calendar date, no year when it is this year', () => {
    expect(relativeTime(Date.UTC(2026, 6, 4, 9, 0, 0), NOW)).toBe('Jul 4');
  });

  it('includes the year when it differs from now', () => {
    expect(relativeTime(Date.UTC(2025, 11, 25, 9, 0, 0), NOW)).toBe('Dec 25, 2025');
  });
});

describe('robustness', () => {
  it('clamps a future timestamp to "now" rather than showing negative', () => {
    // Phone clock ahead of the server; a "-3m" reads as a bug.
    expect(relativeTime(NOW + 3 * MIN, NOW)).toBe('now');
  });

  it('parses a MySQL datetime as UTC (engine-independent)', () => {
    // The exact shape WordPress stores. Space-separated, treated as UTC.
    expect(parseTimestamp('2026-07-16 11:00:00')).toBe(Date.UTC(2026, 6, 16, 11, 0, 0));
    expect(relativeTime('2026-07-16 11:00:00', NOW)).toBe('1h');
  });

  it('accepts ISO 8601 and epoch ms', () => {
    expect(parseTimestamp('2026-07-16T11:00:00Z')).toBe(Date.UTC(2026, 6, 16, 11, 0, 0));
    expect(parseTimestamp(NOW)).toBe(NOW);
  });

  it('returns empty string for an unparseable timestamp rather than NaN', () => {
    expect(relativeTime('not a date', NOW)).toBe('');
    expect(parseTimestamp('garbage')).toBeNull();
  });
});
