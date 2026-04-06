// supabase/functions/search-charities/index.ts
// Searches Supabase DB first, then charityapi.org for non-matching results.
// EINs in the DB are stored as raw digits (e.g. 123456789), no dashes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHARITYAPI_BASE = "https://api.charityapi.org/api";

const isEIN = (s: string): boolean => /^\d{2}-?\d{7}$/.test(s.trim());
const stripEIN = (s: string): string => s.replace(/-/g, "").trim();
const formatEIN = (s: string): string => {
  const raw = stripEIN(s);
  return raw.length === 9 ? `${raw.slice(0, 2)}-${raw.slice(2)}` : raw;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { query } = await req.json();

  if (!query || query.trim().length < 2) {
    return new Response(
      JSON.stringify({ error: "query must be at least 2 characters" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const apiKey = Deno.env.get("CHARITYAPI_KEY")!;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const trimmed = query.trim();
  const queryIsEIN = isEIN(trimmed);
  const rawEIN = queryIsEIN ? stripEIN(trimmed) : null;

  // search Supabase first 
  let dbQuery = supabase
    .from("charities")
    .select("id, name, ein, logo_url, category")
    .eq("is_approved", true);

  if (queryIsEIN) {
    dbQuery = dbQuery.eq("ein", rawEIN);
  } else {
    dbQuery = dbQuery.ilike("name", `%${trimmed}%`);
  }

  const { data: dbResults, error: dbError } = await dbQuery.limit(10);

  console.log(`DB results count: ${dbResults?.length ?? 0}, error: ${JSON.stringify(dbError)}`);

  // store DB EINs as raw digits for comparison
  const dbEins = new Set((dbResults ?? []).map((c: any) => stripEIN(String(c.ein ?? ""))));

  const dbMapped = (dbResults ?? []).map((c: any) => ({
    name: c.name,
    ein: formatEIN(String(c.ein ?? "")),
    city: null,
    state: null,
    inDatabase: true,
    logo_url: c.logo_url ?? null,
  }));

  // search charityapi.org 
  let orgs: any[] = [];

  try {
    if (queryIsEIN) {
      const url = `${CHARITYAPI_BASE}/organizations/${encodeURIComponent(rawEIN!)}`;
      const res = await fetch(url, { headers: { apikey: apiKey } });
      console.log(`EIN lookup status: ${res.status}`);
      const rawText = await res.text();
      console.log(`EIN lookup response: ${rawText.slice(0, 500)}`);
      if (res.ok) {
        const parsed = JSON.parse(rawText);
        const inner = parsed?.data ?? parsed;
        orgs = Array.isArray(inner) ? inner : inner ? [inner] : [];
      }
    } else {
      const url = `${CHARITYAPI_BASE}/organizations/search/${encodeURIComponent(trimmed)}`;
      const res = await fetch(url, { headers: { apikey: apiKey } });
      console.log(`Name search status: ${res.status}`);
      const rawText = await res.text();
      console.log(`Name search response: ${rawText.slice(0, 500)}`);
      if (res.ok) {
        const parsed = JSON.parse(rawText);
        const inner = parsed?.data ?? parsed;
        orgs = Array.isArray(inner) ? inner : [];
      }
    }
  } catch (err) {
    console.log("CharityAPI error:", err);
  }

  // map charityapi.org results using raw digit EINs for comparison
  const apiMapped = orgs
    .filter((o: any) => o.name?.trim() && o.ein?.trim())
    .map((o: any) => {
      const ein = stripEIN(String(o.ein));
      return {
        name: o.name.trim(),
        ein: formatEIN(ein),
        city: o.city ?? null,
        state: o.state ?? null,
        inDatabase: dbEins.has(ein),
        logo_url: null,
      };
    })
    .slice(0, 20);

  // merge: DB results first, then API results not already in DB
  const apiOnlyResults = apiMapped.filter((r: any) => !dbEins.has(stripEIN(r.ein)));
  const results = [...dbMapped, ...apiOnlyResults];

  console.log(`Final results count: ${results.length}, db: ${dbMapped.length}, api-only: ${apiOnlyResults.length}`);

  return new Response(
    JSON.stringify({ results }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
