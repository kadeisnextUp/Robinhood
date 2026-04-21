import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // only run if there's an active voting period
    const { data: activePeriod, error: periodError } = await supabase
      .from('voting_periods')
      .select('id')
      .eq('is_closed', false)
      .maybeSingle();

    if (periodError) throw periodError;

    if (!activePeriod) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active voting period' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // get all users who have already voted this period
    const { data: voters } = await supabase
      .from('votes')
      .select('user_id')
      .eq('voting_period_id', activePeriod.id);

    const voterIds = new Set((voters ?? []).map((v: any) => v.user_id));

    // get all users with push tokens who haven't voted yet
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, expo_push_token')
      .not('expo_push_token', 'is', null);

    const tokens = (profiles ?? [])
      .filter((p: any) => !voterIds.has(p.user_id) && p.expo_push_token?.startsWith('ExponentPushToken['))
      .map((p: any) => p.expo_push_token);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'All users have already voted' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(tokens.map((token: string) => ({
        to: token,
        title: "Don't forget to vote!",
        body: "You haven't voted yet this week. Pick your charity before voting closes!",
        data: { type: 'midweek_reminder', voting_period_id: activePeriod.id },
      }))),
    });

    return new Response(
      JSON.stringify({ success: true, notified: tokens.length }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
