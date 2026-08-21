import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// returns true if `date` falls within US Eastern Daylight Time (UTC-4).
// DST starts: 2nd Sunday of March at 02:00 EST (07:00 UTC)
// DST ends:   1st Sunday of November at 02:00 EDT (06:00 UTC)
function isEasternDST(date: Date): boolean {
  const y = date.getUTCFullYear();
  const mar1Day = new Date(Date.UTC(y, 2, 1)).getUTCDay();
  const firstSunMar = mar1Day === 0 ? 1 : 8 - mar1Day;
  const dstStart = new Date(Date.UTC(y, 2, firstSunMar + 7, 7, 0, 0));
  const nov1Day = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  const firstSunNov = nov1Day === 0 ? 1 : 8 - nov1Day;
  const dstEnd = new Date(Date.UTC(y, 10, firstSunNov, 6, 0, 0));
  return date >= dstStart && date < dstEnd;
}

type VoteCount = { charity_id: string; votes: number };

// picks between charities tied at the top. Previously a tie resolved to whichever
// row Postgres returned first, which is arbitrary rather than fair — and real
// donations follow the winner.
//
// tie order:
//   1. fewest previous wins       
//   2. longest since last featured 
//   3. random                      
//
// 
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
    // `.in('charity_id', pool)` guarantees membership, so undefined is unreachable;
    // coalesce anyway so the comparison below is against string | null, not unknown.
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

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Authorisation. config.toml sets verify_jwt = true, but that alone is not a
    // real gate: the anon key is itself a valid JWT and it ships inside every copy
    // of the app. Without this check anyone could force-close a live period,
    // declare a winner and back-fill donations to it.
    //
    // Two accepted callers:
    //   1. the pg_cron schedule, presenting CRON_SECRET in x-cron-secret
    //   2. a signed-in user whose profile has is_admin
    //
    // The schedule uses a dedicated secret rather than the service role key so a
    // leaked cron credential cannot read the whole database, and so this keeps
    // working across Supabase's legacy-JWT to sb_secret_ key migration.
    // Mirrors the x-admin-secret pattern in toggle-feature.
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedCronSecret = Deno.env.get('CRON_SECRET');
    const usingCronSecret = !!expectedCronSecret && cronSecret === expectedCronSecret;

    if (!usingCronSecret) {
      const authHeader = req.headers.get('Authorization') ?? '';
      const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();

      if (!bearer) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const { data: { user }, error: authError } = await supabase.auth.getUser(bearer);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('user_id', user.id)
        .single();

      if (!profile?.is_admin) {
        return new Response(
          JSON.stringify({ success: false, error: 'Forbidden' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* no body is fine for scheduled calls */ }

    const force = body?.force ?? false;
    const forcePeriodId = body?.period_id ?? null;
    const now = new Date().toISOString();

    // atomically mark periods as closed and return only those claimed by this invocation.
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
        .lt('end_date', now)
        .select('id');
      if (error) throw error;
      expiredPeriods = data;
    }

    // Deliberately no early return when nothing was closed. This used to bail out
    // here, which meant the function could only ever create a voting period as a
    // side effect of closing one. Any break in that chain — a force-close from the
    // admin panel, a missed cron run, a manual fix — left the app with no open
    // period and no way to recover without a human. The rollover below is already
    // guarded on whether an open period exists, so falling through to it is safe
    // and makes the schedule self-healing.
    const closedThisRun = expiredPeriods ?? [];

    const results = [];
    // Periods that closed with nobody voting. Their donation pools roll into the
    // next period rather than being stranded against a period with no winner.
    const zeroVotePeriodIds: string[] = [];

    // Empty when nothing expired, so this simply does not run and we fall through
    // to the rollover.
    for (const period of closedThisRun) {
      const { data: periodCharities, error: charitiesError } = await supabase
        .from('voting_period_charities')
        .select('charity_id')
        .eq('voting_period_id', period.id);

      if (charitiesError) throw charitiesError;

      const voteCounts = await Promise.all(
        periodCharities.map(async (item) => {
          const { count } = await supabase
            .from('votes')
            .select('id', { count: 'exact', head: true })
            .eq('voting_period_id', period.id)
            .eq('charity_id', item.charity_id);

          return { charity_id: item.charity_id, votes: count ?? 0 };
        })
      );

      const maxVotes = Math.max(...voteCounts.map((v) => v.votes), 0);

      // nobody voted. 
      if (maxVotes === 0) {
        const { data: noVoteProfiles } = await supabase
          .from('profiles')
          .select('user_id, expo_push_token')
          .not('expo_push_token', 'is', null);

        const noVoteValid = (noVoteProfiles ?? []).filter((p: any) =>
          p.expo_push_token?.startsWith('ExponentPushToken[')
        );

        if (noVoteValid.length > 0) {
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(
              noVoteValid.map((p: any) => ({
                to: p.expo_push_token,
                title: 'No votes this week',
                body: 'No votes were cast, so no charity was selected. This week\'s pool carries over to the next vote.',
                data: { type: 'no_winner', period_id: period.id },
              }))
            ),
          });
        }

        // Donations roll over.
        zeroVotePeriodIds.push(period.id);
        results.push({ period_id: period.id, winner_charity_id: null, winning_votes: 0 });
        continue;
      }

      const tied = voteCounts.filter((v) => v.votes === maxVotes);
      let winner = tied[0];
      let tiebreakReason: string | null = null;

      if (tied.length > 1) {
        const broken = await breakTie(supabase, tied, period.id);
        winner = broken.winner;
        tiebreakReason = broken.reason;
        console.log(
          `Tie in period ${period.id}: ${tied.length} charities at ${maxVotes} votes. ` +
          `Winner ${winner.charity_id} by ${broken.reason}.`
        );
      }

      const { error: updateError } = await supabase
        .from('voting_periods')
        .update({ winner_charity_id: winner.charity_id })
        .eq('id', period.id);

      if (updateError) throw updateError;

      await supabase
        .from('user_donations')
        .update({ charity_id: winner.charity_id })
        .eq('voting_period_id', period.id);

      const [{ data: winnerCharity }, { data: allProfiles }, { data: winnerVoters }] = await Promise.all([
        supabase.from('charities').select('name').eq('id', winner.charity_id).single(),
        supabase.from('profiles').select('user_id, expo_push_token').not('expo_push_token', 'is', null),
        supabase.from('votes').select('user_id').eq('voting_period_id', period.id).eq('charity_id', winner.charity_id),
      ]);

      const validProfiles = (allProfiles ?? []).filter((p: any) =>
        p.expo_push_token?.startsWith('ExponentPushToken[')
      );
      const allUserIds = validProfiles.map((p: any) => p.user_id);

      // increment badge counts for all recipients and get their new counts
      const { data: updatedCounts } = await supabase.rpc('increment_notification_count', {
        user_ids: allUserIds,
      });
      const countMap = new Map((updatedCounts ?? []).map((r: any) => [r.user_id, r.new_count]));

      const winnerVoterIds = new Set((winnerVoters ?? []).map((v: any) => v.user_id));
      const charityName = winnerCharity?.name ?? 'A charity';
      const notifData = { type: 'winner_announced', period_id: period.id, winner_charity_id: winner.charity_id };

      const pushMessages = validProfiles.map((p: any) => ({
        to: p.expo_push_token,
        title: winnerVoterIds.has(p.user_id) ? 'Your pick won!' : 'Winner Announced!',
        body: winnerVoterIds.has(p.user_id)
          ? `${charityName} won this week's vote. Great call!`
          : `${charityName} won this week's vote!`,
        badge: countMap.get(p.user_id) ?? 1,
        data: notifData,
      }));

      if (pushMessages.length > 0) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(pushMessages),
        });
      }

      results.push({
        period_id: period.id,
        winner_charity_id: winner.charity_id,
        winning_votes: winner.votes,
        // surfaced so a tie is visible in the response and the function logs,
        // rather than being an invisible coin flip over real donations
        tiebreak: tiebreakReason,
        tied_count: tied.length,
      });
    }

    // when running on schedule (not admin force-close), automatically create next week's period.
    // open/close times are pinned to Eastern clock time (DST-aware): open Mon 00:00 ET, close Sun 23:55 ET.
    let nextPeriodId: string | null = null;
    let skipReason: string | null = null;
    if (!force) {
      const { data: existing } = await supabase
        .from('voting_periods')
        .select('id')
        .eq('is_closed', false)
        .maybeSingle();

      if (!existing) {
        // find next Monday (UTC date) using noon as a stable DST-check anchor
        // this cron runs on Monday, so daysToMonday must resolve to 0 that day, not wrap to 7
        const nextMondayNoon = new Date();
        const dayOfWeek = nextMondayNoon.getUTCDay();
        const daysToMonday = (8 - dayOfWeek) % 7;
        nextMondayNoon.setUTCDate(nextMondayNoon.getUTCDate() + daysToMonday);
        nextMondayNoon.setUTCHours(12, 0, 0, 0);

        // open: Monday 00:00 Eastern — EDT=UTC-4 → 04:00 UTC, EST=UTC-5 → 05:00 UTC
        const startOffsetHours = isEasternDST(nextMondayNoon) ? 4 : 5;
        const nextStart = new Date(nextMondayNoon);
        nextStart.setUTCHours(startOffsetHours, 0, 0, 0);

        // close: Sunday 23:55 Eastern — check DST for that Sunday at noon
        const nextSundayNoon = new Date(nextMondayNoon);
        nextSundayNoon.setUTCDate(nextSundayNoon.getUTCDate() + 6);
        const endOffsetHours = isEasternDST(nextSundayNoon) ? 4 : 5;
        // Sunday 23:55 ET = the following Monday at (offset-1):55 UTC
        const nextEnd = new Date(nextSundayNoon);
        nextEnd.setUTCDate(nextEnd.getUTCDate() + 1); // following Monday
        nextEnd.setUTCHours(endOffsetHours - 1, 55, 0, 0);

        const { data: recentPeriods } = await supabase
          .from('voting_periods')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(3);

        let excludedIds: string[] = [];
        if (recentPeriods && recentPeriods.length > 0) {
          const { data: recentCharities } = await supabase
            .from('voting_period_charities')
            .select('charity_id')
            .in('voting_period_id', recentPeriods.map((p) => p.id));
          excludedIds = recentCharities?.map((c) => c.charity_id) ?? [];
        }

        let charityQuery = supabase.from('charities').select('id').eq('is_approved', true);
        if (excludedIds.length > 0) {
          charityQuery = charityQuery.not('id', 'in', `(${excludedIds.join(',')})`);
        }

        const { data: eligible } = await charityQuery;

        // log the shortfall rather than skipping in silence.
        if (!eligible || eligible.length < 5) {
          console.log(
            `WARNING: did not create next voting period. Only ${eligible?.length ?? 0} eligible ` +
            `charities (need 5). ${excludedIds.length} excluded as used in the last 3 periods.`
          );
          skipReason =
            `only ${eligible?.length ?? 0} eligible charities, need 5 ` +
            `(${excludedIds.length} excluded as recently used)`;
        }

        if (eligible && eligible.length >= 5) {
          const selected = eligible.sort(() => Math.random() - 0.5).slice(0, 5);

          const { data: newPeriod, error: periodError } = await supabase
            .from('voting_periods')
            .insert({
              start_date: nextStart.toISOString(),
              end_date: nextEnd.toISOString(),
              is_closed: false,
            })
            .select()
            .single();

          if (!periodError && newPeriod) {
            const selectedIds = selected.map((c) => c.id);
            await supabase.from('voting_period_charities').insert(
              selectedIds.map((id) => ({ voting_period_id: newPeriod.id, charity_id: id }))
            );
            nextPeriodId = newPeriod.id;

            const [{ data: newPeriodProfiles }, { data: nominatorRows }] = await Promise.all([
              supabase.from('profiles').select('user_id, expo_push_token').not('expo_push_token', 'is', null),
              supabase.from('nominations').select('user_id, charity_id, charities(name)').in('charity_id', selectedIds).eq('status', 'approved'),
            ]);

            const validNewProfiles = (newPeriodProfiles ?? []).filter((p: any) =>
              p.expo_push_token?.startsWith('ExponentPushToken[')
            );
            const newPeriodUserIds = validNewProfiles.map((p: any) => p.user_id);

            const { data: newCounts } = await supabase.rpc('increment_notification_count', {
              user_ids: newPeriodUserIds,
            });
            const newCountMap = new Map((newCounts ?? []).map((r: any) => [r.user_id, r.new_count]));

            const profileTokenMap = new Map(validNewProfiles.map((p: any) => [p.user_id, p.expo_push_token]));

            const broadcastMsgs = validNewProfiles.map((p: any) => ({
              to: p.expo_push_token,
              title: 'New Vote Is Open!',
              body: "This week's 5 charities are ready. Cast your vote now!",
              badge: newCountMap.get(p.user_id) ?? 1,
              data: { type: 'new_voting_period', voting_period_id: newPeriod.id },
            }));

            const nominatorMsgs = (nominatorRows ?? [])
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
              .filter(Boolean);

            const allNewPeriodMsgs = [...broadcastMsgs, ...nominatorMsgs];
            if (allNewPeriodMsgs.length > 0) {
              await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify(allNewPeriodMsgs),
              });
            }
          }
        }
      }
    }

    // roll donations from zero-vote periods into the new period.
    let donationsRolledOver = 0;
    let rolloverPending = false;
    if (zeroVotePeriodIds.length > 0) {
      if (nextPeriodId) {
        const { data: moved, error: moveError } = await supabase
          .from('user_donations')
          .update({ voting_period_id: nextPeriodId, charity_id: null })
          .in('voting_period_id', zeroVotePeriodIds)
          .select('id');

        if (moveError) {
          console.log('Donation rollover failed:', moveError.message);
        } else {
          donationsRolledOver = moved?.length ?? 0;
          console.log(
            `Rolled ${donationsRolledOver} donation(s) from ${zeroVotePeriodIds.length} ` +
            `zero-vote period(s) into ${nextPeriodId}.`
          );
        }
      } else {
        // No next period was created, so there is nowhere to roll them to.
        rolloverPending = true;
        console.log(
          `WARNING: ${zeroVotePeriodIds.length} zero-vote period(s) closed but no next ` +
          `period was created, so donations could not roll over. Periods: ${zeroVotePeriodIds.join(', ')}`
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        periods_closed: results.length,
        results,
        ...(nextPeriodId ? { next_period_id: nextPeriodId } : {}),
        ...(skipReason ? { next_period_not_created: skipReason } : {}),
        ...(zeroVotePeriodIds.length > 0
          ? { zero_vote_periods: zeroVotePeriodIds.length, donations_rolled_over: donationsRolledOver }
          : {}),
        ...(rolloverPending ? { warning: 'zero-vote donations not rolled over: no next period was created' } : {}),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
