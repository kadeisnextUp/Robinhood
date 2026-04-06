// supabase/functions/validate-and-nominate/index.ts
// Validates an EIN against charityapi.org then creates a nomination.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHARITYAPI_BASE = "https://api.charityapi.org/api";

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

  const { ein, name } = await req.json();

  if (!ein) {
    return new Response(JSON.stringify({ error: "ein is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("CHARITYAPI_KEY")!;
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // validate EIN against charityapi.org
  const einVal = ein.replace(/-/g, "");
  console.log(`Validating EIN: ${einVal}`);
  const apiRes = await fetch(`${CHARITYAPI_BASE}/organizations/${encodeURIComponent(einVal)}`, {
    headers: { apikey: apiKey },
  });

  console.log(`CharityAPI status: ${apiRes.status}`);
  const rawText = await apiRes.text();
  console.log(`CharityAPI response: ${rawText.slice(0, 500)}`);

  if (!apiRes.ok) {
    return new Response(
      JSON.stringify({ error: "Could not verify this charity. Please check the EIN and try again." }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    );
  }

  const apiParsed = JSON.parse(rawText);
  const apiInner = apiParsed?.data ?? apiParsed;
  const org = Array.isArray(apiInner) ? apiInner[0] : apiInner;

  console.log(`Parsed org: ${JSON.stringify(org)?.slice(0, 200)}`);

  if (!org || !org.ein) {
    return new Response(
      JSON.stringify({ error: "No charity found with that EIN." }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // store EIN as raw digits to match DB format
  const rawEin = org.ein.replace(/-/g, "");
  const charityName = name?.trim() || org.name?.trim() || "Unknown Charity";

  // check if charity already exists in DB
  const { data: existing } = await supabaseAdmin
    .from("charities")
    .select("id")
    .eq("ein", rawEin)
    .single();

  let charityId: string;

  if (existing) {
    charityId = existing.id;
  } else {
    // insert the charity with just name + EIN; admin fills the rest
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("charities")
      .insert({ name: charityName, ein: rawEin, is_approved: false })
      .select("id")
      .single();

    if (insertError) {
      console.log("Charity insert error:", JSON.stringify(insertError));
      return new Response(
        JSON.stringify({ error: "Failed to save charity: " + insertError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    charityId = inserted.id;
  }

  // insert nomination (unique constraint on user_id + charity_id prevents duplicates)
  const { error: nomError } = await supabaseAdmin
    .from("nominations")
    .insert({ user_id: user.id, charity_id: charityId, status: "pending" });

  if (nomError) {
    if (nomError.code === "23505") {
      // Unique violation — user already nominated this charity
      return new Response(
        JSON.stringify({ error: "You have already nominated this charity." }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: "Failed to submit nomination: " + nomError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, charityName, ein: rawEin }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
