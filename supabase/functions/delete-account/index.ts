// supabase/functions/delete-account/index.ts
// Permanent account deletion, required by App Store guideline 5.1.1(v).
//
// Removes the user's identity and everything that reveals which causes they
// backed, but keeps donation rows as anonymous financial history — a deleted
// user must not erase the ledger the weekly payouts are reconciled against.
//
// Every step is idempotent (each one matches nothing on a second run), so a
// partial failure is safe to retry rather than leaving the account unusable.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // The id always comes from the verified JWT, never from the request body —
  // there is no way to ask this function to delete somebody else.
  const userId = user.id;

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Donations are financial records and are kept, but stop pointing at a person.
  // This runs first on purpose: if it fails, nothing has been deleted yet and the
  // account is still intact, rather than the auth delete cascading the ledger away.
  const { error: donationError } = await supabaseAdmin
    .from("user_donations")
    .update({ user_id: null })
    .eq("user_id", userId);

  if (donationError) {
    console.error("delete-account: could not anonymize user_donations", donationError);
    return json({
      error:
        "Could not anonymize donation history, so nothing was deleted. " +
        "user_donations.user_id must be nullable.",
    }, 500);
  }

  // Votes and nominations are personal — they reveal which causes the user backed.
  for (const table of ["votes", "nominations"] as const) {
    const { error } = await supabaseAdmin.from(table).delete().eq("user_id", userId);
    if (error) {
      console.error(`delete-account: could not delete ${table}`, error);
      return json({ error: `Could not delete ${table}. Nothing else was removed.` }, 500);
    }
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .delete()
    .eq("user_id", userId);

  if (profileError) {
    console.error("delete-account: could not delete profile", profileError);
    return json({ error: "Could not delete profile. The account still exists." }, 500);
  }

  // Last, because it is the only step that cannot be retried once it succeeds.
  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    console.error("delete-account: could not delete auth user", authDeleteError);
    return json({
      error: "Your data was removed but the login could not be deleted. Contact support.",
    }, 500);
  }

  return json({ success: true }, 200);
});
