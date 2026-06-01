import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now = new Date();
    // 1-hour window centered on 8h from now — a cron running every hour hits this exactly once
    const windowStart = new Date(now.getTime() + 7.5 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 8.5 * 60 * 60 * 1000);

    const { data: endingSoon, error } = await supabase
      .from('voting_periods')
      .select('id')
      .eq('is_closed', false)
      .gte('end_date', windowStart.toISOString())
      .lte('end_date', windowEnd.toISOString());

    if (error) throw error;

    if (!endingSoon || endingSoon.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No periods ending in ~8 hours' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, expo_push_token')
      .not('expo_push_token', 'is', null);

    const validProfiles = (profiles ?? []).filter((p: any) =>
      p.expo_push_token?.startsWith('ExponentPushToken[')
    );

    if (validProfiles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No tokens to notify' }),
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
        title: 'Last Chance to Vote!',
        body: 'Voting closes in about 8 hours. Make your vote count!',
        badge: countMap.get(p.user_id) ?? 1,
        data: { type: 'voting_reminder' },
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
