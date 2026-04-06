// supabase/functions/reject-charity/index.ts
// Admin action: rejects a nominated charity and notifies all nominators.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify caller is admin
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  if (!profile?.is_admin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { charity_id } = await req.json();
  if (!charity_id) {
    return new Response(JSON.stringify({ error: "charity_id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch charity name for the notification
  const { data: charity } = await supabaseAdmin
    .from("charities")
    .select("name")
    .eq("id", charity_id)
    .single();

  // Get pending nominators before updating status
  const { data: nominations } = await supabaseAdmin
    .from("nominations")
    .select("user_id")
    .eq("charity_id", charity_id)
    .eq("status", "pending");

  // Update all pending nominations to rejected
  await supabaseAdmin
    .from("nominations")
    .update({ status: "rejected" })
    .eq("charity_id", charity_id)
    .eq("status", "pending");

  // Send push notifications to all nominators
  if (nominations && nominations.length > 0) {
    const userIds = nominations.map((n: any) => n.user_id);

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("expo_push_token")
      .in("user_id", userIds)
      .not("expo_push_token", "is", null);

    const tokens = (profiles ?? [])
      .map((p: any) => p.expo_push_token)
      .filter((t: string) => t?.startsWith("ExponentPushToken["));

    if (tokens.length > 0) {
      const messages = tokens.map((token: string) => ({
        to: token,
        title: "Nomination Update",
        body: `Your nomination for ${charity?.name ?? "a charity"} was not approved at this time.`,
        data: { type: "nomination_update", status: "rejected", charity_id },
      }));

      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });
    }
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
