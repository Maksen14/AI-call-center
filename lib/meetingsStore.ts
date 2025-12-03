import path from "path";
import { readJson, writeJson } from "@/lib/jsonStore";
import type { CallStatus } from "@/lib/callStatus";

export type MeetingChannel = "phone" | "video" | "in-person" | "other";

export type Meeting = {
  id: string;
  title: string;
  leadId?: string | null;
  scheduledAt: string;
  endAt?: string | null;
  channel: MeetingChannel;
  notes?: string;
  createdAt: string;
  source?: "manual" | "vapi" | "notion";
};

type MeetingsDb = {
  meetings: Meeting[];
};

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

const meetingsPath = path.join(process.cwd(), "data", "meetings.json");
const placesPath = path.join(process.cwd(), "data", "places-db.json");

function sanitizeMeeting(raw: Meeting): Meeting {
  return {
    id: raw.id ?? crypto.randomUUID(),
    title: raw.title ?? "Untitled meeting",
    leadId: raw.leadId ?? null,
    scheduledAt: raw.scheduledAt,
    endAt: raw.endAt ?? null,
    channel: raw.channel ?? "phone",
    notes: raw.notes,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    source: raw.source ?? "manual",
  };
}

export async function listMeetings(): Promise<Meeting[]> {
  const db = await readJson<MeetingsDb>(meetingsPath, { meetings: [] });
  const sanitized = db.meetings.map(sanitizeMeeting);
  if (sanitized.length !== db.meetings.length) {
    await writeJson(meetingsPath, { meetings: sanitized });
  }
  return sanitized.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

type CreateMeetingOptions = {
  title?: string;
  leadId?: string | null;
  scheduledAt: string;
  endAt?: string | null;
  channel: MeetingChannel;
  notes?: string;
  source?: "manual" | "vapi";
};

export async function createMeeting(opts: CreateMeetingOptions): Promise<Meeting> {
  const { leadId, scheduledAt, endAt, channel, notes, title, source = "manual" } = opts;

  if (!scheduledAt) {
    throw new Error("scheduledAt is required");
  }

  if (!["phone", "video", "in-person", "other"].includes(channel)) {
    throw new Error("Invalid channel");
  }

  let meetingTitle = title?.trim();

  if (leadId) {
    const placesDb = await readJson<PlacesDb>(placesPath, { places: {} });
    const lead = placesDb.places[leadId];
    if (!lead) {
      throw new Error("Lead not found");
    }
    if (!meetingTitle) {
      meetingTitle = `Meeting with ${lead.name}`;
    }
  }

  if (!meetingTitle) {
    meetingTitle = "Untitled meeting";
  }

  const meeting: Meeting = {
    id: crypto.randomUUID(),
    title: meetingTitle,
    leadId: leadId ?? null,
    scheduledAt,
    endAt: endAt ?? null,
    channel,
    notes,
    createdAt: new Date().toISOString(),
    source,
  };

  const meetingsDb = await readJson<MeetingsDb>(meetingsPath, { meetings: [] });
  meetingsDb.meetings.push(meeting);
  await writeJson(meetingsPath, meetingsDb);

  return meeting;
}

type UpdateMeetingOptions = {
  id: string;
  title?: string;
  leadId?: string | null;
  scheduledAt?: string;
  endAt?: string | null;
  channel?: MeetingChannel;
  notes?: string | null;
};

export async function updateMeeting(opts: UpdateMeetingOptions): Promise<Meeting> {
  const { id, title, leadId, scheduledAt, endAt, channel, notes } = opts;
  if (!id) {
    throw new Error("id is required");
  }

  const meetingsDb = await readJson<MeetingsDb>(meetingsPath, { meetings: [] });
  const index = meetingsDb.meetings.findIndex((meeting) => meeting.id === id);
  if (index === -1) {
    throw new Error("Meeting not found");
  }

  const current = sanitizeMeeting(meetingsDb.meetings[index]);

  let leadName: string | undefined;
  if (leadId !== undefined) {
    if (leadId) {
      const placesDb = await readJson<PlacesDb>(placesPath, { places: {} });
      const lead = placesDb.places[leadId];
      if (!lead) {
        throw new Error("Lead not found");
      }
      leadName = lead.name;
    }
  }

  if (channel && !["phone", "video", "in-person", "other"].includes(channel)) {
    throw new Error("Invalid channel");
  }

  const updated: Meeting = {
    ...current,
    title: title?.trim() || current.title,
    leadId: leadId !== undefined ? leadId : current.leadId ?? null,
    scheduledAt: scheduledAt ?? current.scheduledAt,
    endAt: endAt !== undefined ? endAt : current.endAt ?? null,
    channel: channel ?? current.channel,
    notes: notes !== undefined ? notes || undefined : current.notes,
  };

  if (updated.leadId && !title && leadName && updated.title === current.title) {
    updated.title = `Meeting with ${leadName}`;
  }

  meetingsDb.meetings[index] = updated;
  await writeJson(meetingsPath, meetingsDb);

  return sanitizeMeeting(updated);
}

export async function deleteMeeting(id: string): Promise<void> {
  if (!id) {
    throw new Error("id is required");
  }
  const meetingsDb = await readJson<MeetingsDb>(meetingsPath, { meetings: [] });
  const nextMeetings = meetingsDb.meetings.filter((meeting) => meeting.id !== id);
  if (nextMeetings.length === meetingsDb.meetings.length) {
    throw new Error("Meeting not found");
  }
  await writeJson(meetingsPath, { meetings: nextMeetings });
}

