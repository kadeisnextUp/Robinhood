import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const force = body?.force ?? false;
    const forcePeriodId = body?.period_id ?? null;
    const now = new Date().toISOString();

    let expiredPeriods;
    // force close through admin page 
    if (force && forcePeriodId) {
      const { data, error } = await supabase
        .from('voting_periods')
        .select('id')
        .eq('id', forcePeriodId)
        .eq('is_closed', false);
      if (error) throw error;
      expiredPeriods = data;
    } else {
      // normal close 
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

          return {
            charity_id: item.charity_id,
            votes: count ?? 0,
          };
        })
      );

      const winner = voteCounts.reduce((best, current) =>
        current.votes > best.votes ? current : best
      );

      const { error: updateError } = await supabase
        .from('voting_periods')
        .update({
          is_closed: true,
          winner_charity_id: winner.charity_id,
        })
        .eq('id', period.id);

      if (updateError) throw updateError;

      results.push({
        period_id: period.id,
        winner_charity_id: winner.charity_id,
        winning_votes: winner.votes,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        periods_closed: results.length,
        results,
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