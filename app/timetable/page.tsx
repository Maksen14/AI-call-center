"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { DEFAULT_CALL_STATUS, type CallStatus } from "@/lib/callStatus";
import type { Meeting, MeetingChannel } from "@/lib/meetingsStore";

type LeadSummary = {
  key: string;
  name: string;
  callStatus: CallStatus;
};

type MeetingsResponse = {
  meetings: Meeting[];
};

type NotionEventsResponse = {
  events: Array<{
    id: string;
    title: string;
    start: string;
    end?: string | null;
    location?: string | null;
    url?: string | null;
  }>;
};

type PlacesDbResponse = {
  places?: Array<{
    key: string;
    name: string;
    callStatus: CallStatus;
  }>;
};

type TimetableEvent = {
  id: string;
  title: string;
  start: string;
  end?: string | null;
  source: "manual" | "vapi" | "notion";
  channel?: MeetingChannel;
  leadId?: string | null;
  leadName?: string | null;
  notes?: string;
  location?: string | null;
  url?: string | null;
};

const channelOptions: MeetingChannel[] = ["phone", "video", "in-person", "other"];

function combineDateTime(date: string, time: string): string | null {
  if (!date || !time) return null;
  const dateTime = new Date(`${date}T${time}`);
  if (Number.isNaN(dateTime.getTime())) return null;
  return dateTime.toISOString();
}

