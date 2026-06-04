import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

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

  const { voting_period_id, charity_id, amount, transaction_id, proof_url } = await req.json();

  if (!voting_period_id || !charity_id || !amount) {
    return new Response(JSON.stringify({ error: 'voting_period_id, charity_id, and amount are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { error: insertError } = await supabase
    .from('donations')
    .insert({
      voting_period_id,
      charity_id,
      amount: parseFloat(amount),
      transaction_id: transaction_id || null,
      proof_url: proof_url || null,
      donated_at: new Date().toISOString(),
    });

  if (insertError) {
    return new Response(JSON.stringify({ error: insertError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: charity } = await supabase
    .from('charities')
    .select('name')
    .eq('id', charity_id)
    .single();

  const charityName = charity?.name ?? 'this week\'s winning charity';
  const formattedAmount = parseFloat(amount).toFixed(2);

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, expo_push_token')
    .not('expo_push_token', 'is', null);

  const validProfiles = (profiles ?? []).filter((p: any) =>
    p.expo_push_token?.startsWith('ExponentPushToken[')
  );

  if (validProfiles.length > 0) {
    const userIds = validProfiles.map((p: any) => p.user_id);
    const { data: updatedCounts } = await supabase.rpc('increment_notification_count', {
      user_ids: userIds,
    });
    const countMap = new Map((updatedCounts ?? []).map((r: any) => [r.user_id, r.new_count]));

    const messages = validProfiles.map((p: any) => ({
      to: p.expo_push_token,
      title: 'Donation Sent!',
      body: `$${formattedAmount} was donated to ${charityName}. Thank you for voting!`,
      badge: countMap.get(p.user_id) ?? 1,
      data: { type: 'donation_recorded', voting_period_id, charity_id, amount: parseFloat(amount) },
    }));

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
  }

  return new Response(
    JSON.stringify({ success: true, notified: validProfiles.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
