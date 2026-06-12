import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* no body is fine for scheduled calls */ }

    const force = body?.force ?? false;
    const forcePeriodId = body?.period_id ?? null;
    const now = new Date().toISOString();

    let expiredPeriods;
    if (force && forcePeriodId) {
      const { data, error } = await supabase
        .from('voting_periods')
        .select('id')
        .eq('id', forcePeriodId)
        .eq('is_closed', false);
      if (error) throw error;
      expiredPeriods = data;
    } else {
      const { data, error } = await supabase
        .from('voting_periods')
        .select('id')
        .eq('is_closed', false)
        .lt('end_date', now);
      if (error) throw error;
      expiredPeriods = data;
    }

    if (!expiredPeriods || expiredPeriods.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No expired periods to close' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    const results = [];

    for (const period of expiredPeriods) {
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

      const winner = voteCounts.reduce((best, current) =>
        current.votes > best.votes ? current : best
      );

      const { error: updateError } = await supabase
        .from('voting_periods')
        .update({ is_closed: true, winner_charity_id: winner.charity_id })
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
      });
    }

    // when running on schedule (not admin force-close), automatically create next week's period.
    // the new period starts next Monday 05:00 UTC so the 5-hour dead phase (Sun 23:55–Mon 05:00) is preserved.
    let nextPeriodId: string | null = null;
    if (!force) {
      const { data: existing } = await supabase
        .from('voting_periods')
        .select('id')
        .eq('is_closed', false)
        .maybeSingle();

      if (!existing) {
        // open Monday 05:00 UTC = midnight EST / 1 AM EDT
        // gives admin ~5 hours after Sunday close to record and send the donation
        const nextStart = new Date();
        const dayOfWeek = nextStart.getUTCDay();
        const daysToMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
        nextStart.setUTCDate(nextStart.getUTCDate() + daysToMonday);
        nextStart.setUTCHours(5, 0, 0, 0);

        // end: following Sunday 23:55 UTC (~7 PM EST / 8 PM EDT)
        const nextEnd = new Date(nextStart);
        nextEnd.setUTCDate(nextEnd.getUTCDate() + 6);
        nextEnd.setUTCHours(23, 55, 0, 0);

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

    return new Response(
      JSON.stringify({
        success: true,
        periods_closed: results.length,
        results,
        ...(nextPeriodId ? { next_period_id: nextPeriodId } : {}),
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
