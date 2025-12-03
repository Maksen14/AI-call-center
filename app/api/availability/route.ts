import { NextRequest, NextResponse } from "next/server";
import { listMeetings } from "@/lib/meetingsStore";
import { fetchNotionEvents } from "@/lib/notionEvents";

type BusyInterval = {
  start: Date;
  end: Date;
  title?: string;
  source: "meeting" | "notion";
};

type Slot = {
  start: string;
  end: string;
  durationMinutes: number;
};

const DEFAULT_WORK_START_HOUR = Number(process.env.AVAILABILITY_START_HOUR ?? 8);
const DEFAULT_WORK_END_HOUR = Number(process.env.AVAILABILITY_END_HOUR ?? 21);
const DEFAULT_SLOT_MINUTES = Number(process.env.AVAILABILITY_SLOT_MINUTES ?? 30);
const DEFAULT_DURATION_MINUTES = Number(process.env.AVAILABILITY_DURATION_MINUTES ?? 30);
const DEFAULT_HORIZON_DAYS = Number(process.env.AVAILABILITY_HORIZON_DAYS ?? 7);
const DEFAULT_LIMIT = Number(process.env.AVAILABILITY_MAX_SLOTS ?? 20);
const DEFAULT_MIN_LEAD_MINUTES = Number(process.env.AVAILABILITY_LEAD_TIME_MINUTES ?? 60);

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (Number.isNaN(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date
    .getDate()
    .toString()
    .padStart(2, "0")}`;
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function buildBusyIntervals(): Promise<BusyInterval[]> {
  return Promise.all([
    (async (): Promise<BusyInterval[]> => {
      const meetings = await listMeetings();
      return meetings
        .map((meeting) => {
          const start = toDate(meeting.scheduledAt);
          if (!start) return null;
          const end = toDate(meeting.endAt) ?? addMinutes(start, 60);
          return {
            start,
            end,
            title: meeting.title,
            source: "meeting" as const,
          };
        })
        .filter(Boolean) as BusyInterval[];
    })(),
    (async (): Promise<BusyInterval[]> => {
      try {
        const result = await fetchNotionEvents({ pageSize: 100 });
        return result.events
          .map((event) => {
            const start = toDate(event.start);
            if (!start) return null;
            const end = toDate(event.end) ?? addMinutes(start, 60);
            return {
              start,
              end,
              title: event.title,
              source: "notion" as const,
            } satisfies BusyInterval;
          })
          .filter(Boolean) as BusyInterval[];
      } catch (err) {
        console.error("Failed to load Notion events for availability:", err);
        return [];
      }
    })(),
  ]).then(([meetings, notion]) => [...meetings, ...notion]);
}

function overlaps(slotStart: Date, slotEnd: Date, intervals: BusyInterval[]): boolean {
  return intervals.some((interval) => slotStart < interval.end && slotEnd > interval.start);
}

function startOfDay(base: Date, offsetDays: number): Date {
  const copy = new Date(base);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() + offsetDays);
  return copy;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const now = new Date();

    const durationMinutes = clampNumber(
      Number(searchParams.get("durationMinutes")) || DEFAULT_DURATION_MINUTES,
      15,
      240,
      DEFAULT_DURATION_MINUTES,
    );
    const slotMinutes = clampNumber(
      Number(searchParams.get("slotMinutes")) || DEFAULT_SLOT_MINUTES,
      5,
      120,
      DEFAULT_SLOT_MINUTES,
    );
    const horizonDays = clampNumber(
      Number(searchParams.get("days")) || DEFAULT_HORIZON_DAYS,
      1,
      30,
      DEFAULT_HORIZON_DAYS,
    );
    const slotLimit = clampNumber(
      Number(searchParams.get("limit")) || DEFAULT_LIMIT,
      1,
      200,
      DEFAULT_LIMIT,
    );
    const minLeadMinutes = clampNumber(
      Number(searchParams.get("leadTimeMinutes")) || DEFAULT_MIN_LEAD_MINUTES,
      0,
      24 * 60,
      DEFAULT_MIN_LEAD_MINUTES,
    );

    const workStartHour = DEFAULT_WORK_START_HOUR;
    const workEndHour = DEFAULT_WORK_END_HOUR;

    if (workEndHour <= workStartHour) {
      return NextResponse.json(
        { error: "Invalid availability hours configuration" },
        { status: 500 },
      );
    }

    const intervals = await buildBusyIntervals();
    const intervalsByDay = new Map<string, BusyInterval[]>();
    intervals.forEach((interval) => {
      const key = dayKey(interval.start);
      const bucket = intervalsByDay.get(key);
      if (bucket) {
        bucket.push(interval);
      } else {
        intervalsByDay.set(key, [interval]);
      }
    });

    const slots: Slot[] = [];
    const earliestAllowedStart = addMinutes(now, minLeadMinutes);

    for (let dayOffset = 0; dayOffset < horizonDays && slots.length < slotLimit; dayOffset += 1) {
      const dayStart = startOfDay(now, dayOffset);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const workStart = new Date(dayStart);
      workStart.setHours(workStartHour, 0, 0, 0);
      const workEnd = new Date(dayStart);
      workEnd.setHours(workEndHour, 0, 0, 0);

      if (workEnd <= earliestAllowedStart && dayEnd <= earliestAllowedStart) {
        continue;
      }

      const bucket = intervalsByDay.get(dayKey(dayStart)) ?? [];
      for (
        let cursor = new Date(workStart);
        cursor < workEnd && slots.length < slotLimit;
        cursor = addMinutes(cursor, slotMinutes)
      ) {
        const slotStart = new Date(cursor);
        const slotEnd = addMinutes(slotStart, durationMinutes);
        if (slotEnd > workEnd) {
          break;
        }
        if (slotStart < earliestAllowedStart) {
          continue;
        }
        if (overlaps(slotStart, slotEnd, bucket)) {
          continue;
        }
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          durationMinutes,
        });
      }
    }

    return NextResponse.json({
      generatedAt: now.toISOString(),
      horizonDays,
      slotMinutes,
      durationMinutes,
      slots,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Availability error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

