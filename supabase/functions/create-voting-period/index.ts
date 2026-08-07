import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {

    // creates a Supabase client with the service role key
    // service role bypasses RLS so this function can write to the database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Authorisation. config.toml sets verify_jwt = true, but that alone is not a
    // real gate: the anon key is itself a valid JWT and it ships inside every copy
    // of the app, so the gateway would accept any caller. Opening a voting period
    // is an admin action, so check it here.
    //
    // Two accepted callers:
    //   1. a signed-in user whose profile has is_admin
    //   2. a server-side caller presenting the service role key (scheduled jobs)
    const authHeader = req.headers.get('Authorization') ?? '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    const isServiceRole = bearer === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!isServiceRole) {
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
    // guard: don't create a new period if one is already open
    const { data: existingPeriod } = await supabase
      .from('voting_periods')
      .select('id')
      .eq('is_closed', false)
      .single();

    if (existingPeriod) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'A voting period is already open. Close it before creating a new one.' 
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

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

    

    const now = new Date();

    // start: today at midnight UTC
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);

    // end: the coming Sunday at 23:55 UTC (same day if today is Sunday)
    const end = new Date(start);
    const daysUntilSunday = (7 - end.getUTCDay()) % 7 || 7;
    end.setUTCDate(end.getUTCDate() + daysUntilSunday);
    end.setUTCHours(23, 55, 0, 0);


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

    const selectedIds = selected.map((c) => c.id);

    const [{ data: allProfiles }, { data: nominatorRows }] = await Promise.all([
      supabase.from('profiles').select('user_id, expo_push_token').not('expo_push_token', 'is', null),
      supabase.from('nominations').select('user_id, charity_id, charities(name)').in('charity_id', selectedIds).eq('status', 'approved'),
    ]);

    const validProfiles = (allProfiles ?? []).filter((p: any) =>
      p.expo_push_token?.startsWith('ExponentPushToken[')
    );

    const broadcastMsgs = validProfiles.map((p: any) => ({
      to: p.expo_push_token,
      title: 'New Vote Is Open!',
      body: "This week's 5 charities are ready. Cast your vote now!",
      data: { type: 'new_voting_period', voting_period_id: newPeriod.id },
    }));

    const profileTokenMap = new Map((allProfiles ?? []).map((p: any) => [p.user_id, p.expo_push_token]));
    const nominatorMsgs = (nominatorRows ?? [])
      .map((n: any) => {
        const token = profileTokenMap.get(n.user_id);
        if (!token?.startsWith('ExponentPushToken[')) return null;
        const charityName = n.charities?.name ?? 'Your nominated charity';
        return {
          to: token,
          title: "Your charity is in this week's vote!",
          body: `${charityName} was selected for this week's voting round. Go vote!`,
          data: { type: 'charity_selected', charity_id: n.charity_id, voting_period_id: newPeriod.id },
        };
      })
      .filter(Boolean);

    const allMsgs = [...broadcastMsgs, ...nominatorMsgs];
    if (allMsgs.length > 0) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(allMsgs),
      });
    }

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