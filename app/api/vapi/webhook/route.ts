import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readJson, writeJson } from "@/lib/jsonStore";
import { isCallStatus, type CallStatus } from "@/lib/callStatus";
import { createMeeting, listMeetings, type Meeting } from "@/lib/meetingsStore";
import type { MeetingChannel } from "@/lib/meetingsStore";

type CallRecord = {
  id: string;
  leadId: string | null;
  vapiCallId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  summary?: string;
  rawPayload?: unknown;
};

type CallsDb = {
  calls: CallRecord[];
};

const callsPath = path.join(process.cwd(), "data", "calls.json");
const placesPath = path.join(process.cwd(), "data", "places-db.json");

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

type MeetingCandidate = {
  scheduledAt: string;
  endAt?: string | null;
  title?: string | null;
  notes?: string | null;
  channel?: MeetingChannel | string | null;
};

const callStatusSynonyms: Record<string, CallStatus> = {
  "didn't answer": "Didn't answer",
  "didnt answer": "Didn't answer",
  "no answer": "Didn't answer",
  "manager was not available": "Manager was not available",
  "manager not available": "Manager was not available",
  "manager unavailable": "Manager was not available",
  "not interested": "Not interested",
  uninterested: "Not interested",
  "interested": "Interested",
  interseted: "Interested",
  "meeting planned": "Meeting planned",
};

function normalizeCallStatus(value: unknown): CallStatus | null {
  if (isCallStatus(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return callStatusSynonyms[normalized] ?? null;
}

function extractCallStatus(payload: Record<string, unknown>): CallStatus | null {
  const candidates = [
    payload.callStatus,
    payload.state,
    payload.status,
    payload.result && (payload.result as Record<string, unknown>).callStatus,
    payload.metadata && (payload.metadata as Record<string, unknown>).callStatus,
    payload.summary,
  ];

  for (const candidate of candidates) {
    const status = normalizeCallStatus(candidate);
    if (status) {
      return status;
    }
  }
  return null;
}

function extractMeetingCandidate(payload: Record<string, unknown>): MeetingCandidate | null {
  const sources = [
    payload.metadata && (payload.metadata as Record<string, unknown>).meeting,
    payload.meeting,
    payload.result && (payload.result as Record<string, unknown>).meeting,
  ];

  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const candidate = source as Record<string, unknown>;
    const scheduledAt = typeof candidate.scheduledAt === "string" ? candidate.scheduledAt : null;
    if (!scheduledAt) continue;
    const endAt = typeof candidate.endAt === "string" ? candidate.endAt : null;
    const title = typeof candidate.title === "string" ? candidate.title : null;
    const notes = typeof candidate.notes === "string" ? candidate.notes : null;
    const channel = typeof candidate.channel === "string" ? candidate.channel : null;
    return {
      scheduledAt,
      endAt,
      title,
      notes,
      channel: (channel as MeetingChannel | null) ?? null,
    };
  }
  return null;
}

async function updateLeadCallStatus(leadId: string, callStatus: CallStatus): Promise<boolean> {
  const db = await readJson<PlacesDb>(placesPath, { places: {} });
  const place = db.places[leadId];
  if (!place) {
    return false;
  }
  if (place.callStatus === callStatus) {
    return false;
  }
  place.callStatus = callStatus;
  await writeJson(placesPath, db);
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Vapi webhook payload:", body);

    const vapiCallId: string | undefined = body.id ?? body.callId;
    if (!vapiCallId) {
      return NextResponse.json({ error: "Missing call id" }, { status: 400 });
    }

    const status: string = body.status ?? body.state ?? "unknown";
    const summary: string | undefined = body.summary ?? body.result ?? body.transcriptSummary;
    const leadId: string | null = body.metadata?.leadId ?? null;
    const warnings: string[] = [];

    const now = new Date().toISOString();
    const db = await readJson<CallsDb>(callsPath, { calls: [] });

    const existingIdx = db.calls.findIndex((c) => c.vapiCallId === vapiCallId);
    const record: CallRecord = {
      id: existingIdx >= 0 ? db.calls[existingIdx].id : crypto.randomUUID(),
      leadId,
      vapiCallId,
      status,
      summary,
      rawPayload: body,
      createdAt: existingIdx >= 0 ? db.calls[existingIdx].createdAt : now,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      db.calls[existingIdx] = record;
    } else {
      db.calls.push(record);
    }

    await writeJson(callsPath, db);

    let meetingCreated: Meeting | null = null;
    let callStatusUpdatedTo: CallStatus | null = null;

    if (leadId) {
      const meetingCandidate = extractMeetingCandidate(body);
      if (meetingCandidate?.scheduledAt) {
        try {
          const existingMeetings = await listMeetings();
          const alreadyExists = existingMeetings.some(
            (meeting) =>
              meeting.leadId === leadId &&
              meeting.scheduledAt === meetingCandidate.scheduledAt,
          );
          if (!alreadyExists) {
            meetingCreated = await createMeeting({
              leadId,
              scheduledAt: meetingCandidate.scheduledAt,
              endAt: meetingCandidate.endAt ?? null,
              channel:
                meetingCandidate.channel && ["phone", "video", "in-person", "other"].includes(meetingCandidate.channel)
                  ? (meetingCandidate.channel as MeetingChannel)
                  : "phone",
              notes: meetingCandidate.notes ?? undefined,
              title: meetingCandidate.title ?? undefined,
              source: "vapi",
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          warnings.push(`Failed to create meeting: ${message}`);
        }
      }

      const extractedStatus = extractCallStatus(body);
      const targetStatus: CallStatus | null = meetingCreated ? "Meeting planned" : extractedStatus;
      if (targetStatus) {
        try {
          const changed = await updateLeadCallStatus(leadId, targetStatus);
          if (changed) {
            callStatusUpdatedTo = targetStatus;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          warnings.push(`Failed to update call status: ${message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      status,
      leadId,
      callStatusUpdatedTo,
      meetingCreated,
      warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Webhook error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
