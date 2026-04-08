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
    const { orderId, userId, votingPeriodId } = await req.json();

    if (!orderId || !userId || !votingPeriodId) {
      return new Response(JSON.stringify({ error: 'orderId, userId, and votingPeriodId are required' }), {
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