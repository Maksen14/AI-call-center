import { NextRequest, NextResponse } from "next/server";
import {
  createMeeting,
  deleteMeeting,
  listMeetings,
  updateMeeting,
  type MeetingChannel,
} from "@/lib/meetingsStore";

export async function GET() {
  try {
    const meetings = await listMeetings();
    return NextResponse.json({ meetings });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Meetings list error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, leadId, scheduledAt, endAt, channel, notes } = body as {
      title?: string;
      leadId?: string | null;
      scheduledAt?: string;
      endAt?: string | null;
      channel?: MeetingChannel;
      notes?: string;
    };

    if (!scheduledAt) {
      return NextResponse.json({ error: "scheduledAt is required" }, { status: 400 });
    }

    const meetingChannel = channel ?? "other";
    const meeting = await createMeeting({
      title,
      leadId: leadId ?? null,
      scheduledAt,
      endAt: endAt ?? null,
      channel: meetingChannel,
      notes,
      source: "manual",
    });

    return NextResponse.json(meeting, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Meetings create error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, title, leadId, scheduledAt, endAt, channel, notes } = body as {
      id?: string;
      title?: string;
      leadId?: string | null;
      scheduledAt?: string;
      endAt?: string | null;
      channel?: MeetingChannel;
      notes?: string | null;
    };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const meeting = await updateMeeting({
      id,
      title,
      leadId: leadId ?? null,
      scheduledAt,
      endAt: endAt ?? null,
      channel,
      notes: notes ?? undefined,
    });

    return NextResponse.json(meeting);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Meetings update error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body as { id?: string };
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await deleteMeeting(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Meetings delete error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

