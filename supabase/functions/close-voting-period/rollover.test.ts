// Run with: node --test "supabase/functions/close-voting-period/*.test.ts"  (Node 22.18+)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeVotingPeriods, type PushMessage } from './rollover.ts';

type Op = {
  table: string;
  action: 'select' | 'update' | 'insert' | 'delete' | 'rpc';
  columns?: string;
  options?: any;
  payload?: any;
  filters: [string, string, unknown][];
  single?: boolean;
};
type Reply = { data?: unknown; error?: { message: string } | null; count?: number | null };

// Stands in for the supabase-js query builder. Every awaited query is recorded and
// answered by `respond`, so a test scripts the database and then asserts on what
// the function tried to write.
function fakeSupabase(respond: (op: Op) => Reply | undefined) {
  const ops: Op[] = [];
  const run = (op: Op) => {
    ops.push(op);
    return Promise.resolve({ data: null, error: null, count: null, ...respond(op) });
  };

  const from = (table: string) => {
    const op: Op = { table, action: 'select', filters: [] };
    const builder: any = {
      select(columns?: string, options?: any) {
        // after update/insert, select only asks for the rows back
        if (op.action === 'select') {
          op.columns = columns;
          op.options = options;
        }
        return builder;
      },
      update(payload: any) { op.action = 'update'; op.payload = payload; return builder; },
      insert(payload: any) { op.action = 'insert'; op.payload = payload; return builder; },
      delete() { op.action = 'delete'; return builder; },
      single() { op.single = true; return builder; },
      maybeSingle() { op.single = true; return builder; },
      order() { return builder; },
      limit() { return builder; },
      then(resolve: any, reject: any) { return run(op).then(resolve, reject); },
    };
    for (const name of ['eq', 'neq', 'lt', 'in', 'not']) {
      builder[name] = (column: string, ...args: unknown[]) => {
        op.filters.push([name, column, args.length > 1 ? args : args[0]]);
        return builder;
      };
    }
    return builder;
  };

  const rpc = (fn: string, args: unknown) => run({ table: fn, action: 'rpc', payload: args, filters: [] });
  return { client: { from, rpc }, ops };
}

const filterValue = (op: Op, name: string, column: string) =>
  op.filters.find(([n, c]) => n === name && c === column)?.[2];

const CLOSING = 'period-closing';
const CREATED = 'period-created';

// A project with one expired period on a five-charity ballot, nothing else open,
// six eligible charities and one user with a push token.
function world(votes: Record<string, number> = {}) {
  return (op: Op): Reply | undefined => {
    switch (`${op.action} ${op.table}`) {
      case 'update voting_periods':
        return 'is_closed' in op.payload ? { data: [{ id: CLOSING }] } : {};
      case 'select voting_period_charities':
        return { data: ['c1', 'c2', 'c3', 'c4', 'c5'].map((charity_id) => ({ charity_id })) };
      case 'select votes':
        return op.options?.head
          ? { count: votes[filterValue(op, 'eq', 'charity_id') as string] ?? 0 }
          : { data: [] };
      case 'select voting_periods':
        return filterValue(op, 'eq', 'is_closed') === false ? { data: null } : { data: [{ id: CLOSING }] };
      case 'select charities':
        return op.single
          ? { data: { name: 'Charity Two' } }
          : { data: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].map((id) => ({ id })) };
      case 'insert voting_periods':
        return { data: { id: CREATED } };
      case 'select profiles':
        return { data: [{ user_id: 'u1', expo_push_token: 'ExponentPushToken[abc]' }] };
      case 'select nominations':
        return { data: [] };
      case 'rpc increment_notification_count':
        return { data: [{ user_id: 'u1', new_count: 1 }] };
      case 'update user_donations':
        return { data: [{ id: 'd1' }] };
      default:
        return {};
    }
  };
}

// Wraps a responder so matching operations fail the way supabase-js reports errors.
function failing(respond: (op: Op) => Reply | undefined, matches: (op: Op) => boolean) {
  return (op: Op) => (matches(op) ? { error: { message: `simulated ${op.action} ${op.table} failure` } } : respond(op));
}

async function runClose(
  respond: (op: Op) => Reply | undefined,
  {
    force = false,
    forcePeriodId = null,
    push,
  }: { force?: boolean; forcePeriodId?: string | null; push?: (m: PushMessage[]) => Promise<void> } = {}
) {
  const { client, ops } = fakeSupabase(respond);
  const pushed: PushMessage[][] = [];
  const outcome: any = await closeVotingPeriods(
    {
      supabase: client,
      now: new Date('2026-09-14T03:55:02.000Z'),
      push: push ?? (async (messages) => { pushed.push(messages); }),
      logger: { log() {}, warn() {}, error() {} },
    },
    { force, forcePeriodId }
  );
  return { outcome, ops, pushed };
}

const writesTo = (ops: Op[], table: string) =>
  ops.filter((o) => o.table === table && (o.action === 'update' || o.action === 'insert' || o.action === 'delete'));
const steps = (entries: { step: string }[] | undefined) => (entries ?? []).map((e) => e.step);

test('with a vote, records the winner and opens the next period', async () => {
  const { outcome, ops } = await runClose(world({ c2: 1 }));

  assert.equal(outcome.success, true);
  assert.deepEqual(outcome.errors, []);
  assert.ok(
    writesTo(ops, 'voting_periods').some((o) => o.payload?.winner_charity_id === 'c2'),
    'winner was not written'
  );
  assert.equal(outcome.next_period_id, CREATED);
});

