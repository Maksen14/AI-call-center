"use client";

import Link from "next/link";
import { useState } from "react";

type ApiResponse = { ok?: boolean; [key: string]: unknown };

export default function TestingPage() {
  const [leadId, setLeadId] = useState("");
  const [batchLeadIds, setBatchLeadIds] = useState("");
  const [batchLimit, setBatchLimit] = useState<number | undefined>(5);
  const [meetingScheduledAt, setMeetingScheduledAt] = useState("");
  const [meetingChannel, setMeetingChannel] = useState<"phone" | "video" | "in-person">("phone");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [webhookPayload, setWebhookPayload] = useState(
    JSON.stringify(
      {
        id: "vapi-call-id",
        status: "completed",
        summary: "Call completed successfully",
        metadata: { leadId: "some-key" },
      },
      null,
      2
    )
  );
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function callApi(url: string, body: unknown) {
    setLoading(true);
    setResult("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as ApiResponse;
      setResult(JSON.stringify(json, null, 2));
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

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
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "2.5rem 1.25rem 3rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        <header style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
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
          <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: 700 }}>Testing console</h1>
          <p style={{ margin: 0, color: "#475569" }}>
            Quick UI to trigger the new API endpoints and webhook simulator.
          </p>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          <section
            style={{
              padding: "1rem",
              borderRadius: "14px",
              background: "#eef2f8",
              boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
              border: "1px solid rgba(255,255,255,0.8)",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Start call (single)</h2>
            <label style={{ fontSize: "0.9rem", color: "#475569" }}>
              Lead ID (place key)
              <input
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                placeholder="place-key"
                style={{
                  width: "100%",
                  marginTop: "0.35rem",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "10px",
                  border: "1px solid #d8dde6",
                  background: "#eef2f8",
                  boxShadow: "inset 4px 4px 10px #d1d6de, inset -4px -4px 10px #f8fbff",
                }}
              />
            </label>
            <button
              onClick={() => callApi("/api/calls/start", { leadId })}
              disabled={loading || !leadId}
              style={{
                padding: "0.65rem",
                borderRadius: "10px",
                border: "none",
                background: "#e9edf4",
                boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
                cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? "Working..." : "Start call"}
            </button>
          </section>

          <section
            style={{
              padding: "1rem",
              borderRadius: "14px",
              background: "#eef2f8",
              boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
              border: "1px solid rgba(255,255,255,0.8)",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Start calls (batch)</h2>
            <label style={{ fontSize: "0.9rem", color: "#475569" }}>
              Lead IDs (comma separated)
              <input
                value={batchLeadIds}
                onChange={(e) => setBatchLeadIds(e.target.value)}
                placeholder="key1,key2"
                style={{
                  width: "100%",
                  marginTop: "0.35rem",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "10px",
                  border: "1px solid #d8dde6",
                  background: "#eef2f8",
                  boxShadow: "inset 4px 4px 10px #d1d6de, inset -4px -4px 10px #f8fbff",
                }}
              />
            </label>
            <label style={{ fontSize: "0.9rem", color: "#475569" }}>
              Limit (ignored if IDs provided)
              <input
                type="number"
                value={batchLimit ?? ""}
                onChange={(e) => setBatchLimit(e.target.value ? Number(e.target.value) : undefined)}
                style={{
                  width: "100%",
                  marginTop: "0.35rem",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "10px",
                  border: "1px solid #d8dde6",
                  background: "#eef2f8",
                  boxShadow: "inset 4px 4px 10px #d1d6de, inset -4px -4px 10px #f8fbff",
                }}
              />
            </label>
            <button
              onClick={() =>
                callApi("/api/calls/start-batch", {
                  leadIds: batchLeadIds
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  limit: batchLimit,
                })
              }
              disabled={loading}
              style={{
                padding: "0.65rem",
                borderRadius: "10px",
                border: "none",
                background: "#e9edf4",
                boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
                cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? "Working..." : "Start batch"}
            </button>
          </section>

          <section
            style={{
              padding: "1rem",
              borderRadius: "14px",
              background: "#eef2f8",
              boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
              border: "1px solid rgba(255,255,255,0.8)",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Create meeting</h2>
            <label style={{ fontSize: "0.9rem", color: "#475569" }}>
              Lead ID (place key)
              <input
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                placeholder="place-key"
                style={{
                  width: "100%",
                  marginTop: "0.35rem",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "10px",
                  border: "1px solid #d8dde6",
                  background: "#eef2f8",
                  boxShadow: "inset 4px 4px 10px #d1d6de, inset -4px -4px 10px #f8fbff",
                }}
              />
            </label>
            <label style={{ fontSize: "0.9rem", color: "#475569" }}>
              Scheduled At (ISO)
              <input
                value={meetingScheduledAt}
                onChange={(e) => setMeetingScheduledAt(e.target.value)}
                placeholder="2025-11-30T10:00:00.000Z"
                style={{
                  width: "100%",
                  marginTop: "0.35rem",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "10px",
                  border: "1px solid #d8dde6",
                  background: "#eef2f8",
                  boxShadow: "inset 4px 4px 10px #d1d6de, inset -4px -4px 10px #f8fbff",
                }}
              />
            </label>
            <label style={{ fontSize: "0.9rem", color: "#475569" }}>
              Channel
              <select
                value={meetingChannel}
                onChange={(e) => setMeetingChannel(e.target.value as "phone" | "video" | "in-person")}
                style={{
                  width: "100%",
                  marginTop: "0.35rem",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "10px",
                  border: "1px solid #d8dde6",
                  background: "#eef2f8",
                  boxShadow: "inset 4px 4px 10px #d1d6de, inset -4px -4px 10px #f8fbff",
                }}
              >
                <option value="phone">phone</option>
                <option value="video">video</option>
                <option value="in-person">in-person</option>
              </select>
            </label>
            <label style={{ fontSize: "0.9rem", color: "#475569" }}>
              Notes
              <textarea
                value={meetingNotes}
                onChange={(e) => setMeetingNotes(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  marginTop: "0.35rem",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "10px",
                  border: "1px solid #d8dde6",
                  background: "#eef2f8",
                  boxShadow: "inset 4px 4px 10px #d1d6de, inset -4px -4px 10px #f8fbff",
                }}
              />
            </label>
            <button
              onClick={() =>
                callApi("/api/meetings/create", {
                  leadId,
                  scheduledAt: meetingScheduledAt,
                  channel: meetingChannel,
                  notes: meetingNotes || undefined,
                })
              }
              disabled={loading || !leadId || !meetingScheduledAt}
              style={{
                padding: "0.65rem",
                borderRadius: "10px",
                border: "none",
                background: "#e9edf4",
                boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
                cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? "Working..." : "Create meeting"}
            </button>
          </section>

          <section
            style={{
              padding: "1rem",
              borderRadius: "14px",
              background: "#eef2f8",
              boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
              border: "1px solid rgba(255,255,255,0.8)",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Simulate Vapi webhook</h2>
            <textarea
              value={webhookPayload}
              onChange={(e) => setWebhookPayload(e.target.value)}
              rows={8}
              style={{
                width: "100%",
                padding: "0.6rem 0.75rem",
                borderRadius: "10px",
                border: "1px solid #d8dde6",
                background: "#eef2f8",
                boxShadow: "inset 4px 4px 10px #d1d6de, inset -4px -4px 10px #f8fbff",
                fontFamily: "monospace",
              }}
            />
            <button
              onClick={() => {
                try {
                  const parsed = JSON.parse(webhookPayload);
                  callApi("/api/vapi/webhook", parsed);
                } catch (err) {
                  setResult(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
                }
              }}
              disabled={loading}
              style={{
                padding: "0.65rem",
                borderRadius: "10px",
                border: "none",
                background: "#e9edf4",
                boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
                cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? "Working..." : "Send webhook payload"}
            </button>
          </section>
        </div>

        <section
          style={{
            padding: "1rem",
            borderRadius: "14px",
            background: "#eef2f8",
            boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
            border: "1px solid rgba(255,255,255,0.8)",
          }}
        >
          <h2 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem" }}>Result</h2>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#e9edf4",
              padding: "0.75rem",
              borderRadius: "10px",
              border: "1px solid #d8dde6",
              minHeight: "120px",
            }}
          >
            {result || "No response yet."}
          </pre>
        </section>
      </div>
    </main>
  );
}
