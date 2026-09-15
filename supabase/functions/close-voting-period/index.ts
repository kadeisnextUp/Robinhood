import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { closeVotingPeriods, type PushMessage } from './rollover.ts';

// The period logic lives in rollover.ts, with the database client, clock and push
// sender passed in, so it can be tested without Deno or a live project.

async function sendExpoPush(messages: PushMessage[]): Promise<void> {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    throw new Error(`Expo push returned HTTP ${res.status}`);
  }
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Authorisation. config.toml sets verify_jwt = true, but that alone is not a
    // real gate: the anon key is itself a valid JWT and it ships inside every copy
    // of the app. Without this check anyone could force-close a live period,
    // declare a winner and back-fill donations to it.
    //
    // Two accepted callers:
    //   1. the pg_cron schedule, presenting CRON_SECRET in x-cron-secret
    //   2. a signed-in user whose profile has is_admin
    //
    // The schedule uses a dedicated secret rather than the service role key so a
    // leaked cron credential cannot read the whole database, and so this keeps
    // working across Supabase's legacy-JWT to sb_secret_ key migration.
    // Mirrors the x-admin-secret pattern in toggle-feature.
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedCronSecret = Deno.env.get('CRON_SECRET');
    const usingCronSecret = !!expectedCronSecret && cronSecret === expectedCronSecret;

    if (!usingCronSecret) {
      const authHeader = req.headers.get('Authorization') ?? '';
      const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();

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

    let body: any = {};
    try { body = await req.json(); } catch { /* no body is fine for scheduled calls */ }

    const outcome = await closeVotingPeriods(
      { supabase, now: new Date(), push: sendExpoPush },
      { force: body?.force ?? false, forcePeriodId: body?.period_id ?? null }
    );

    // A partial failure is a 500 so it stands out in the function's invocation
    // list and in net._http_response, rather than hiding behind success: true.
    return new Response(JSON.stringify(outcome), {
      status: outcome.success ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('close-voting-period failed:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
