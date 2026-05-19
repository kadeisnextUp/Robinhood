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
  if (!response.ok || !data.access_token) {
    throw new Error(`PayPal auth failed: ${data.error_description || data.error || response.status}`);
  }
  return data.access_token;
}

Deno.serve(async (req) => {
  try {
    // verify auth and extract user from JWT — never trust userId from the request body
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

    const { amount } = await req.json();

    // validate amount: between $1.00 and $10,000.00
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed < 1.00 || parsed > 10000.00) {
      return new Response(JSON.stringify({ error: 'Amount must be between $1.00 and $10,000.00' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const safeAmount = parsed.toFixed(2);

    // get active voting period from Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: votingPeriod, error: periodError } = await supabase
      .from('voting_periods')
      .select('id')
      .eq('is_closed', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (periodError || !votingPeriod) {
      return new Response(JSON.stringify({ error: 'No active voting period' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const votingPeriodId = votingPeriod.id;

    // get PayPal access token
    const accessToken = await getPayPalAccessToken();

    // create the PayPal order
    const orderResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: safeAmount,
            },
            description: 'Weekly charity pool donation',
            // store user + voting period in custom_id so we have it at capture time
            custom_id: JSON.stringify({ user_id: user.id, voting_period_id: votingPeriodId }),
          },
        ],
        application_context: {
          brand_name: 'Fund-It',
          user_action: 'PAY_NOW',
          return_url: 'fundit://donate/success',
          cancel_url: 'fundit://donate/cancel',
        },
      }),
    });

    const order = await orderResponse.json();

    if (!orderResponse.ok) {
      throw new Error(order.message || 'Failed to create PayPal order');
    }

    // extract the approval URL that we send the user to
    const approvalUrl = order.links.find((l: any) => l.rel === 'approve')?.href;

    return new Response(JSON.stringify({ orderId: order.id, approvalUrl, votingPeriodId }), {
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
