// supabase/functions/import-charities/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHARITYAPI_BASE = "https://api.charityapi.org/api";

// detect if a string looks like an EIN (XX-XXXXXXX or XXXXXXXXX)
const isEIN = (s: string): boolean => /^\d{2}-?\d{7}$/.test(s.trim());

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { query, ein, state, city, count = 10 } = await req.json();

  if (!query && !ein) {
    return new Response(
      JSON.stringify({ error: "Either 'query' (name/term) or 'ein' is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const apiKey = Deno.env.get("CHARITYAPI_KEY")!;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let orgs: any[] = [];

  if (ein || (query && isEIN(query))) {
    // EIN lookup 
    const einVal = (ein || query).replace("-", "");
    const url = `${CHARITYAPI_BASE}/organizations/${encodeURIComponent(einVal)}`;
    const res = await fetch(url, { headers: { apikey: apiKey } });

    if (!res.ok) {
      const text = await res.text();
      return new Response(
        JSON.stringify({ error: "CharityAPI request failed", detail: text }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const parsed = await res.json();
    const inner = parsed?.data ?? parsed;
    orgs = Array.isArray(inner) ? inner : inner ? [inner] : [];
  } else {
    // name/term search with optional state and city filters
    const params = new URLSearchParams();
    if (state) params.set("state", state);
    if (city) params.set("city", city);

    const url = `${CHARITYAPI_BASE}/organizations/search/${encodeURIComponent(query)}?${params}`;
    const res = await fetch(url, { headers: { apikey: apiKey } });

    if (!res.ok) {
      const text = await res.text();
      return new Response(
        JSON.stringify({ error: "CharityAPI request failed", detail: text }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const parsed = await res.json();
    const inner = parsed?.data ?? parsed;
    orgs = Array.isArray(inner) ? inner : [];
  }

  // filter to records that have at minimum a name and EIN
  const valid = orgs
    .filter((o: any) => o.name?.trim() && o.ein?.trim())
    .slice(0, count);

  if (valid.length === 0) {
    return new Response(
      JSON.stringify({ inserted: 0, message: "No valid records found from CharityAPI for this query" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const rows = valid.map((o: any) => ({
    name: o.name.trim(),
    ein: o.ein.replace(/-/g, "").replace(/^(\d{2})(\d{7})$/, "$1-$2"),
    is_approved: false,
  }));

  const { data: inserted, error } = await supabase
    .from("charities")
    .upsert(rows, { onConflict: "ein", ignoreDuplicates: true })
    .select("id, name, ein");

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      inserted: inserted?.length ?? 0,
      skipped: valid.length - (inserted?.length ?? 0),
      charities: inserted,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
