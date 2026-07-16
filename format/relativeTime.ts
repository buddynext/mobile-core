/**
 * Relative time for feed timestamps — pure, so "now" is an argument, not a global.
 *
 * `Date.now()` inside a formatter makes it untestable and non-deterministic; passing the
 * current time in keeps it a pure function of its inputs. The component reads the clock
 * once and passes it down.
 *
 * The scale is the social-feed convention (X/Instagram): seconds -> "now", minutes -> "5m",
 * hours -> "3h", days -> "4d", then a calendar date. No "ago" suffix — the column context
 * already says these are timestamps, and the shorter form scans faster in a dense list.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Parse a timestamp into epoch ms. Accepts an ISO 8601 string, a MySQL `Y-m-d H:i:s`
 * datetime (which WordPress stores and which `new Date()` treats inconsistently across
 * engines — so it is normalised to ISO UTC here), or an epoch-ms number.
 *
 * Returns null for anything unparseable; the caller shows nothing rather than "NaN".
 */
export function parseTimestamp(input: string | number): number | null {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : null;
  }

  const value = input.trim();

  // MySQL DATETIME "2026-07-16 12:34:56" -> treat as UTC ("...T...Z"). Without this, Hermes
  // and V8 disagree on the timezone of a space-separated datetime.
  const mysql = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(value);
  const iso = mysql ? `${mysql[1]}T${mysql[2]}Z` : value;

  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Format `when` relative to `nowMs`.
 *
 * A future timestamp (clock skew between phone and server) clamps to "now" rather than
 * showing a negative — a "-3m" in the feed reads as a bug.
 */
export function relativeTime(when: string | number, nowMs: number): string {
  const then = parseTimestamp(when);
  if (then === null) {
    return '';
  }

  const delta = nowMs - then;

  // Future or sub-minute -> "now".
  if (delta < MINUTE) {
    return 'now';
  }
  if (delta < HOUR) {
    return `${Math.floor(delta / MINUTE)}m`;
  }
  if (delta < DAY) {
    return `${Math.floor(delta / HOUR)}h`;
  }
  if (delta < WEEK) {
    return `${Math.floor(delta / DAY)}d`;
  }

  // Older than a week -> a calendar date. Include the year only if it differs from now.
  const date = new Date(then);
  const now = new Date(nowMs);
  const day = date.getUTCDate();
  const month = MONTHS[date.getUTCMonth()];
  return date.getUTCFullYear() === now.getUTCFullYear()
    ? `${month} ${day}`
    : `${month} ${day}, ${date.getUTCFullYear()}`;
}
