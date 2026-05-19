// supabase/functions/update-username/index.ts
// Server-side username update with enforced cooldown, format validation, and uniqueness check.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import filter from "https://esm.sh/leo-profanity@1.6.0";

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;
const COOLDOWN_DAYS = 5;

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

  const body = await req.json();
  const trimmed = typeof body.username === "string"
    ? body.username.trim().toLowerCase()
    : "";

  if (!USERNAME_REGEX.test(trimmed)) {
    return new Response(
      JSON.stringify({ error: "Username must be 3–20 characters: letters, numbers, _ and - only" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (filter.check(trimmed)) {
    return new Response(
      JSON.stringify({ error: "That username is not allowed" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // server-side cooldown check — client-side check is UX only, this is the real enforcement
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("username, username_updated_at")
    .eq("user_id", user.id)
    .single();

  if (profile?.username_updated_at) {
    const diffDays = (Date.now() - new Date(profile.username_updated_at).getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < COOLDOWN_DAYS) {
      const daysLeft = Math.ceil(COOLDOWN_DAYS - diffDays);
      return new Response(
        JSON.stringify({ error: `You can change your username again in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.` }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  if (profile?.username === trimmed) {
    return new Response(
      JSON.stringify({ success: true, username: trimmed }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("username")
    .eq("username", trimmed)
    .maybeSingle();

  if (existing) {
    return new Response(
      JSON.stringify({ error: "That username is already taken" }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ username: trimmed, username_updated_at: now })
    .eq("user_id", user.id);

  if (updateError) {
    return new Response(
      JSON.stringify({ error: updateError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, username: trimmed, updatedAt: now }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
