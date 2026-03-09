import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    // creates a Supabase client with the service role key
    // service role bypasses RLS so this function can write to the database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // first get the last 3 voting periods
    const { data: recentPeriods, error: periodsError } = await supabase
      .from('voting_periods')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(3);

    if (periodsError) throw periodsError;

    // next build the exclusion list from recent periods
    let excludedCharityIds: string[] = [];

    if (recentPeriods && recentPeriods.length > 0) {
      const recentPeriodIds = recentPeriods.map((p) => p.id);

      const { data: recentCharities, error: recentError } = await supabase
        .from('voting_period_charities')
        .select('charity_id')
        .in('voting_period_id', recentPeriodIds);

      if (recentError) throw recentError;

      excludedCharityIds = recentCharities?.map((c) => c.charity_id) ?? [];
    }

    // then get all approved charities not on cooldown
    let query = supabase
      .from('charities')
      .select('id')
      .eq('is_approved', true);

    if (excludedCharityIds.length > 0) {
      query = query.not('id', 'in', `(${excludedCharityIds.join(',')})`);
    }

    const { data: eligibleCharities, error: charitiesError } = await query;

    if (charitiesError) throw charitiesError;

    if (!eligibleCharities || eligibleCharities.length < 5) {
      throw new Error(
        `Not enough eligible charities. Found ${eligibleCharities?.length ?? 0}, need at least 5.`
      );
    }

    // randomly pick 5 charities
    const shuffled = eligibleCharities.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 5);

    // create the new voting period starting this Monday at midnight
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const { data: newPeriod, error: periodError } = await supabase
      .from('voting_periods')
      .insert({
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        is_closed: false,
      })
      .select()
      .single();

    if (periodError) throw periodError;

    // insert the 5 selected charities for this period
    const votingPeriodCharities = selected.map((charity) => ({
      voting_period_id: newPeriod.id,
      charity_id: charity.id,
    }));

    const { error: insertError } = await supabase
      .from('voting_period_charities')
      .insert(votingPeriodCharities);

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        success: true,
        voting_period_id: newPeriod.id,
        charities_selected: selected.length,
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