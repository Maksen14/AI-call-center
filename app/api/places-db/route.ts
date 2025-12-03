import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { CALL_STATUSES, DEFAULT_CALL_STATUS, isCallStatus, type CallStatus } from "@/lib/callStatus";

type DbPlace = {
  key: string;
  name: string;
  phoneNumber: string | null;
  websiteUri: string | null;
  websiteCategory: "none" | "social" | "real";
  callStatus: CallStatus;
};

type DbSchema = {
  places: Record<string, DbPlace>;
};

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "places-db.json");

function computePlaceKey(place: { name: string; websiteUri: string | null }) {
  const normName = (place.name || "").trim().toLowerCase();
  const normUrl = (place.websiteUri || "").trim().toLowerCase();
  return `${normName}|${normUrl}`;
}

function sanitizeCallStatus(value: unknown): CallStatus {
  return isCallStatus(value) ? value : DEFAULT_CALL_STATUS;
}

async function ensureDb(): Promise<DbSchema> {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const raw = await fs.readFile(dbPath, "utf8");
    const parsed = JSON.parse(raw) as { places?: Record<string, Partial<DbPlace>> };
    const normalized: Record<string, DbPlace> = {};
    let mutated = false;

    for (const [key, value] of Object.entries(parsed.places ?? {})) {
      const existingStatus = (value as Partial<DbPlace>)?.callStatus;
      const callStatus = sanitizeCallStatus(existingStatus);
      if (existingStatus !== callStatus) {
        mutated = true;
      }
      normalized[key] = {
        key,
        name: value?.name ?? "",
        phoneNumber: value?.phoneNumber ?? null,
        websiteUri: value?.websiteUri ?? null,
        websiteCategory: value?.websiteCategory ?? "none",
        callStatus,
      };
    }

    if (mutated) {
      await saveDb({ places: normalized });
    }

    return { places: normalized };
  } catch {
    const initial: DbSchema = { places: {} };
    await fs.writeFile(dbPath, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }
}

async function saveDb(db: DbSchema) {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
}

export async function GET() {
  const db = await ensureDb();
  return NextResponse.json({
    keys: Object.keys(db.places),
    places: Object.values(db.places),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { place?: Partial<DbPlace> };
    const place = body.place;
    if (!place || !place.name) {
      return NextResponse.json({ error: "Missing place.name" }, { status: 400 });
    }

    if (place.callStatus && !isCallStatus(place.callStatus)) {
      return NextResponse.json(
        { error: `Invalid callStatus. Accepted values: ${CALL_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    const key = computePlaceKey({ name: place.name, websiteUri: place.websiteUri ?? null });
    const db = await ensureDb();

    if (!db.places[key]) {
      db.places[key] = {
        key,
        name: place.name,
        phoneNumber: place.phoneNumber ?? null,
        websiteUri: place.websiteUri ?? null,
        websiteCategory: place.websiteCategory ?? "none",
        callStatus: sanitizeCallStatus(place.callStatus),
      };
      await saveDb(db);
    }

    return NextResponse.json({ ok: true, key, place: db.places[key] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as { key?: string; callStatus?: string };
    const key = body.key?.trim();
    if (!key) {
      return NextResponse.json({ error: "Missing key" }, { status: 400 });
    }
    if (!isCallStatus(body.callStatus)) {
      return NextResponse.json(
        { error: `Invalid callStatus. Accepted values: ${CALL_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    const db = await ensureDb();
    const existing = db.places[key];
    if (!existing) {
      return NextResponse.json({ error: "Place not found" }, { status: 404 });
    }

    existing.callStatus = body.callStatus;
    await saveDb(db);

    return NextResponse.json({ ok: true, place: existing });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json()) as { key?: string };
    const key = body.key?.trim();
    if (!key) {
      return NextResponse.json({ error: "Missing key" }, { status: 400 });
    }

    const db = await ensureDb();
    if (db.places[key]) {
      delete db.places[key];
      await saveDb(db);
    }

    return NextResponse.json({ ok: true, key });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
