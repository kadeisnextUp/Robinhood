import { nextPeriodWindow } from './schedule.ts';

export type PushMessage = Record<string, unknown>;

export type CloseDeps = {
  // service-role supabase-js client
  supabase: any;
  now: Date;
  // posts one batch to Expo's push API, throwing if it fails
  push: (messages: PushMessage[]) => Promise<void>;
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
};

export type CloseOptions = {
  force: boolean;
  forcePeriodId: string | null;
};

export type StepIssue = { step: string; message: string; period_id?: string };

type VoteCount = { charity_id: string; votes: number };

// Everything that goes wrong is recorded under the step it happened in and logged,
// and the run carries on wherever that is safe. Errors mean the job did not get
// done (the response is a 500); warnings mean it did, but users may not have
// been told.
//
// Before this, most query errors were ignored: a failed vote count read as zero
// votes, a failed read quietly skipped creating the next period, and a thrown push
// abandoned the run after the period was already closed. On 2026-09-14 a run
// closed a period and then stopped, leaving no winner, no notification and no open
// period, with nothing to show why.
type RunContext = {
  supabase: any;
  now: Date;
  logger: Pick<Console, 'log' | 'warn' | 'error'>;
  fail: (step: string, error: unknown, periodId?: string) => void;
  warn: (step: string, error: unknown, periodId?: string) => void;
  notify: (step: string, messages: PushMessage[], periodId?: string) => Promise<void>;
};

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : String(error);
}

// picks between charities tied at the top. Previously a tie resolved to whichever
// row Postgres returned first, which is arbitrary rather than fair — and real
// donations follow the winner.
//
// tie order:
//   1. fewest previous wins
//   2. longest since last featured
//   3. random
async function breakTie(
  supabase: any,
  tied: VoteCount[],
  currentPeriodId: string
): Promise<{ winner: VoteCount; reason: string }> {
  const ids = tied.map((t) => t.charity_id);

  // fewest previous wins
  const { data: priorWins } = await supabase
    .from('voting_periods')
    .select('winner_charity_id')
    .in('winner_charity_id', ids);

  const winCounts = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const row of priorWins ?? []) {
    const id = row.winner_charity_id;
    winCounts.set(id, (winCounts.get(id) ?? 0) + 1);
  }

  const fewestWins = Math.min(...ids.map((id) => winCounts.get(id) ?? 0));
  let pool = ids.filter((id) => (winCounts.get(id) ?? 0) === fewestWins);
  if (pool.length === 1) {
    return {
      winner: tied.find((t) => t.charity_id === pool[0])!,
      reason: `fewest previous wins (${fewestWins})`,
    };
  }

  // 2. longest since last featured, excluding the period being closed.
  const { data: appearances } = await supabase
    .from('voting_period_charities')
    .select('charity_id, voting_period_id')
    .in('charity_id', pool)
    .neq('voting_period_id', currentPeriodId);

  const periodIds = [...new Set((appearances ?? []).map((a: any) => a.voting_period_id))];
  const createdAt = new Map<string, string>();
  if (periodIds.length > 0) {
    const { data: periods } = await supabase
      .from('voting_periods')
      .select('id, created_at')
      .in('id', periodIds);
    for (const p of periods ?? []) createdAt.set(p.id, p.created_at);
  }

  // null means never featured before, which sorts as the longest wait
  const lastSeen = new Map<string, string | null>(pool.map((id) => [id, null]));
  for (const a of (appearances ?? []) as any[]) {
    const when = createdAt.get(a.voting_period_id);
    if (!when) continue;
    const prev = lastSeen.get(a.charity_id) ?? null;
    if (prev === null || when > prev) lastSeen.set(a.charity_id, when);
  }

  const neverFeatured = pool.filter((id) => lastSeen.get(id) === null);
  if (neverFeatured.length === 1) {
    return {
      winner: tied.find((t) => t.charity_id === neverFeatured[0])!,
      reason: 'never featured before',
    };
  }
  if (neverFeatured.length === 0) {
    const oldest = pool.reduce((a, b) => (lastSeen.get(a)! <= lastSeen.get(b)! ? a : b));
    const oldestWhen = lastSeen.get(oldest)!;
    const stillTied = pool.filter((id) => lastSeen.get(id) === oldestWhen);
    if (stillTied.length === 1) {
      return {
        winner: tied.find((t) => t.charity_id === stillTied[0])!,
        reason: 'longest since last featured',
      };
    }
    pool = stillTied;
  } else {
    pool = neverFeatured;
  }

  // 3. random, only when nothing above separates them
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return {
    winner: tied.find((t) => t.charity_id === pick)!,
    reason: `random among ${pool.length} still tied`,
  };
}

