import { NextRequest, NextResponse } from "next/server";
import { createMeeting } from "@/lib/meetingsStore";
import type { MeetingChannel } from "@/lib/meetingsStore";

/**
 * Vapi Tool configuration:
 * URL: POST /api/meetings/create
 * Payload:
 * {
 *   "leadId": "string",
 *   "scheduledAt": "2025-11-30T10:00:00.000Z",
 *   "channel": "phone" | "video" | "in-person",
 *   "notes": "optional notes"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leadId, scheduledAt, channel, notes } = body as {
      leadId?: string;
      scheduledAt?: string;
      channel?: MeetingChannel;
      notes?: string;
    };

    if (!leadId || !scheduledAt || !channel) {
      return NextResponse.json({ error: "leadId, scheduledAt, and channel are required" }, { status: 400 });
    }

    if (!["phone", "video", "in-person"].includes(channel)) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    }

    const meeting = await createMeeting({
      leadId,
      scheduledAt,
      channel,
      notes,
      source: "vapi",
    });

    return NextResponse.json(meeting, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Meeting create error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
