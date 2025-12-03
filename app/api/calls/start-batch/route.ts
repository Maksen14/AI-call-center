import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readJson } from "@/lib/jsonStore";
import { startVapiCall } from "@/lib/vapi";
import type { CallStatus } from "@/lib/callStatus";

type StoredPlace = {
  key: string;
  name: string;
  phoneNumber: string | null;
  websiteUri: string | null;
  websiteCategory: "none" | "social" | "real";
  restaurantType?: string;
  city?: string;
  notes?: string;
  callStatus: CallStatus;
};

type PlacesDb = {
  places: Record<string, StoredPlace>;
};

const placesPath = path.join(process.cwd(), "data", "places-db.json");

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { limit?: number; leadIds?: string[] };
    const placesDb = await readJson<PlacesDb>(placesPath, { places: {} });
    const allPlaces = Object.values(placesDb.places);

    let selected: StoredPlace[] = [];

    if (body.leadIds && Array.isArray(body.leadIds)) {
      selected = body.leadIds
        .map((id) => placesDb.places[id])
        .filter((p): p is StoredPlace => Boolean(p));
    } else {
      const limit = typeof body.limit === "number" && body.limit > 0 ? body.limit : 10;
      selected = allPlaces.slice(0, limit);
    }

    const results = [];
    for (const lead of selected) {
      try {
        if (!lead.phoneNumber) {
          throw new Error("Missing phone number");
        }
        const res = await startVapiCall({
          leadId: lead.key,
          phoneNumber: lead.phoneNumber,
          metadata: {
            leadId: lead.key,
            restaurantName: lead.name,
            restaurantType: lead.restaurantType,
            city: lead.city,
            note: lead.notes,
            websiteCategory: lead.websiteCategory,
            websiteUri: lead.websiteUri,
            callStatus: lead.callStatus,
          },
        });
        results.push({ leadId: lead.key, success: true, result: res });
      } catch (err) {
        results.push({
          leadId: lead.key,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({ count: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Start batch error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