// Tallies one closed period, records its winner and announces it. Returns the
// result row, 'zero-votes', or null if the period could not be finished.
async function finishPeriod(ctx: RunContext, periodId: string) {
  const { supabase } = ctx;

  const { data: periodCharities, error: ballotError } = await supabase
    .from('voting_period_charities')
    .select('charity_id')
    .eq('voting_period_id', periodId);

  if (ballotError) {
    ctx.fail('load ballot', ballotError, periodId);
    return null;
  }

  const counted = await Promise.all(
    (periodCharities ?? []).map(async (item: any) => {
      const { count, error } = await supabase
        .from('votes')
        .select('id', { count: 'exact', head: true })
        .eq('voting_period_id', periodId)
        .eq('charity_id', item.charity_id);
      return { charity_id: item.charity_id as string, votes: count as number | null, error };
    })
  );

  // A count that failed is unknown, not zero. Reading it as zero is how a period
  // with votes could be announced as having none and have its pool moved on.
  const badCount = counted.find((c) => c.error || c.votes === null);
  if (badCount) {
    ctx.fail('count votes', badCount.error ?? `no count returned for ${badCount.charity_id}`, periodId);
    return null;
  }
  const voteCounts: VoteCount[] = counted.map((c) => ({ charity_id: c.charity_id, votes: c.votes as number }));

  const maxVotes = Math.max(...voteCounts.map((v) => v.votes), 0);

  if (maxVotes === 0) {
    const { data: noVoteProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, expo_push_token')
      .not('expo_push_token', 'is', null);
    if (profilesError) ctx.warn('notify no votes', profilesError, periodId);

    const noVoteValid = (noVoteProfiles ?? []).filter((p: any) =>
      p.expo_push_token?.startsWith('ExponentPushToken[')
    );

    await ctx.notify(
      'notify no votes',
      noVoteValid.map((p: any) => ({
        to: p.expo_push_token,
        title: 'No votes this week',
        body: 'No votes were cast, so no charity was selected. This week\'s pool carries over to the next vote.',
        data: { type: 'no_winner', period_id: periodId },
      })),
      periodId
    );

    return 'zero-votes' as const;
  }

  const tied = voteCounts.filter((v) => v.votes === maxVotes);
  let winner = tied[0];
  let tiebreakReason: string | null = null;

  if (tied.length > 1) {
    const broken = await breakTie(supabase, tied, periodId);
    winner = broken.winner;
    tiebreakReason = broken.reason;
    ctx.logger.log(
      `Tie in period ${periodId}: ${tied.length} charities at ${maxVotes} votes. ` +
      `Winner ${winner.charity_id} by ${broken.reason}.`
    );
  }

  const { error: winnerError } = await supabase
    .from('voting_periods')
    .update({ winner_charity_id: winner.charity_id })
    .eq('id', periodId);

  if (winnerError) {
    ctx.fail('record winner', winnerError, periodId);
    return null;
  }

  // user_donations has no charity_id column, so there is nothing to back-fill:
  // a period's donations go to voting_periods.winner_charity_id.

  const [charityRes, profilesRes, votersRes] = await Promise.all([
    supabase.from('charities').select('name').eq('id', winner.charity_id).single(),
    supabase.from('profiles').select('user_id, expo_push_token').not('expo_push_token', 'is', null),
    supabase.from('votes').select('user_id').eq('voting_period_id', periodId).eq('charity_id', winner.charity_id),
  ]);
  const detailsError = charityRes.error ?? profilesRes.error ?? votersRes.error;
  if (detailsError) ctx.warn('load winner details', detailsError, periodId);

  const validProfiles = (profilesRes.data ?? []).filter((p: any) =>
    p.expo_push_token?.startsWith('ExponentPushToken[')
  );

  const { data: updatedCounts, error: badgeError } = await supabase.rpc('increment_notification_count', {
    user_ids: validProfiles.map((p: any) => p.user_id),
  });
  if (badgeError) ctx.warn('increment badges', badgeError, periodId);
  const countMap = new Map((updatedCounts ?? []).map((r: any) => [r.user_id, r.new_count]));

  const winnerVoterIds = new Set((votersRes.data ?? []).map((v: any) => v.user_id));
  const charityName = charityRes.data?.name ?? 'A charity';
  const notifData = { type: 'winner_announced', period_id: periodId, winner_charity_id: winner.charity_id };

  await ctx.notify(
    'notify winner',
    validProfiles.map((p: any) => ({
      to: p.expo_push_token,
      title: winnerVoterIds.has(p.user_id) ? 'Your pick won!' : 'Winner Announced!',
      body: winnerVoterIds.has(p.user_id)
        ? `${charityName} won this week's vote. Great call!`
        : `${charityName} won this week's vote!`,
      badge: countMap.get(p.user_id) ?? 1,
      data: notifData,
    })),
    periodId
  );

  return {
    period_id: periodId,
    winner_charity_id: winner.charity_id,
    winning_votes: winner.votes,
    // surfaced so a tie is visible in the response and the function logs,
    // rather than being an invisible coin flip over real donations
    tiebreak: tiebreakReason,
    tied_count: tied.length,
  };
}

// Opens the next period if none is open. Any failure before the period exists
// leaves nothing behind, so the next scheduled run simply tries again.
async function openNextPeriod(ctx: RunContext): Promise<{ id: string | null; skipReason: string | null }> {
  const { supabase } = ctx;
  const none = { id: null, skipReason: null };

  // maybeSingle errors when more than one period is open. Treating that as
  // "nothing open", as before, would have opened yet another.
  const { data: existing, error: existingError } = await supabase
    .from('voting_periods')
    .select('id')
    .eq('is_closed', false)
    .maybeSingle();

  if (existingError) {
    ctx.fail('check open period', existingError);
    return none;
  }
  if (existing) return none;

  const { start, end } = nextPeriodWindow(ctx.now);

  const { data: recentPeriods, error: recentError } = await supabase
    .from('voting_periods')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(3);

  if (recentError) {
    ctx.fail('load recent periods', recentError);
    return none;
  }

  let excludedIds: string[] = [];
  if ((recentPeriods ?? []).length > 0) {
    const { data: recentCharities, error: recentCharitiesError } = await supabase
      .from('voting_period_charities')
      .select('charity_id')
      .in('voting_period_id', recentPeriods.map((p: any) => p.id));
    if (recentCharitiesError) {
      ctx.fail('load recent periods', recentCharitiesError);
      return none;
    }
    excludedIds = (recentCharities ?? []).map((c: any) => c.charity_id);
  }

  let charityQuery = supabase.from('charities').select('id').eq('is_approved', true);
  if (excludedIds.length > 0) {
    charityQuery = charityQuery.not('id', 'in', `(${excludedIds.join(',')})`);
  }

  const { data: eligible, error: eligibleError } = await charityQuery;

  if (eligibleError) {
    ctx.fail('load eligible charities', eligibleError);
    return none;
  }

  // Too few charities leaves the app with no round, so it is an error, not a note.
  if ((eligible ?? []).length < 5) {
    const skipReason =
      `only ${eligible?.length ?? 0} eligible charities, need 5 ` +
      `(${excludedIds.length} excluded as recently used)`;
    ctx.fail('pick charities', skipReason);
    return { id: null, skipReason };
  }

  const selected = eligible.sort(() => Math.random() - 0.5).slice(0, 5);
  const selectedIds: string[] = selected.map((c: any) => c.id);

  const { data: newPeriod, error: periodError } = await supabase
    .from('voting_periods')
    .insert({
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      is_closed: false,
    })
    .select()
    .single();

  if (periodError || !newPeriod) {
    ctx.fail('create period', periodError ?? 'insert returned no row');
    return none;
  }

  const { error: ballotError } = await supabase.from('voting_period_charities').insert(
    selectedIds.map((id) => ({ voting_period_id: newPeriod.id, charity_id: id }))
  );

  if (ballotError) {
    ctx.fail('create ballot', ballotError, newPeriod.id);
    // An open period with an empty ballot counts as "the open period", which would
    // stop every later run from creating a real one. Remove it so a retry can.
    const { error: cleanupError } = await supabase.from('voting_periods').delete().eq('id', newPeriod.id);
    if (cleanupError) ctx.fail('remove empty period', cleanupError, newPeriod.id);
    return none;
  }

  const [profilesRes, nominatorsRes] = await Promise.all([
    supabase.from('profiles').select('user_id, expo_push_token').not('expo_push_token', 'is', null),
    supabase.from('nominations').select('user_id, charity_id, charities(name)').in('charity_id', selectedIds).eq('status', 'approved'),
  ]);
  const recipientsError = profilesRes.error ?? nominatorsRes.error;
  if (recipientsError) ctx.warn('notify new period', recipientsError, newPeriod.id);

  const validProfiles = (profilesRes.data ?? []).filter((p: any) =>
    p.expo_push_token?.startsWith('ExponentPushToken[')
  );

  const { data: newCounts, error: badgeError } = await supabase.rpc('increment_notification_count', {
    user_ids: validProfiles.map((p: any) => p.user_id),
  });
  if (badgeError) ctx.warn('increment badges', badgeError, newPeriod.id);
  const newCountMap = new Map((newCounts ?? []).map((r: any) => [r.user_id, r.new_count]));

  const profileTokenMap = new Map<string, string>(validProfiles.map((p: any) => [p.user_id, p.expo_push_token]));

  const broadcastMsgs = validProfiles.map((p: any) => ({
    to: p.expo_push_token,
    title: 'New Vote Is Open!',
    body: "This week's 5 charities are ready. Cast your vote now!",
    badge: newCountMap.get(p.user_id) ?? 1,
    data: { type: 'new_voting_period', voting_period_id: newPeriod.id },
  }));

  const nominatorMsgs = (nominatorsRes.data ?? [])
    .map((n: any) => {
      const token = profileTokenMap.get(n.user_id);
      if (!token?.startsWith('ExponentPushToken[')) return null;
      const charityName = n.charities?.name ?? 'Your nominated charity';
      return {
        to: token,
        title: "Your charity is in this week's vote!",
        body: `${charityName} was selected for this week's voting round. Go vote!`,
        badge: newCountMap.get(n.user_id) ?? 1,
        data: { type: 'charity_selected', charity_id: n.charity_id, voting_period_id: newPeriod.id },
      };
    })
    .filter((m: PushMessage | null): m is PushMessage => m !== null);

  await ctx.notify('notify new period', [...broadcastMsgs, ...nominatorMsgs], newPeriod.id);

  return { id: newPeriod.id, skipReason: null };
}

export async function closeVotingPeriods(deps: CloseDeps, opts: CloseOptions) {
  const { supabase, push } = deps;
  const { force, forcePeriodId } = opts;
  const logger = deps.logger ?? console;

  const errors: StepIssue[] = [];
  const warnings: StepIssue[] = [];
  const record = (list: StepIssue[], level: 'error' | 'warn') =>
    (step: string, error: unknown, periodId?: string) => {
      const message = messageOf(error);
      list.push({ step, message, ...(periodId ? { period_id: periodId } : {}) });
      logger[level](`close-voting-period: ${step}${periodId ? ` (${periodId})` : ''}: ${message}`);
    };

  const ctx: RunContext = {
    supabase,
    now: deps.now,
    logger,
    fail: record(errors, 'error'),
    warn: record(warnings, 'warn'),
    notify: async (step, messages, periodId) => {
      if (messages.length === 0) return;
      try {
        await push(messages);
      } catch (error) {
        ctx.warn(step, error, periodId);
      }
    },
  };

  // atomically mark periods as closed and return only those claimed by this invocation.
  // If this fails nothing has changed yet, so it is thrown rather than recorded.
  let expiredPeriods;
  if (force && forcePeriodId) {
    const { data, error } = await supabase
      .from('voting_periods')
      .update({ is_closed: true })
      .eq('id', forcePeriodId)
      .eq('is_closed', false)
      .select('id');
    if (error) throw error;
    expiredPeriods = data;
  } else {
    const { data, error } = await supabase
      .from('voting_periods')
      .update({ is_closed: true })
      .eq('is_closed', false)
      .lt('end_date', deps.now.toISOString())
      .select('id');
    if (error) throw error;
    expiredPeriods = data;
  }

  // deliberately no early return when nothing was closed: the next-period step
  // below doubles as recovery when no period is open.
  const closedThisRun: { id: string }[] = expiredPeriods ?? [];

  const results = [];
  // periods that closed with nobody voting. Their donation pools roll into the
  // next period rather than being stranded against a period with no winner.
  const zeroVotePeriodIds: string[] = [];

  // A period that fails here stays closed without a winner and is reported, but
  // the loop moves on so one bad period cannot also cost the app its next round.
  for (const period of closedThisRun) {
    const outcome = await finishPeriod(ctx, period.id);
    if (outcome === 'zero-votes') {
      zeroVotePeriodIds.push(period.id);
      results.push({ period_id: period.id, winner_charity_id: null, winning_votes: 0 });
    } else if (outcome) {
      results.push(outcome);
    }
  }

  // An admin force-close never opens the next period; the schedule does that.
  let nextPeriodId: string | null = null;
  let skipReason: string | null = null;
  if (!force) {
    const next = await openNextPeriod(ctx);
    nextPeriodId = next.id;
    skipReason = next.skipReason;
  }

  let donationsRolledOver = 0;
  if (zeroVotePeriodIds.length > 0) {
    if (nextPeriodId) {
      const { data: moved, error: moveError } = await supabase
        .from('user_donations')
        .update({ voting_period_id: nextPeriodId })
        .in('voting_period_id', zeroVotePeriodIds)
        .select('id');

      if (moveError) {
        ctx.fail('roll over donations', moveError);
      } else {
        donationsRolledOver = moved?.length ?? 0;
        logger.log(
          `Rolled ${donationsRolledOver} donation(s) from ${zeroVotePeriodIds.length} ` +
          `zero-vote period(s) into ${nextPeriodId}.`
        );
      }
    } else {
      ctx.warn(
        'roll over donations',
        `no next period was created, so the pool stays on ${zeroVotePeriodIds.join(', ')}`
      );
    }
  }

  const success = errors.length === 0;
  return {
    success,
    // the admin panel shows `error` when success is false
    ...(success ? {} : { error: errors.map((e) => `${e.step}: ${e.message}`).join('; ') }),
    periods_closed: closedThisRun.length,
    results,
    ...(nextPeriodId ? { next_period_id: nextPeriodId } : {}),
    ...(skipReason ? { next_period_not_created: skipReason } : {}),
    ...(zeroVotePeriodIds.length > 0
      ? { zero_vote_periods: zeroVotePeriodIds.length, donations_rolled_over: donationsRolledOver }
      : {}),
    errors,
    warnings,
  };
}
