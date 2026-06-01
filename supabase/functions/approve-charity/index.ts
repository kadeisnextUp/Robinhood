// supabase/functions/approve-charity/index.ts
// admin action: approves a nominated charity and notifies all nominators.
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

  // verify caller is admin
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

  // fetch charity to confirm all required columns are filled
  const { data: charity, error: charityErr } = await supabaseAdmin
    .from("charities")
    .select("id, name, description, logo_url, website_url, category, ein")
    .eq("id", charity_id)
    .single();

  if (charityErr || !charity) {
    return new Response(JSON.stringify({ error: "Charity not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const missing = ["name", "description", "logo_url", "website_url", "category", "ein"].filter(
    (col) => !charity[col as keyof typeof charity]
  );

  if (missing.length > 0) {
    return new Response(
      JSON.stringify({ error: `Cannot approve: missing fields: ${missing.join(", ")}` }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    );
  }

  // approve the charity
  await supabaseAdmin
    .from("charities")
    .update({ is_approved: true })
    .eq("id", charity_id);

  // get pending nominators before updating status
  const { data: nominations } = await supabaseAdmin
    .from("nominations")
    .select("user_id")
    .eq("charity_id", charity_id)
    .eq("status", "pending");

  // update all pending nominations to approved
  await supabaseAdmin
    .from("nominations")
    .update({ status: "approved" })
    .eq("charity_id", charity_id)
    .eq("status", "pending");

  // send push notifications to all nominators
  if (nominations && nominations.length > 0) {
    const userIds = nominations.map((n: any) => n.user_id);

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, expo_push_token")
      .in("user_id", userIds)
      .not("expo_push_token", "is", null);

    const validProfiles = (profiles ?? []).filter((p: any) =>
      p.expo_push_token?.startsWith("ExponentPushToken[")
    );

    if (validProfiles.length > 0) {
      const recipientIds = validProfiles.map((p: any) => p.user_id);
      const { data: updatedCounts } = await supabaseAdmin.rpc("increment_notification_count", {
        user_ids: recipientIds,
      });
      const countMap = new Map((updatedCounts ?? []).map((r: any) => [r.user_id, r.new_count]));

      const messages = validProfiles.map((p: any) => ({
        to: p.expo_push_token,
        title: "Nomination Approved!",
        body: `${charity.name} has been approved and is now eligible for voting.`,
        badge: countMap.get(p.user_id) ?? 1,
        data: { type: "nomination_update", status: "approved", charity_id },
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
