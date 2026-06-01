import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

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

    const { data: voters } = await supabase
      .from('votes')
      .select('user_id')
      .eq('voting_period_id', activePeriod.id);

    const voterIds = new Set((voters ?? []).map((v: any) => v.user_id));

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, expo_push_token')
      .not('expo_push_token', 'is', null);

    const validProfiles = (profiles ?? []).filter((p: any) =>
      !voterIds.has(p.user_id) && p.expo_push_token?.startsWith('ExponentPushToken[')
    );

    if (validProfiles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'All users have already voted' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userIds = validProfiles.map((p: any) => p.user_id);
    const { data: updatedCounts } = await supabase.rpc('increment_notification_count', {
      user_ids: userIds,
    });
    const countMap = new Map((updatedCounts ?? []).map((r: any) => [r.user_id, r.new_count]));

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(validProfiles.map((p: any) => ({
        to: p.expo_push_token,
        title: "Don't forget to vote!",
        body: "You haven't voted yet this week. Pick your charity before voting closes!",
        badge: countMap.get(p.user_id) ?? 1,
        data: { type: 'midweek_reminder', voting_period_id: activePeriod.id },
      }))),
    });

    return new Response(
      JSON.stringify({ success: true, notified: validProfiles.length }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
