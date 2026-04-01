// supabase/functions/import-charities/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EVERY_ORG_BASE = "https://partners.every.org/v0.2";

const CATEGORY_MAP: Record<string, string[]> = {
  "Environment":             ["environment", "climate", "conservation", "oceans", "water", "wildlife", "parks"],
  "Healthcare":              ["health", "disease", "mental-health", "womens-health", "research"],
  "Food Security":           ["food-security"],
  "Animal Welfare":          ["animals", "cats", "dogs", "wildlife"],
  "Education":               ["education", "libraries", "science", "research"],
  "Human Rights":            ["humans", "justice", "racial-justice", "gender-equality", "votingrights", "freepress"],
  "Disaster Relief":         ["wildfires", "hurricane-ian", "coronavirus", "ukraine", "refugees"],
  "Housing & Homelessness":  ["housing", "poverty"],
  "American Indian":         ["indigenous-peoples", "indigenous-led"],
  "Arts & Culture":          ["art", "culture", "dance", "music", "theater", "filmandtv", "museums", "radio"],
  "Health & Medical":        ["health", "disease", "cancer", "mental-health", "research"],
  "Disabilities":            ["disabilities", "autism"],
  "Children & Youth":        ["youth", "adoption"],
  "Civil Rights":            ["justice", "racial-justice", "votingrights", "gender-equality", "lgbt", "transgender"],
  "Community Development":   ["humans", "poverty", "immigrants", "refugees"],
  "Elderly":                 ["seniors"],
  "Human Services":          ["humans", "poverty", "mental-health", "refugees", "immigrants"],
  "Legal & Public Interest": ["legal", "justice", "freepress", "votingrights"],
  "Public Safety":           ["humans", "justice"],
  "Religious":               ["religion", "christianity", "islam", "judaism", "hinduism", "buddhism"],
  "Veterans & Military":     ["veterans"],
  "Relief & Development":    ["refugees", "immigrants", "ukraine", "afghanistan", "hurricane-ian", "wildfires"],
};

const isComplete = (org: any): boolean => {
  return (
    !!org.name?.trim() &&
    !!org.ein?.trim() &&
    !!org.description?.trim() &&
    !!org.logoUrl?.trim() &&
    !!org.websiteUrl?.trim()
  );
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { category, count = 10 } = await req.json();

  if (!category) {
    return new Response(
      JSON.stringify({ error: "category is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const causes = CATEGORY_MAP[category];

  if (!causes) {
    return new Response(
      JSON.stringify({
        error: `Unknown category: "${category}". Valid options are: ${Object.keys(CATEGORY_MAP).join(", ")}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch more than requested to account for incomplete records being filtered out
  const fetchCount = Math.min(count * 3, 100);

  const params = new URLSearchParams({
    causes: causes.join(","),
    take: String(fetchCount),
    apiKey: Deno.env.get("EVERY_ORG_API_KEY")!,
  });

  const url = `${EVERY_ORG_BASE}/search/${encodeURIComponent(category)}?${params}`;
  const everyOrgRes = await fetch(url);

  if (!everyOrgRes.ok) {
    const text = await everyOrgRes.text();
    return new Response(
      JSON.stringify({ error: "Every.org API request failed", detail: text }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  const data = await everyOrgRes.json();
  const nonprofits = data.nonprofits ?? [];

  // Filter to only complete records then trim to requested count
  const complete = nonprofits
    .filter(isComplete)
    .slice(0, count);

  if (complete.length === 0) {
    return new Response(
      JSON.stringify({ inserted: 0, message: "No complete records found from Every.org for this query" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const rows = complete.map((org: any) => ({
    name: org.name.trim(),
    ein: org.ein.trim(),
    description: org.description.trim(),
    category: category,
    website_url: org.websiteUrl.trim(),
    logo_url: org.logoUrl.trim(),
    is_approved: false,
  }));

  const { data: inserted, error } = await supabase
    .from("charities")
    .upsert(rows, { onConflict: "name", ignoreDuplicates: true })
    .select("id, name, logo_url");

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      inserted: inserted?.length ?? 0,
      skipped: nonprofits.length - complete.length,
      charities: inserted,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});