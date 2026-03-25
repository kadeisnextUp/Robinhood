import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
  const body = await req.text();

  // verify the request actually came from Stripe
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature!, webhookSecret);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400,
    });
  }

  // handle successful payments
  if (event.type !== 'payment_intent.succeeded') {
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  // extract payment data
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const { user_id, voting_period_id } = paymentIntent.metadata;
  const amount = paymentIntent.amount;
  const transactionId = paymentIntent.id;

  // write to user_donations in Supabase
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { error } = await supabase
    .from('user_donations')
    .insert({
      user_id,
      voting_period_id,
      amount: amount / 100, // convert cents to dollars for the numeric column
      transaction_id: transactionId,
      charity_id: await getWinningCharityId(supabase, voting_period_id),
      donated_at: new Date().toISOString(),
    });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});

// helper function to get the current charity for this voting period
async function getWinningCharityId(supabase: any, votingPeriodId: string) {
  const { data } = await supabase
    .from('voting_period_charities')
    .select('charity_id')
    .eq('voting_period_id', votingPeriodId)
    .limit(1)
    .single();
  return data?.charity_id ?? null;
}