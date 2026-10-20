// Run with: node --test "supabase/functions/close-voting-period/*.test.ts"  (Node 22.18+)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEasternDST, nextPeriodWindow } from './schedule.ts';

function windowAt(nowIso: string) {
  const { start, end } = nextPeriodWindow(new Date(nowIso));
  return { start: start.toISOString(), end: end.toISOString() };
}

test('Monday rollover in EDT opens Mon 00:00 ET and closes Sun 23:55 ET', () => {
  assert.deepEqual(windowAt('2026-09-14T03:55:02.000Z'), {
    start: '2026-09-14T04:00:00.000Z',
    end: '2026-09-21T03:55:00.000Z',
  });
});

test('Monday rollover in EST opens Mon 00:00 ET and closes Sun 23:55 ET', () => {
  assert.deepEqual(windowAt('2026-11-16T04:55:02.000Z'), {
    start: '2026-11-16T05:00:00.000Z',
    end: '2026-11-23T04:55:00.000Z',
  });
});

test('rollover on the night DST ends', () => {
  // Sun 2026-11-01 23:55 EST
  assert.deepEqual(windowAt('2026-11-02T04:55:02.000Z'), {
    start: '2026-11-02T05:00:00.000Z',
    end: '2026-11-09T04:55:00.000Z',
  });
});

test('rollover on the night DST starts', () => {
  // Sun 2027-03-14 23:55 EDT
  assert.deepEqual(windowAt('2027-03-15T03:55:02.000Z'), {
    start: '2027-03-15T04:00:00.000Z',
    end: '2027-03-22T03:55:00.000Z',
  });
});

test('a Tuesday run opens immediately, even when it just closed a period Monday missed', () => {
  // The old math assumed anything closed was closed on the cron's Monday, and
  // dated this period to the following Monday.
  assert.deepEqual(windowAt('2026-09-15T17:01:16.000Z'), {
    start: '2026-09-15T17:01:16.000Z',
    end: '2026-09-21T03:55:00.000Z',
  });
});

test('a few minutes before the Sunday boundary, the period starts at the upcoming Monday', () => {
  // Sun 2026-09-20 23:50 EDT. Opening now would give a five-minute period.
  assert.deepEqual(windowAt('2026-09-21T03:50:00.000Z'), {
    start: '2026-09-21T04:00:00.000Z',
    end: '2026-09-28T03:55:00.000Z',
  });
});

test('at any time across both DST changes, opens within 15 minutes, stays open 10+, and closes on a Sunday 23:55 ET', () => {
  const from = Date.parse('2026-10-25T00:00:00Z');
  const to = Date.parse('2027-03-28T00:00:00Z');
  // 67-minute steps land on every minute-of-hour pattern over the span.
  for (let t = from; t < to; t += 67 * 60_000) {
    const now = new Date(t);
    const { start, end } = nextPeriodWindow(now);
    const at = now.toISOString();

    assert.ok(start.getTime() >= t, `starts in the past at ${at}: ${start.toISOString()}`);
    // 15 minutes: a run at Sunday 23:45-23:50 ET opens the week starting at midnight
    assert.ok(start.getTime() - t <= 15 * 60_000, `starts too late at ${at}: ${start.toISOString()}`);
    assert.ok(end.getTime() - t >= 10 * 60_000, `closes within 10 minutes at ${at}: ${end.toISOString()}`);
    // 75 minutes: the week clocks fall back is an hour longer
    assert.ok(end.getTime() - t <= 7 * 24 * 3_600_000 + 75 * 60_000, `ends over a week out at ${at}`);

    const offsetHours = isEasternDST(end) ? 4 : 5;
    const eastern = new Date(end.getTime() - offsetHours * 3_600_000);
    assert.deepEqual(
      [eastern.getUTCDay(), eastern.getUTCHours(), eastern.getUTCMinutes()],
      [0, 23, 55],
      `end is not Sunday 23:55 ET at ${at}: ${end.toISOString()}`
    );
  }
});