function splitDateTime(iso: string | null): { date: string; time: string } {
  if (!iso) {
    return { date: "", time: "" };
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { date: "", time: "" };
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return {
    date: local.toISOString().slice(0, 10),
    time: local.toISOString().slice(11, 16),
  };
}

export default function TimetablePage() {
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [notionEvents, setNotionEvents] = useState<NotionEventsResponse["events"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notionError, setNotionError] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    title: "",
    leadId: "",
    scheduledDate: "",
    scheduledTime: "",
    endDate: "",
    endTime: "",
    channel: "phone" as MeetingChannel,
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [activeEvent, setActiveEvent] = useState<TimetableEvent | null>(null);

  const leadsById = useMemo(() => {
    const map: Record<string, LeadSummary> = {};
    leads.forEach((lead) => {
      map[lead.key] = lead;
    });
    return map;
  }, [leads]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [meetingsRes, notionRes, placesRes] = await Promise.all([
          fetch("/api/meetings"),
          fetch("/api/notion/events"),
          fetch("/api/places-db"),
        ]);

        if (!meetingsRes.ok) throw new Error("Failed to load meetings");
        if (!placesRes.ok) throw new Error("Failed to load leads");

        const meetingsData = (await meetingsRes.json()) as MeetingsResponse;
        const notionData = notionRes.ok ? ((await notionRes.json()) as NotionEventsResponse) : { events: [] };
        if (!notionRes.ok) {
          setNotionError(notionData?.events ? null : `Notion sync failed (${notionRes.status})`);
        } else {
          setNotionError(null);
        }
        const placesData = (await placesRes.json()) as PlacesDbResponse;

        setMeetings(meetingsData.meetings ?? []);
        setNotionEvents(notionData.events ?? []);
        setLeads(
          (placesData.places ?? []).map((place) => ({
            key: place.key,
            name: place.name,
            callStatus: place.callStatus ?? DEFAULT_CALL_STATUS,
          })),
        );
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setNotionError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const timetableEvents: TimetableEvent[] = useMemo(() => {
    const leadName = (leadId?: string | null) => (leadId ? leadsById[leadId]?.name ?? null : null);
    const manualEvents: TimetableEvent[] = meetings.map((meeting) => ({
      id: meeting.id,
      title: meeting.title,
      start: meeting.scheduledAt,
      end: meeting.endAt ?? null,
      source: meeting.source ?? "manual",
      channel: meeting.channel,
      notes: meeting.notes,
      leadId: meeting.leadId ?? null,
      leadName: leadName(meeting.leadId),
    }));

    const notionMapped: TimetableEvent[] = notionEvents.map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end ?? null,
      source: "notion",
      location: event.location ?? null,
      url: event.url ?? null,
    }));

    return [...manualEvents, ...notionMapped].sort((a, b) => a.start.localeCompare(b.start));
  }, [meetings, notionEvents, leadsById]);

  const groupedEvents = useMemo(() => {
    const groups: Record<string, TimetableEvent[]> = {};
    timetableEvents.forEach((event) => {
      const dateKey = event.start.slice(0, 10);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(event);
    });
    return groups;
  }, [timetableEvents]);

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.scheduledDate || !formState.scheduledTime) {
      setError("Please provide a start date and time.");
      return;
    }
    const startIso = combineDateTime(formState.scheduledDate, formState.scheduledTime);
    if (!startIso) {
      setError("Invalid start date/time.");
      return;
    }
    let endIso: string | null = null;
    if (formState.endDate || formState.endTime) {
      endIso = combineDateTime(
        formState.endDate || formState.scheduledDate,
        formState.endTime || formState.scheduledTime,
      );
      if (!endIso) {
        setError("Invalid end date/time.");
        return;
      }
    }
    try {
      setSubmitting(true);
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formState.title || undefined,
          leadId: formState.leadId || null,
          scheduledAt: startIso,
          endAt: endIso,
          channel: formState.channel,
          notes: formState.notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to create event");
      }
      setMeetings((prev) => [...prev, data as Meeting]);
      setFormState({
        title: "",
        leadId: "",
        scheduledDate: "",
        scheduledTime: "",
        endDate: "",
        endTime: "",
        channel: "phone",
        notes: "",
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const refresh = async () => {
    try {
      setLoading(true);
      const [meetingsRes, notionRes] = await Promise.all([fetch("/api/meetings"), fetch("/api/notion/events")]);
      if (!meetingsRes.ok) throw new Error("Failed to load meetings");
      const meetingsData = (await meetingsRes.json()) as MeetingsResponse;
      const notionData = notionRes.ok ? ((await notionRes.json()) as NotionEventsResponse) : { events: [] };
      if (!notionRes.ok) {
        setNotionError(notionData?.events ? null : `Notion sync failed (${notionRes.status})`);
      } else {
        setNotionError(null);
      }
      setMeetings(meetingsData.meetings ?? []);
      setNotionEvents(notionData.events ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #e9edf4, #f5f7fb)",
        color: "#0f172a",
      }}
    >
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap");
        body {
          margin: 0;
          font-family: "Manrope", "Segoe UI", system-ui, -apple-system, sans-serif;
          background: #e9edf4;
          color: #0f172a;
        }
      `}</style>

      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          padding: "2.5rem 1.25rem 3rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        <header style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <p style={{ margin: 0 }}>
            <Link
              href="/"
              style={{
                textDecoration: "none",
                color: "#0f172a",
                padding: "0.5rem 0.8rem",
                borderRadius: "12px",
                background: "#eef2f8",
                boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
              }}
            >
              ← Back to scan
            </Link>
          </p>
          <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: 700 }}>Timetable</h1>
          <p style={{ margin: 0, color: "#475569" }}>
            Review your upcoming meetings, add new ones manually, and pull in events from your Notion calendar.
          </p>
          {(error || notionError) && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {error && (
                <p style={{ color: "#e11d48", margin: 0 }}>
                  Error: <span style={{ fontFamily: "monospace" }}>{error}</span>
                </p>
              )}
              {notionError && (
                <p style={{ color: "#b45309", margin: 0 }}>
                  Notion: <span style={{ fontFamily: "monospace" }}>{notionError}</span>
                </p>
              )}
            </div>
          )}
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "0.8rem",
          }}
        >
          {[
            { label: "Local meetings", value: meetings.length },
            { label: "Notion events", value: notionEvents.length },
            { label: "Selected leads", value: leads.length },
            { label: "Call-ready leads", value: leads.filter((lead) => lead.callStatus === "Not called").length },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                padding: "0.95rem 1rem",
                borderRadius: "16px",
                background: "#eef2f8",
                border: "1px solid rgba(255,255,255,0.8)",
                display: "flex",
                flexDirection: "column",
                gap: "0.3rem",
                boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
              }}
            >
              <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{card.label}</span>
              <span style={{ fontSize: "1.5rem", fontWeight: 700 }}>{card.value}</span>
            </div>
          ))}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={() => setShowManualForm((prev) => !prev)}
              style={actionButtonStyle("#0f172a", "#e9edf4")}
            >
              {showManualForm ? "Close add event" : "Add event"}
            </button>
            <button type="button" onClick={refresh} style={actionButtonStyle("#0369a1", "#e0f2fe")} disabled={loading}>
              Refresh
            </button>
          </div>

          {showManualForm && (
            <div
              style={{
                padding: "1.25rem",
                borderRadius: "18px",
                background: "#eef2f8",
                border: "1px solid rgba(255,255,255,0.9)",
                boxShadow: "12px 12px 26px #cfd4dc, -10px -10px 22px #f9fbff",
              }}
            >
              <strong style={{ fontSize: "1rem", display: "block", marginBottom: "1rem" }}>Add manual event</strong>
            <form
              onSubmit={handleFormSubmit}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "0.9rem 1rem",
              }}
            >
              <label style={labelStyle}>
                Title
                <input
                  type="text"
                  value={formState.title}
                  onChange={(e) => setFormState((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Discovery call"
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Lead
                <select
                  value={formState.leadId}
                  onChange={(e) => setFormState((prev) => ({ ...prev, leadId: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">— No lead —</option>
                  {leads.map((lead) => (
                    <option key={lead.key} value={lead.key}>
                      {lead.name} ({lead.callStatus})
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Starts on
                <input
                  type="date"
                  value={formState.scheduledDate}
                  onChange={(e) => setFormState((prev) => ({ ...prev, scheduledDate: e.target.value }))}
                  required
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Starts at
                <select
                  value={formState.scheduledTime}
                  onChange={(e) => setFormState((prev) => ({ ...prev, scheduledTime: e.target.value }))}
                  required
                  style={inputStyle}
                >
                  <option value="" disabled>
                    Select time
                  </option>
                  {TIME_OPTIONS.map((timeOption) => (
                    <option key={timeOption} value={timeOption}>
                      {timeOption}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Ends on (optional)
                <input
                  type="date"
                  value={formState.endDate}
                  onChange={(e) => setFormState((prev) => ({ ...prev, endDate: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Ends at (optional)
                <select
                  value={formState.endTime}
                  onChange={(e) => setFormState((prev) => ({ ...prev, endTime: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">—</option>
                  {TIME_OPTIONS.map((timeOption) => (
                    <option key={timeOption} value={timeOption}>
                      {timeOption}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Channel
                <select
                  value={formState.channel}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, channel: e.target.value as MeetingChannel }))
                  }
                  style={inputStyle}
                >
                  {channelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
                Notes
                <textarea
                  rows={3}
                  value={formState.notes}
                  onChange={(e) => setFormState((prev) => ({ ...prev, notes: e.target.value }))}
                  style={{ ...inputStyle, resize: "vertical" }}
                  placeholder="Reminder: confirm budget before meeting."
                />
              </label>
              <button type="submit" style={actionButtonStyle("#0f172a", "#e9edf4")} disabled={submitting}>
                {submitting ? "Saving..." : "Add event"}
              </button>
            </form>
            </div>
          )}
        </section>

        <TimetableGrid loading={loading} eventsByDate={groupedEvents} onSelectEvent={setActiveEvent} />
      </div>
      <EventModal
        event={activeEvent}
        leadsById={leadsById}
        onClose={() => setActiveEvent(null)}
        onUpdated={(updated) => {
          setMeetings((prev) => prev.map((meeting) => (meeting.id === updated.id ? updated : meeting)));
          setActiveEvent(null);
        }}
        onDeleted={(deletedId) => {
          setMeetings((prev) => prev.filter((meeting) => meeting.id !== deletedId));
          setActiveEvent(null);
        }}
      />
    </main>
  );
}

function formatTimeRange(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  fontSize: "0.85rem",
  color: "#475569",
};

const inputStyle: CSSProperties = {
  borderRadius: "10px",
  border: "1px solid #d8dde6",
  padding: "0.55rem 0.75rem",
  fontSize: "0.9rem",
  background: "#eef2f8",
  color: "#0f172a",
  boxShadow: "inset 4px 4px 10px #d1d6de, inset -4px -4px 10px #f8fbff",
};

function actionButtonStyle(textColor: string, background: string): CSSProperties {
  return {
    padding: "0.6rem 1.05rem",
    fontSize: "0.88rem",
    fontWeight: 600,
    borderRadius: "12px",
    border: "none",
    background,
    color: textColor,
    cursor: "pointer",
    boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
  };
}

function sourceBadgeStyle(source: TimetableEvent["source"]): CSSProperties {
  const palette: Record<TimetableEvent["source"], { bg: string; color: string }> = {
    manual: { bg: "#e0f2fe", color: "#0369a1" },
    vapi: { bg: "#ecfdf3", color: "#15803d" },
    notion: { bg: "#fefce8", color: "#b45309" },
  };
  const { bg, color } = palette[source];
  return {
    padding: "0.25rem 0.55rem",
    borderRadius: "999px",
    fontSize: "0.75rem",
    fontWeight: 600,
    backgroundColor: bg,
    color,
    alignSelf: "flex-start",
  };
}

const TIMETABLE_START_HOUR = 8;
const TIMETABLE_END_HOUR = 21;
const MINUTES_PER_SLOT = 15;
const PIXELS_PER_MINUTE = 1;
const TOTAL_MINUTES = (TIMETABLE_END_HOUR - TIMETABLE_START_HOUR) * 60;
const TIMETABLE_HEIGHT = TOTAL_MINUTES * PIXELS_PER_MINUTE;
const TIME_OPTIONS = Array.from({ length: 24 * (60 / MINUTES_PER_SLOT) }, (_, idx) => {
  const totalMinutes = idx * MINUTES_PER_SLOT;
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}).filter((time) => {
  const [hourStr] = time.split(":");
  const hour = Number(hourStr);
  if (hour < TIMETABLE_START_HOUR) return false;
  if (hour > TIMETABLE_END_HOUR) return false;
  if (hour === TIMETABLE_END_HOUR) {
    // only allow exact 21:00, not 21:15 etc
    return time.endsWith(":00");
  }
  return true;
});
const MAX_VISIBLE_DAYS = 5;

type TimetableGridProps = {
  loading: boolean;
  eventsByDate: Record<string, TimetableEvent[]>;
  onSelectEvent: (event: TimetableEvent) => void;
};

function TimetableGrid({ loading, eventsByDate, onSelectEvent }: TimetableGridProps) {
  const dateKeys = useMemo(() => Object.keys(eventsByDate).sort(), [eventsByDate]);
  const hours = useMemo(
    () =>
      Array.from({ length: TIMETABLE_END_HOUR - TIMETABLE_START_HOUR + 1 }, (_, i) => TIMETABLE_START_HOUR + i),
    [],
  );
  const slotMinutes = useMemo(
    () =>
      Array.from(
        { length: TOTAL_MINUTES / MINUTES_PER_SLOT + 1 },
        (_, i) => i * MINUTES_PER_SLOT,
      ),
    [],
  );
  const [startIndex, setStartIndex] = useState(0);

  useEffect(() => {
    if (dateKeys.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStartIndex(0);
      return;
    }
    const todayKey = new Date().toISOString().slice(0, 10);
    const upcomingIndex = dateKeys.findIndex((date) => date >= todayKey);
    let initial =
      upcomingIndex === -1 ? Math.max(0, dateKeys.length - MAX_VISIBLE_DAYS) : Math.max(0, upcomingIndex);
    if (initial + MAX_VISIBLE_DAYS > dateKeys.length) {
      initial = Math.max(0, dateKeys.length - MAX_VISIBLE_DAYS);
    }
    setStartIndex((prev) => (prev === initial ? prev : initial));
  }, [dateKeys]);

  const maxStart = Math.max(0, dateKeys.length - MAX_VISIBLE_DAYS);
  const safeStart = Math.min(startIndex, maxStart);
  const visibleDates = useMemo(() => {
    if (dateKeys.length === 0) return [];
    return dateKeys.slice(safeStart, Math.min(dateKeys.length, safeStart + MAX_VISIBLE_DAYS));
  }, [dateKeys, safeStart]);

  const canGoLeft = safeStart > 0;
  const canGoRight = safeStart + visibleDates.length < dateKeys.length;

  if (loading) {
    return (
      <div style={timetableWrapperStyle}>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Loading events…</p>
      </div>
    );
  }

  if (dateKeys.length === 0) {
    return (
      <div style={timetableWrapperStyle}>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>No events scheduled yet.</p>
      </div>
    );
  }

  return (
    <div style={timetableWrapperStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <strong style={{ fontSize: "1rem" }}>Upcoming timetable</strong>
        {dateKeys.length > visibleDates.length && (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => setStartIndex(Math.max(0, safeStart - MAX_VISIBLE_DAYS))}
              disabled={!canGoLeft}
              style={{
                ...actionButtonStyle("#0369a1", "#e0f2fe"),
                opacity: canGoLeft ? 1 : 0.6,
                cursor: canGoLeft ? "pointer" : "not-allowed",
              }}
            >
              ←
            </button>
            <button
              type="button"
              onClick={() =>
                setStartIndex(Math.min(safeStart + MAX_VISIBLE_DAYS, Math.max(0, dateKeys.length - MAX_VISIBLE_DAYS)))
              }
              disabled={!canGoRight}
              style={{
                ...actionButtonStyle("#0369a1", "#e0f2fe"),
                opacity: canGoRight ? 1 : 0.6,
                cursor: canGoRight ? "pointer" : "not-allowed",
              }}
            >
              →
            </button>
          </div>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `90px repeat(${visibleDates.length}, minmax(0, 1fr))`,
          gap: "0.75rem",
        }}
      >
        <div style={{ position: "relative", height: TIMETABLE_HEIGHT }}>
          {hours.map((hour) => (
            <div
              key={hour}
              style={{
                position: "absolute",
                top: `${(hour - TIMETABLE_START_HOUR) * 60 * PIXELS_PER_MINUTE}px`,
                transform: "translateY(-50%)",
                fontSize: "0.78rem",
                color: "#64748b",
              }}
            >
              {formatHour(hour)}
            </div>
          ))}
        </div>
        {visibleDates.map((dateKey) => (
          <DayColumn
            key={dateKey}
            dateKey={dateKey}
            events={eventsByDate[dateKey]}
            slotMinutes={slotMinutes}
            onSelectEvent={onSelectEvent}
          />
        ))}
      </div>
    </div>
  );
}

type DayColumnProps = {
  dateKey: string;
  events: TimetableEvent[];
  slotMinutes: number[];
  onSelectEvent: (event: TimetableEvent) => void;
};

function DayColumn({ dateKey, events, slotMinutes, onSelectEvent }: DayColumnProps) {
  return (
    <div>
      <header
        style={{
          marginBottom: "0.6rem",
          fontWeight: 600,
          fontSize: "0.95rem",
          color: "#0f172a",
        }}
      >
        {new Date(dateKey).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}
      </header>
      <div
        style={{
          position: "relative",
          height: TIMETABLE_HEIGHT,
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          overflow: "hidden",
        }}
      >
        {slotMinutes.map((minutes) => {
          const absoluteMinutes = TIMETABLE_START_HOUR * 60 + minutes;
          const isHourMark = absoluteMinutes % 60 === 0;
          return (
          <div
              key={minutes}
            style={{
              position: "absolute",
                top: `${minutes * PIXELS_PER_MINUTE}px`,
              left: 0,
              width: "100%",
                borderTop: isHourMark
                  ? "1px solid rgba(148, 163, 184, 0.35)"
                  : "1px dashed rgba(148, 163, 184, 0.2)",
            }}
          />
          );
        })}
        {events.map((event) => (
          <TimetableCard key={event.id} event={event} onSelect={onSelectEvent} />
        ))}
      </div>
    </div>
  );
}

function TimetableCard({ event, onSelect }: { event: TimetableEvent; onSelect: (event: TimetableEvent) => void }) {
  const startDate = new Date(event.start);
  const endDate = event.end ? new Date(event.end) : new Date(startDate.getTime() + 60 * 60 * 1000);
  const startMinutesAbsolute = startDate.getHours() * 60 + startDate.getMinutes();
  const endMinutesAbsolute = endDate.getHours() * 60 + endDate.getMinutes();
  const relativeStart = startMinutesAbsolute - TIMETABLE_START_HOUR * 60;
  const relativeEnd = endMinutesAbsolute - TIMETABLE_START_HOUR * 60;
  const snappedStart = Math.max(
    0,
    Math.floor(relativeStart / MINUTES_PER_SLOT) * MINUTES_PER_SLOT,
  );
  const snappedEnd = Math.max(
    snappedStart + MINUTES_PER_SLOT,
    Math.min(TOTAL_MINUTES, Math.ceil(relativeEnd / MINUTES_PER_SLOT) * MINUTES_PER_SLOT),
  );
  const top = snappedStart * PIXELS_PER_MINUTE;
  const height = Math.max(MINUTES_PER_SLOT * PIXELS_PER_MINUTE, (snappedEnd - snappedStart) * PIXELS_PER_MINUTE);

  return (
    <div
      style={{
        position: "absolute",
        left: "6px",
        right: "6px",
        top,
        height,
        borderRadius: "12px",
        padding: "0.55rem 0.7rem",
        backgroundColor: "rgba(14, 165, 233, 0.12)",
        border: "1px solid rgba(14, 165, 233, 0.4)",
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
        cursor: "pointer",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(event)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(event);
        }
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 18px rgba(14, 165, 233, 0.25)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{event.title}</span>
      <span style={{ color: "#475569", fontSize: "0.8rem" }}>{formatTimeRange(startDate, endDate)}</span>
    </div>
  );
}

function formatHour(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", hourCycle: "h23" }).format(date);
}

type EventModalProps = {
  event: TimetableEvent | null;
  leadsById: Record<string, LeadSummary>;
  onClose: () => void;
  onUpdated: (meeting: Meeting) => void;
  onDeleted: (id: string) => void;
};

function EventModal({ event, leadsById, onClose, onUpdated, onDeleted }: EventModalProps) {
  const [form, setForm] = useState({
    title: "",
    leadId: "",
    scheduledDate: "",
    scheduledTime: "",
    endDate: "",
    endTime: "",
    channel: "phone" as MeetingChannel,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!event) {
      setForm({
        title: "",
        leadId: "",
        scheduledDate: "",
        scheduledTime: "",
        endDate: "",
        endTime: "",
        channel: "phone",
        notes: "",
      });
      setFeedback(null);
      return;
    }

    if (event.source === "notion") {
      setForm({
        title: "",
        leadId: "",
        scheduledDate: "",
        scheduledTime: "",
        endDate: "",
        endTime: "",
        channel: "phone",
        notes: "",
      });
      setFeedback(null);
      return;
    }

    const startParts = splitDateTime(event.start);
    const endParts = splitDateTime(event.end ?? null);
    setForm({
      title: event.title ?? "",
      leadId: event.leadId ?? "",
      scheduledDate: startParts.date,
      scheduledTime: startParts.time,
      endDate: endParts.date,
      endTime: endParts.time,
      channel: event.channel ?? "phone",
      notes: event.notes ?? "",
    });
    setFeedback(null);
  }, [event]);

  if (!event) return null;

  const isEditable = event.source !== "notion";
  const leadName = event.leadName ?? (event.leadId ? leadsById[event.leadId]?.name : undefined);
  const startDate = new Date(event.start);
  const endDate = event.end ? new Date(event.end) : null;

  const handleOverlayClick = () => {
    if (saving || deleting) return;
    onClose();
  };

  const handleUpdate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isEditable) {
      onClose();
      return;
    }
    if (!form.scheduledDate || !form.scheduledTime) {
      setFeedback("Start date and time are required.");
      return;
    }
    const scheduledAt = combineDateTime(form.scheduledDate, form.scheduledTime);
    if (!scheduledAt) {
      setFeedback("Invalid start date/time.");
      return;
    }
    const endAt =
      form.endDate || form.endTime
        ? combineDateTime(form.endDate || form.scheduledDate, form.endTime || form.scheduledTime)
        : null;

    try {
      setSaving(true);
      setFeedback(null);
      const res = await fetch("/api/meetings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: event.id,
          title: form.title.trim() || undefined,
          leadId: form.leadId || null,
          scheduledAt,
          endAt,
          channel: form.channel,
          notes: form.notes.trim() ? form.notes : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to update event");
      }
      onUpdated(data as Meeting);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEditable) {
      onClose();
      return;
    }
    try {
      setDeleting(true);
      setFeedback(null);
      const res = await fetch("/api/meetings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to delete event");
      }
      onDeleted(event.id);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      style={modalOverlayStyle}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-modal-title"
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 id="event-modal-title" style={{ margin: 0 }}>
              {event.title}
            </h2>
            <span style={sourceBadgeStyle(event.source)}>{event.source}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "1.2rem",
              cursor: "pointer",
              color: "#475569",
            }}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <section style={{ marginTop: "0.75rem", marginBottom: "1rem", color: "#475569", fontSize: "0.9rem" }}>
          <div>Lead: {leadName || "—"}</div>
          <div>
            Time: {formatTimeRange(startDate, endDate ?? new Date(startDate.getTime() + 60 * 60 * 1000))}
          </div>
          {event.location && <div>Location: {event.location}</div>}
          {event.url && (
            <div>
              Link:{" "}
              <a href={event.url} target="_blank" rel="noreferrer" style={{ color: "#0ea5e9" }}>
                Open in Notion
              </a>
            </div>
          )}
        </section>

        {feedback && (
          <p style={{ color: "#e11d48", fontSize: "0.85rem", marginTop: 0 }}>
            {feedback}
          </p>
        )}

        {isEditable ? (
          <form
            onSubmit={handleUpdate}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "0.75rem 1rem",
            }}
          >
            <label style={labelStyle}>
              Title
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Discovery call"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Lead
              <select
                value={form.leadId}
                onChange={(e) => setForm((prev) => ({ ...prev, leadId: e.target.value }))}
                style={inputStyle}
              >
                <option value="">— No lead —</option>
                {Object.values(leadsById).map((lead) => (
                  <option key={lead.key} value={lead.key}>
                    {lead.name} ({lead.callStatus})
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Starts on
              <input
                type="date"
                value={form.scheduledDate}
                onChange={(e) => setForm((prev) => ({ ...prev, scheduledDate: e.target.value }))}
                required
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Starts at
              <select
                value={form.scheduledTime}
                onChange={(e) => setForm((prev) => ({ ...prev, scheduledTime: e.target.value }))}
                required
                style={inputStyle}
              >
                <option value="" disabled>
                  Select time
                </option>
                {TIME_OPTIONS.map((timeOption) => (
                  <option key={timeOption} value={timeOption}>
                    {timeOption}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Ends on (optional)
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Ends at (optional)
              <select
                value={form.endTime}
                onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
                style={inputStyle}
              >
                <option value="">—</option>
                {TIME_OPTIONS.map((timeOption) => (
                  <option key={timeOption} value={timeOption}>
                    {timeOption}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Channel
              <select
                value={form.channel}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, channel: e.target.value as MeetingChannel }))
                }
                style={inputStyle}
              >
                {channelOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
              Notes
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                style={{ ...inputStyle, resize: "vertical" }}
                placeholder="Reminder: confirm budget before meeting."
              />
            </label>
            <div style={{ display: "flex", gap: "0.75rem", gridColumn: "1 / -1" }}>
              <button
                type="submit"
                style={actionButtonStyle("#0f172a", "#e9edf4")}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={actionButtonStyle("#b91c1c", "#fee2e2")}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ color: "#475569", fontSize: "0.88rem", lineHeight: 1.6 }}>
            {event.notes && (
              <p style={{ marginTop: 0 }}>
                Notes: {event.notes}
              </p>
            )}
            <p style={{ marginBottom: 0 }}>
              This event is synced from Notion. Edit or delete it from Notion to update it here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(15, 23, 42, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: "1.5rem",
};

const modalStyle: CSSProperties = {
  width: "min(640px, 100%)",
  maxHeight: "90vh",
  overflowY: "auto",
  backgroundColor: "#ffffff",
  borderRadius: "18px",
  padding: "1.5rem",
  boxShadow: "0 20px 45px rgba(15, 23, 42, 0.25)",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const timetableWrapperStyle: CSSProperties = {
  padding: "1.25rem",
  borderRadius: "18px",
  background: "#eef2f8",
  border: "1px solid rgba(255,255,255,0.9)",
  boxShadow: "12px 12px 26px #cfd4dc, -10px -10px 22px #f9fbff",
};

