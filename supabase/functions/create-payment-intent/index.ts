import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';

// initialize Stripe 
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

Deno.serve(async (req) => {
  try {
    // recieve the request
    const { amount, userId } = await req.json();

    // check minimum amount ($1.00)
    if (!amount || amount < 100) {
      return new Response(JSON.stringify({ error: 'Minimum donation is $1.00' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // get active voting period
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: votingPeriodId } = await supabase
      .rpc('get_active_voting_period');

    if (!votingPeriodId) {
      return new Response(JSON.stringify({ error: 'No active voting period' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // create Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount, // in cents
      currency: 'usd',
      metadata: {
        user_id: userId,
        voting_period_id: votingPeriodId,
      },
    });

    return new Response(JSON.stringify({ clientSecret: paymentIntent.client_secret }), {
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