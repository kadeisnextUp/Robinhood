import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PAYPAL_IPN_VERIFY_URL = 'https://ipnpb.paypal.com/cgi-bin/webscr';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const rawBody = await req.text();

    // send IPN data back to PayPal for verification
    const verifyResponse = await fetch(PAYPAL_IPN_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'FundIt-IPN-Verifier/1.0',
      },
      body: `cmd=_notify-validate&${rawBody}`,
    });

    const verifyResult = await verifyResponse.text();

    if (verifyResult !== 'VERIFIED') {
      console.error('IPN verification failed:', verifyResult, 'body:', rawBody);
      // return 200 — returning non-200 causes PayPal to retry indefinitely
      return new Response('OK', { status: 200 });
    }

    const params = new URLSearchParams(rawBody);

    // only process completed payments — ignore Pending, Refunded, Reversed, etc.
    const paymentStatus = params.get('payment_status');
    if (paymentStatus !== 'Completed') {
      console.log('Skipping IPN with payment_status:', paymentStatus);
      return new Response('OK', { status: 200 });
    }

    // only accept USD for now
    if (params.get('mc_currency') !== 'USD') {
      console.log('Skipping non-USD IPN');
      return new Response('OK', { status: 200 });
    }

    const txnId = params.get('txn_id');
    const mcGross = params.get('mc_gross');
    const userId = params.get('custom');

    if (!txnId || !mcGross || !userId) {
      console.error('Missing required IPN fields — txn_id:', txnId, 'mc_gross:', mcGross, 'custom:', userId);
      return new Response('OK', { status: 200 });
    }

    const amount = parseFloat(mcGross);
    if (isNaN(amount) || amount < 1.00) {
      console.error('Invalid amount from IPN:', mcGross);
      return new Response('OK', { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // idempotency check — PayPal may send duplicate IPNs
    const { data: existing } = await supabase
      .from('user_donations')
      .select('id')
      .eq('transaction_id', txnId)
      .maybeSingle();

    if (existing) {
      console.log('Duplicate IPN ignored, transaction already recorded:', txnId);
      return new Response('OK', { status: 200 });
    }

    // verify the user exists in our system before recording anything
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('user_id, expo_push_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (!userProfile) {
      console.error('IPN received for unknown user_id:', userId);
      return new Response('OK', { status: 200 });
    }

    // get the active voting period
    const { data: votingPeriod } = await supabase
      .from('voting_periods')
      .select('id')
      .eq('is_closed', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!votingPeriod) {
      console.error('IPN received but no active voting period found');
      return new Response('OK', { status: 200 });
    }

    // record the donation
    const { error: insertError } = await supabase
      .from('user_donations')
      .insert({
        user_id: userId,
        voting_period_id: votingPeriod.id,
        amount,
        transaction_id: txnId,
        donated_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Failed to insert donation:', insertError.message);
      throw new Error(insertError.message);
    }

    // notify the user via push notification
    if (userProfile.expo_push_token?.startsWith('ExponentPushToken[')) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: userProfile.expo_push_token,
          title: 'Donation Confirmed!',
          body: `Your $${amount.toFixed(2)} donation has been added to this week's pool!`,
          data: { type: 'donation_confirmed', transaction_id: txnId, amount },
        }),
      });
    }

    console.log(`Donation recorded: $${amount.toFixed(2)} from user ${userId}, txn ${txnId}`);
    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('IPN handler error:', error.message);
    // always 200 — non-200 triggers PayPal retry loops
    return new Response('OK', { status: 200 });
  }
});
