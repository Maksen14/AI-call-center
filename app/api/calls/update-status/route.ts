import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readJson, writeJson } from "@/lib/jsonStore";
import { CALL_STATUSES, isCallStatus } from "@/lib/callStatus";

type StoredPlace = {
  key: string;
  name: string;
  phoneNumber: string | null;
  websiteUri: string | null;
  websiteCategory: "none" | "social" | "real";
  callStatus: string;
  notes?: string;
};

type PlacesDb = {
  places: Record<string, StoredPlace>;
};

const placesPath = path.join(process.cwd(), "data", "places-db.json");

type RequestPayload = {
  leadId?: string;
  callStatus?: string;
  notes?: string;
};

function sanitizeNotes(notes: unknown): string | undefined {
  if (notes === null || notes === undefined) return undefined;
  if (typeof notes !== "string") return undefined;
  const trimmed = notes.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 2000) : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestPayload;
    const leadId = body.leadId?.trim();
    const wishStatus = body.callStatus?.trim();

    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }
    if (!wishStatus || !isCallStatus(wishStatus)) {
      return NextResponse.json(
        { error: `callStatus must be one of: ${CALL_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    const db = await readJson<PlacesDb>(placesPath, { places: {} });
    const existing = db.places[leadId];
    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    existing.callStatus = wishStatus;
    const sanitizedNotes = sanitizeNotes(body.notes);
    if (sanitizedNotes !== undefined) {
      existing.notes = sanitizedNotes;
    }

    await writeJson(placesPath, db);

    return NextResponse.json({
      ok: true,
      place: existing,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Update call status error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}


