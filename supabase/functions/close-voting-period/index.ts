import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Step 1: Find all open voting periods that have passed their end date
    const now = new Date().toISOString();

    const { data: expiredPeriods, error: periodsError } = await supabase
      .from('voting_periods')
      .select('id')
      .eq('is_closed', false)
      .lt('end_date', now);

    if (periodsError) throw periodsError;

    if (!expiredPeriods || expiredPeriods.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No expired periods to close' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    const results = [];

    for (const period of expiredPeriods) {

      // Step 2: Get all charities in this period
      const { data: periodCharities, error: charitiesError } = await supabase
        .from('voting_period_charities')
        .select('charity_id')
        .eq('voting_period_id', period.id);

      if (charitiesError) throw charitiesError;

      // Step 3: Count votes for each charity in this period
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

      // Step 4: Find the winner — charity with the most votes
      const winner = voteCounts.reduce((best, current) =>
        current.votes > best.votes ? current : best
      );

      // Step 5: Close the voting period and record the winner
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