import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseClient } from "./lib/supabaseClient";
import { parseVenueCsv } from "./lib/importVenues";

// Triggers a re-import of the published Google Sheet CSV into Supabase. Gated by a shared secret
// header rather than a public UI button for v1 - see implementation-plan.md's account setup checklist.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const providedSecret = req.headers["x-import-secret"];
  const expectedSecret = process.env.IMPORT_ADMIN_SECRET;
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({ error: "Missing or invalid x-import-secret header." });
  }

  const sheetUrl = process.env.VENUE_SHEET_CSV_URL;
  if (!sheetUrl) {
    return res.status(500).json({ error: "VENUE_SHEET_CSV_URL is not configured." });
  }

  const csvResponse = await fetch(sheetUrl);
  if (!csvResponse.ok) {
    return res.status(502).json({ error: `Could not fetch the venue sheet (${csvResponse.status}).` });
  }
  const csvText = await csvResponse.text();

  const { records, warnings } = parseVenueCsv(csvText);
  if (records.length === 0) {
    return res.status(422).json({ error: "No venue rows were found in the sheet.", warnings });
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("venues").upsert(records, { onConflict: "slug" });

  if (error) {
    console.error("Venue upsert failed", error);
    return res.status(500).json({ error: "Failed to write venues to Supabase.", details: error.message });
  }

  return res.status(200).json({
    imported: records.length,
    launchEligible: records.filter((record) => record.launch_eligible).length,
    warnings: warnings.map((warning) => `${warning.venueName}: ${warning.message}`),
  });
}
