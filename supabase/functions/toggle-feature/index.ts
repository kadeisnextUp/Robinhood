import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PUSH_MESSAGES: Record<string, {
  disable: { title: string; body: string } | null;
  enable: { title: string; body: string } | null;
}> = {
  voting_enabled: {
    disable: { title: 'Voting Paused', body: "Voting is temporarily paused. We'll notify you when it's back." },
    enable: { title: 'Voting is Back!', body: 'Voting has reopened — cast your vote now!' },
  },
  donating_enabled: {
    disable: { title: 'Donations Paused', body: "Donations are temporarily paused. We'll notify you when they resume." },
    enable: { title: 'Donations Resumed', body: "Donations are back open — support this week's charities!" },
  },
  nominations_enabled: {
    disable: { title: 'Nominations Closed', body: 'Charity nominations are temporarily closed.' },
    enable: { title: 'Nominations Open', body: 'Charity nominations are back — nominate your favorites!' },
  },
  maintenance_mode: {
    enable: { title: 'Scheduled Maintenance', body: "Fund-It is going down for maintenance. We'll be back shortly." },
    disable: { title: "We're Back!", body: 'Fund-It is back online. Thanks for your patience.' },
  },
};

const VALID_FEATURES = ['voting_enabled', 'donating_enabled', 'nominations_enabled', 'maintenance_mode'];

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // secret-key bypass for emergency access (e.g. locked out of admin account)
  const adminSecret = req.headers.get('x-admin-secret');
  const expectedSecret = Deno.env.get('TOGGLE_ADMIN_SECRET');
  const usingSecretBypass = expectedSecret && adminSecret === expectedSecret;

  if (!usingSecretBypass) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .single();

    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const { feature, enabled } = await req.json();

  if (!VALID_FEATURES.includes(feature) || typeof enabled !== 'boolean') {
    return new Response(JSON.stringify({ error: 'Invalid feature or value' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { error: updateError } = await supabase
    .from('app_config')
    .update({ [feature]: enabled, updated_at: new Date().toISOString() })
    .eq('id', true);

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const msgConfig = PUSH_MESSAGES[feature];
  const msg = enabled ? msgConfig?.enable : msgConfig?.disable;

  if (msg) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, expo_push_token')
      .not('expo_push_token', 'is', null);

    const validProfiles = (profiles ?? []).filter((p: any) =>
      p.expo_push_token?.startsWith('ExponentPushToken[')
    );

    if (validProfiles.length > 0) {
      const userIds = validProfiles.map((p: any) => p.user_id);
      const { data: updatedCounts } = await supabase.rpc('increment_notification_count', { user_ids: userIds });
      const countMap = new Map((updatedCounts ?? []).map((r: any) => [r.user_id, r.new_count]));

      const messages = validProfiles.map((p: any) => ({
        to: p.expo_push_token,
        title: msg.title,
        body: msg.body,
        badge: countMap.get(p.user_id) ?? 1,
        data: { type: 'feature_toggle', feature, enabled },
      }));

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
