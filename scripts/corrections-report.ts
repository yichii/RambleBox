// Internal-only corrections analytics — run locally with the service-role
// key, never shipped in the mobile app. Surfaces recurring misclassification
// patterns so the structuring prompt (structure-transcript/structuring_prompt.ts)
// can be iterated on directly against real correction data.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/corrections-report.ts --since=2026-08-01 --until=2026-08-08
//
// --since / --until are optional (ISO dates, inclusive/exclusive respectively).
// Defaults to all-time if omitted.

import { createClient } from "@supabase/supabase-js";

interface Correction {
  field_corrected: "note_type" | "topic_category" | "urgency";
  original_value: string;
  corrected_value: string;
  corrected_at: string;
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main() {
  const { since, until } = parseArgs(process.argv.slice(2));

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey);

  let query = supabase
    .from("corrections")
    .select("field_corrected, original_value, corrected_value, corrected_at");

  if (since) query = query.gte("corrected_at", since);
  if (until) query = query.lt("corrected_at", until);

  const { data, error } = await query;
  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  const corrections = (data ?? []) as Correction[];

  console.log(`\nCorrections report${since ? ` from ${since}` : ""}${until ? ` to ${until}` : ""}`);
  console.log(`Total corrections: ${corrections.length}\n`);

  const countsByField = new Map<string, number>();
  for (const c of corrections) {
    countsByField.set(c.field_corrected, (countsByField.get(c.field_corrected) ?? 0) + 1);
  }

  console.log("By field:");
  for (const [field, count] of [...countsByField.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${field}: ${count}`);
  }

  for (const field of ["topic_category", "note_type"] as const) {
    const pairCounts = new Map<string, number>();
    for (const c of corrections) {
      if (c.field_corrected !== field) continue;
      const key = `${c.original_value} -> ${c.corrected_value}`;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }

    if (pairCounts.size === 0) continue;

    console.log(`\n${field} confusion pairs:`);
    for (const [pair, count] of [...pairCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${pair}: ${count} time${count === 1 ? "" : "s"}`);
    }
  }

  console.log("");
}

main();