test('with a vote, does not write user_donations (it has no charity_id column)', async () => {
  const { ops } = await runClose(world({ c2: 1 }));
  assert.deepEqual(writesTo(ops, 'user_donations'), []);
});

test('with no votes, rolls the pool into the new period by voting_period_id alone', async () => {
  const { outcome, ops } = await runClose(world());

  assert.equal(outcome.success, true);
  const rollover = writesTo(ops, 'user_donations');
  assert.equal(rollover.length, 1);
  assert.deepEqual(rollover[0].payload, { voting_period_id: CREATED });
  assert.deepEqual(filterValue(rollover[0], 'in', 'voting_period_id'), [CLOSING]);
});

test('a failed vote count fails the run instead of reporting zero votes', async () => {
  const { outcome, ops, pushed } = await runClose(
    failing(world({ c2: 1 }), (op) => op.table === 'votes' && op.options?.head)
  );

  assert.equal(outcome.success, false);
  assert.deepEqual(steps(outcome.errors), ['count votes']);
  assert.equal(outcome.errors[0].period_id, CLOSING);
  assert.equal(outcome.zero_vote_periods, undefined);
  assert.ok(!pushed.flat().some((m) => m.title === 'No votes this week'), 'announced zero votes');
  assert.deepEqual(writesTo(ops, 'user_donations'), []);
});

test('a failed ballot lookup fails that period but still opens the next one', async () => {
  const { outcome } = await runClose(
    failing(world({ c2: 1 }), (op) => op.action === 'select' && op.table === 'voting_period_charities' && filterValue(op, 'eq', 'voting_period_id') === CLOSING)
  );

  assert.equal(outcome.success, false);
  assert.deepEqual(steps(outcome.errors), ['load ballot']);
  assert.equal(outcome.next_period_id, CREATED);
});

test('a failed winner write fails the run', async () => {
  const { outcome } = await runClose(
    failing(world({ c2: 1 }), (op) => op.action === 'update' && op.table === 'voting_periods' && 'winner_charity_id' in op.payload)
  );

  assert.equal(outcome.success, false);
  assert.deepEqual(steps(outcome.errors), ['record winner']);
});

test('a failed notification is a warning, and the next period still opens', async () => {
  const { outcome } = await runClose(world({ c2: 1 }), {
    push: async () => { throw new Error('exp.host unreachable'); },
  });

  assert.equal(outcome.success, true);
  assert.ok(steps(outcome.warnings).includes('notify winner'));
  assert.equal(outcome.next_period_id, CREATED);
});

test('if the open-period check fails, no period is created', async () => {
  const { outcome, ops } = await runClose(
    failing(world(), (op) => op.action === 'select' && op.table === 'voting_periods' && filterValue(op, 'eq', 'is_closed') === false)
  );

  assert.equal(outcome.success, false);
  assert.ok(steps(outcome.errors).includes('check open period'));
  assert.deepEqual(writesTo(ops, 'voting_periods').filter((o) => o.action === 'insert'), []);
});

test('a failed charity lookup is reported as a failure, not as too few charities', async () => {
  const { outcome, ops } = await runClose(
    failing(world(), (op) => op.action === 'select' && op.table === 'charities' && !op.single)
  );

  assert.equal(outcome.success, false);
  assert.ok(steps(outcome.errors).includes('load eligible charities'));
  assert.deepEqual(writesTo(ops, 'voting_periods').filter((o) => o.action === 'insert'), []);
});

test('too few eligible charities fails the run, because the app is left with no round', async () => {
  const base = world();
  const { outcome } = await runClose((op) =>
    op.action === 'select' && op.table === 'charities' && !op.single
      ? { data: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }] }
      : base(op)
  );

  assert.equal(outcome.success, false);
  assert.ok(steps(outcome.errors).includes('pick charities'));
  assert.match(outcome.next_period_not_created, /only 3 eligible/);
});

test('if the ballot insert fails, the empty period is deleted so a later run can retry', async () => {
  const { outcome, ops } = await runClose(
    failing(world(), (op) => op.action === 'insert' && op.table === 'voting_period_charities')
  );

  assert.equal(outcome.success, false);
  assert.ok(steps(outcome.errors).includes('create ballot'));
  assert.equal(outcome.next_period_id, undefined);
  const deleted = writesTo(ops, 'voting_periods').filter((o) => o.action === 'delete');
  assert.equal(deleted.length, 1);
  assert.equal(filterValue(deleted[0], 'eq', 'id'), CREATED);
});

test('a failed donation rollover fails the run', async () => {
  const { outcome } = await runClose(
    failing(world(), (op) => op.action === 'update' && op.table === 'user_donations')
  );

  assert.equal(outcome.success, false);
  assert.ok(steps(outcome.errors).includes('roll over donations'));
});

test('an admin force-close with no votes warns that the pool was not rolled over', async () => {
  const { outcome, ops } = await runClose(world(), { force: true, forcePeriodId: CLOSING });

  assert.equal(outcome.success, true);
  assert.ok(steps(outcome.warnings).includes('roll over donations'));
  assert.deepEqual(writesTo(ops, 'voting_periods').filter((o) => o.action === 'insert'), []);
});
