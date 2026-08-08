// supabase/functions/update-charity/index.ts
// admin action: fills in the charity fields that approve-charity requires.
//
// Nominated and imported charities land with only name + ein, so the six-field
// gate in approve-charity blocks them until someone completes the row. Before
// this function that meant editing the table by hand in the Supabase dashboard.
//
// Validation lives here rather than only in the client because these values are
// rendered straight onto vote cards. Existing rows show what unvalidated writes
// produce: a category pasted into a name with a newline, a trailing newline
// inside a URL, and .svg logos that React Native cannot decode.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_NAME = 200;
const MAX_DESCRIPTION = 500;

// Categories render verbatim on the vote card, so they are a fixed set. The admin UI
// offers these as a picker, but a picker is not enforcement — check it here too.
// Keep in sync with CHARITY_CATEGORIES in app/admin.tsx.
const CATEGORIES = [
  "Animal Welfare",
  "American Indian",
  "Arts & Culture",
  "Children & Youth",
  "Civil Rights",
  "Community Development",
  "Disabilities",
  "Disaster Relief",
  "Education",
  "Elderly",
  "Environment",
  "Food Security",
  "Health & Medical",
  "Housing & Homelessness",
  "Human Services",
  "Legal & Public Interest",
  "Public Safety",
  "Relief & Development",
  "Religious",
  "Veterans & Military",
];

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Newlines in a name render verbatim on the vote card, so flatten all whitespace.
const cleanText = (value: string): string => value.replace(/\s+/g, " ").trim();

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

// Query strings and fragments are common on CDN-hosted logos, so ignore them
// when checking the extension.
const isSvg = (value: string): boolean =>
  value.split("?")[0].split("#")[0].toLowerCase().endsWith(".svg");

type Updates = Record<string, string | null>;

// Returns either the cleaned field or a human-readable reason to reject it.
// Only keys present in the request body are touched, so callers can PATCH one
// field without clearing the rest.
function buildUpdates(body: Record<string, unknown>): { updates: Updates } | { error: string } {
  const updates: Updates = {};

  if ("name" in body) {
    const name = cleanText(String(body.name ?? ""));
    if (!name) return { error: "Name cannot be empty." };
    if (name.length > MAX_NAME) return { error: `Name must be ${MAX_NAME} characters or fewer.` };
    updates.name = name;
  }

  if ("ein" in body) {
    // Stored inconsistently across the codebase: validate-and-nominate writes raw
    // 9 digits, import-charities writes dashed. Normalising here starts healing it.
    const ein = String(body.ein ?? "").replace(/[\s-]/g, "");
    if (!/^\d{9}$/.test(ein)) return { error: "EIN must be 9 digits." };
    updates.ein = ein;
  }

  if ("description" in body) {
    const description = String(body.description ?? "").trim();
    if (description.length > MAX_DESCRIPTION) {
      return { error: `Description must be ${MAX_DESCRIPTION} characters or fewer.` };
    }
    updates.description = description || null;
  }

  if ("category" in body) {
    const category = cleanText(String(body.category ?? ""));
    // Empty clears it, which re-blocks approval. That is intentional: it is how an
    // older free-text value gets forced through the picker on the next edit.
    if (category && !CATEGORIES.includes(category)) {
      return { error: `"${category}" is not a valid category.` };
    }
    updates.category = category || null;
  }

  if ("website_url" in body) {
    const website = String(body.website_url ?? "").trim();
    if (website && !isHttpsUrl(website)) return { error: "Website must be a valid https:// URL." };
    updates.website_url = website || null;
  }

  if ("logo_url" in body) {
    const logo = String(body.logo_url ?? "").trim();
    if (logo) {
      if (!isHttpsUrl(logo)) return { error: "Logo must be a valid https:// URL." };
      // React Native's <Image> cannot decode SVG and the card renders blank.
      if (isSvg(logo)) {
        return { error: "SVG logos do not render in the app. Upload a PNG or JPEG instead." };
      }
    }
    updates.logo_url = logo || null;
  }

  if (Object.keys(updates).length === 0) return { error: "No fields to update." };
  return { updates };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // verify caller is admin — the gateway's verify_jwt only proves they are signed in
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  if (!profile?.is_admin) return json({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Invalid request body" }, 400);

  const { charity_id, ...fields } = body as Record<string, unknown>;
  if (!charity_id) return json({ error: "charity_id is required" }, 400);

  const { data: charity, error: charityErr } = await supabaseAdmin
    .from("charities")
    .select("id, is_approved")
    .eq("id", charity_id)
    .single();

  if (charityErr || !charity) return json({ error: "Charity not found" }, 404);

  // An approved charity can be live in an open voting period right now. Editing
  // it would change a vote card mid-week, so unapprove it first if you must.
  if (charity.is_approved) {
    return json(
      { error: "This charity is approved and may be live in a voting period. Unapprove it before editing." },
      409
    );
  }

  const built = buildUpdates(fields);
  if ("error" in built) return json({ error: built.error }, 422);

  const { error: updateError } = await supabaseAdmin
    .from("charities")
    .update(built.updates)
    .eq("id", charity_id);

  if (updateError) {
    // 23505 is a unique violation, which here means the EIN belongs to another row.
    if (updateError.code === "23505") {
      return json({ error: "Another charity already uses that EIN." }, 409);
    }
    return json({ error: "Failed to update charity: " + updateError.message }, 500);
  }

  return json({ success: true, updated: Object.keys(built.updates) }, 200);
});
