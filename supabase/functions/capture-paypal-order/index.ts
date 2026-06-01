import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PAYPAL_BASE_URL = 'https://api-m.paypal.com';

async function getPayPalAccessToken(): Promise<string> {
  const clientId = Deno.env.get('PAYPAL_CLIENT_ID')!;
  const clientSecret = Deno.env.get('PAYPAL_CLIENT_SECRET')!;

  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  try {
    // verify auth and extract user from JWT
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

    // Only accept orderId from the client — userId and votingPeriodId come from the PayPal order's custom_id
    const { orderId } = await req.json();

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'orderId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getPayPalAccessToken();

    // capture the payment — this is what actually moves the money
    const captureResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const captureData = await captureResponse.json();

    if (!captureResponse.ok || captureData.status !== 'COMPLETED') {
      throw new Error(captureData.message || 'Payment capture failed');
    }

    // extract user_id and voting_period_id from the custom_id we set at order creation —
    // these are never trusted from the client request body
    const customIdRaw = captureData.purchase_units?.[0]?.custom_id;
    let userId: string;
    let votingPeriodId: string;
    try {
      const customId = JSON.parse(customIdRaw);
      userId = customId.user_id;
      votingPeriodId = customId.voting_period_id;
    } catch {
      throw new Error('Invalid order metadata');
    }

    // Verify the authenticated user is the one who created this order
    if (userId !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // pull out the data we need to log the donation
    const purchaseUnit = captureData.purchase_units[0];
    const capture = purchaseUnit.payments.captures[0];
    const amount = parseFloat(capture.amount.value);
    const transactionId = capture.id;

    // log to Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: insertError } = await supabase
      .from('user_donations')
      .insert({
        user_id: userId,
        voting_period_id: votingPeriodId,
        amount,
        transaction_id: transactionId,
        donated_at: new Date().toISOString(),
      });

    if (insertError) {
      throw new Error(insertError.message);
    }

    // send donation confirmation to the user
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .eq('user_id', userId)
      .single();

    if (userProfile?.expo_push_token?.startsWith('ExponentPushToken[')) {
      const { data: updatedCounts } = await supabase.rpc('increment_notification_count', {
        user_ids: [userId],
      });
      const newCount = updatedCounts?.[0]?.new_count ?? 1;

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: userProfile.expo_push_token,
          title: 'Donation Confirmed!',
          body: `Your $${amount.toFixed(2)} donation has been received. Thank you!`,
          badge: newCount,
          data: { type: 'donation_confirmed', transaction_id: transactionId, amount },
        }),
      });
    }

    return new Response(JSON.stringify({ success: true, transactionId, amount }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
