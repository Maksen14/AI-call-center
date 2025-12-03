"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { DEFAULT_CALL_STATUS, type CallStatus } from "@/lib/callStatus";
import { useCallQueue, type Lead, type QueueLead } from "@/lib/useCallQueue";

const statusColor: Record<Lead["websiteCategory"], string> = {
  none: "#e11d48",
  social: "#f97316",
  real: "#16a34a",
};

type PlacesDbResponse = {
  places?: Array<
    Lead & {
      callStatus: CallStatus;
    }
  >;
};

export default function CallLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    async function loadPlaces() {
      try {
        setLoading(true);
        const res = await fetch("/api/places-db");
        if (!res.ok) {
          throw new Error("Failed to load leads");
        }
        const data = (await res.json()) as PlacesDbResponse;
        const normalized: Lead[] =
          data.places?.map((p) => ({
            key: p.key,
            name: p.name,
            phoneNumber: p.phoneNumber ?? null,
            websiteUri: p.websiteUri ?? null,
            websiteCategory: p.websiteCategory ?? "none",
            callStatus: p.callStatus ?? DEFAULT_CALL_STATUS,
            notes: p.notes,
            city: p.city,
            restaurantType: p.restaurantType,
          })) ?? [];
        setLeads(normalized);
        setSelectedKeys((prev) =>
          prev.size > 0
            ? prev
            : new Set(normalized.filter((lead) => lead.callStatus === "Not called").map((lead) => lead.key)),
        );
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    loadPlaces();
  }, []);

  const selectedLeads = useMemo(
    () => leads.filter((lead) => selectedKeys.has(lead.key)),
    [leads, selectedKeys],
  );

  const queueManager = useCallQueue(selectedLeads, { autoAdvanceDelayMs: 1500 });
  const { queue, activeIndex, isRunning, pendingCount, errorCount, start, stop, resetQueue, startedAt, updatedAt } =
    queueManager;

  useEffect(() => {
    const current = queue[activeIndex ?? -1];
    if (!current) return;
    const entry = `${new Date().toLocaleTimeString()} · ${current.name} — ${current.status.toUpperCase()}${
      current.error ? ` (${current.error})` : ""
    }`;
    setLog((prev) => (prev[prev.length - 1] === entry ? prev : [...prev.slice(-49), entry]));
  }, [queue, activeIndex]);

  const handleToggleSelection = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedKeys(new Set(leads.map((lead) => lead.key)));
  };

  const handleSelectNone = () => {
    setSelectedKeys(new Set());
    stop();
    setLog([]);
  };

  const handleSelectNotCalled = () => {
    setSelectedKeys(new Set(leads.filter((lead) => lead.callStatus === "Not called").map((lead) => lead.key)));
    setLog([]);
  };

  const activeLead = activeIndex !== null ? queue[activeIndex] : null;
  const totalSelected = selectedLeads.length;
  const finishedCount = queue.filter((lead) => lead.status === "success").length;

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
          <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: 700 }}>Call leads</h1>
          <p style={{ margin: 0, color: "#475569" }}>
            Pick the leads you want to dial, then hit run to start the queue. You&apos;ll see live updates as each call is attempted.
          </p>
          {error && (
            <p style={{ color: "#e11d48", margin: 0 }}>
              Error: <span style={{ fontFamily: "monospace" }}>{error}</span>
            </p>
          )}
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "0.8rem",
          }}
        >
          {[
            { label: "Selected", value: totalSelected },
            { label: "Pending", value: pendingCount },
            { label: "Finished", value: finishedCount },
            { label: "Errors", value: errorCount },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                padding: "0.9rem 1rem",
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
              <span style={{ fontSize: "1.4rem", fontWeight: 700 }}>{card.value}</span>
            </div>
          ))}
        </section>

        <section
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={handleSelectAll}
            style={pillButtonStyle}
            disabled={loading}
          >
            Select all
          </button>
          <button
            type="button"
            onClick={handleSelectNotCalled}
            style={pillButtonStyle}
            disabled={loading}
          >
            Select not called
          </button>
          <button
            type="button"
            onClick={handleSelectNone}
            style={pillButtonStyle}
            disabled={loading}
          >
            Clear selection
          </button>
          <span style={{ alignSelf: "center", color: "#475569", fontSize: "0.9rem" }}>
            {leads.length} leads available
          </span>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: "1.25rem",
          }}
        >
          <div
            style={{
              padding: "1.25rem",
              borderRadius: "18px",
              background: "#eef2f8",
              border: "1px solid rgba(255,255,255,0.9)",
              boxShadow: "12px 12px 26px #cfd4dc, -10px -10px 22px #f9fbff",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <strong style={{ fontSize: "1rem" }}>Queue controller</strong>
                <span style={{ color: "#475569", fontSize: "0.9rem" }}>
                  {isRunning
                    ? activeLead
                      ? `Calling ${activeLead.name} (${activeLead.phoneNumber ?? "no phone"})`
                      : "Running..."
                    : "Idle"}
                </span>
                <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                  Started: {startedAt ? new Date(startedAt).toLocaleTimeString() : "—"} · Updated:{" "}
                  {updatedAt ? new Date(updatedAt).toLocaleTimeString() : "—"}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={start}
                  disabled={isRunning || totalSelected === 0}
                  style={actionButtonStyle("#0f172a", "#e9edf4")}
                >
                  Run queue
                </button>
                <button
                  type="button"
                  onClick={stop}
                  disabled={!isRunning}
                  style={actionButtonStyle("#b91c1c", "#fef2f2")}
                >
                  Stop
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetQueue();
                    setLog([]);
                  }}
                  style={actionButtonStyle("#0369a1", "#e0f2fe")}
                >
                  Reset
                </button>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.9rem",
                  tableLayout: "fixed",
                }}
              >
                <colgroup>
                  <col style={{ width: "34%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <tr>
                    <th style={queueHeaderCell}>Lead</th>
                    <th style={queueHeaderCell}>Phone</th>
                    <th style={queueHeaderCell}>Website</th>
                    <th style={queueHeaderCell}>Website status</th>
                    <th style={queueHeaderCell}>Call status</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: "0.75rem", color: "#94a3b8", textAlign: "center" }}>
                        No leads selected. Pick some from the list below to build a queue.
                      </td>
                    </tr>
                  ) : (
                    queue.map((lead, index) => (
                      <tr
                        key={lead.key}
                        style={{
                          backgroundColor: index % 2 === 0 ? "#ffffff" : "#f8fafc",
                          borderTop: "1px solid #e2e8f0",
                        }}
                      >
                        <td style={queueCellStyle(index === activeIndex)}>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <strong>{lead.name}</strong>
                            <span style={{ color: "#64748b", fontSize: "0.8rem" }}>{lead.key}</span>
                          </div>
                        </td>
                        <td style={queueCellStyle(index === activeIndex)}>{lead.phoneNumber ?? "—"}</td>
                        <td style={queueCellStyle(index === activeIndex)}>
                          {lead.websiteUri ? (
                            <a
                              href={lead.websiteUri}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "#0ea5e9", textDecoration: "none" }}
                            >
                              {lead.websiteUri}
                            </a>
                          ) : (
                            <span style={{ color: "#94a3b8" }}>No website</span>
                          )}
                        </td>
                        <td style={queueCellStyle(index === activeIndex)}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.35rem",
                              padding: "0.25rem 0.55rem",
                              borderRadius: "999px",
                              backgroundColor: "#ffffff",
                              border: "1px solid #e2e8f0",
                              color: statusColor[lead.websiteCategory],
                              fontSize: "0.8rem",
                              fontWeight: 600,
                            }}
                          >
                            <span
                              style={{
                                display: "inline-block",
                                width: "0.45rem",
                                height: "0.45rem",
                                borderRadius: "50%",
                                backgroundColor: statusColor[lead.websiteCategory],
                              }}
                            />
                            {lead.websiteCategory}
                          </span>
                        </td>
                        <td style={queueCellStyle(index === activeIndex)}>
                          <StatusBadge status={lead.status} error={lead.error} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div
            style={{
              padding: "1.25rem",
              borderRadius: "18px",
              background: "#eef2f8",
              border: "1px solid rgba(255,255,255,0.9)",
              boxShadow: "12px 12px 26px #cfd4dc, -10px -10px 22px #f9fbff",
            }}
          >
            <strong style={{ fontSize: "1rem" }}>Event log</strong>
            <div
              style={{
                marginTop: "0.75rem",
                maxHeight: "220px",
                overflowY: "auto",
                borderRadius: "12px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
              }}
            >
              {log.length === 0 ? (
                <p style={{ margin: "0.75rem", color: "#94a3b8", fontSize: "0.85rem" }}>No calls yet.</p>
              ) : (
                <ul style={{ margin: 0, padding: "0.75rem 1rem", listStyle: "none", color: "#0f172a" }}>
                  {log
                    .slice()
                    .reverse()
                    .map((entry, idx) => (
                      <li key={idx} style={{ fontSize: "0.82rem", marginBottom: "0.5rem" }}>
                        {entry}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <div
          style={{
            padding: "1.25rem",
            borderRadius: "18px",
            background: "#eef2f8",
            border: "1px solid rgba(255,255,255,0.9)",
            boxShadow: "12px 12px 26px #cfd4dc, -10px -10px 22px #f9fbff",
          }}
        >
          <strong style={{ display: "block", marginBottom: "0.75rem" }}>Leads database</strong>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.9rem",
                tableLayout: "fixed",
              }}
            >
              <colgroup>
                <col style={{ width: "6%" }} />
                <col style={{ width: "28%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <tr>
                  <th style={queueHeaderCell}>Select</th>
                  <th style={queueHeaderCell}>Lead</th>
                  <th style={queueHeaderCell}>Phone</th>
                  <th style={queueHeaderCell}>Website</th>
                  <th style={queueHeaderCell}>Website status</th>
                  <th style={queueHeaderCell}>Call status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "0.75rem", textAlign: "center", color: "#94a3b8" }}>
                      Loading leads...
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "0.75rem", textAlign: "center", color: "#94a3b8" }}>
                      No leads found in the database yet.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead, idx) => (
                    <tr
                      key={lead.key}
                      style={{
                        backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                      }}
                    >
                      <td style={{ padding: "0.55rem 0.75rem", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(lead.key)}
                          onChange={() => handleToggleSelection(lead.key)}
                        />
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem" }}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <strong>{lead.name}</strong>
                          <span style={{ color: "#64748b", fontSize: "0.8rem" }}>{lead.key}</span>
                        </div>
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem" }}>{lead.phoneNumber ?? "—"}</td>
                      <td
                        style={{
                          padding: "0.55rem 0.75rem",
                          fontSize: "0.85rem",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: "#0ea5e9",
                        }}
                      >
                        {lead.websiteUri ? (
                          <a
                            href={lead.websiteUri}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "#0ea5e9", textDecoration: "none" }}
                          >
                            {lead.websiteUri}
                          </a>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>No website</span>
                        )}
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            padding: "0.25rem 0.55rem",
                            borderRadius: "999px",
                            backgroundColor: "#ffffff",
                            border: "1px solid #e2e8f0",
                            color: statusColor[lead.websiteCategory],
                            fontSize: "0.82rem",
                            fontWeight: 700,
                          }}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              width: "0.48rem",
                              height: "0.48rem",
                              borderRadius: "50%",
                              backgroundColor: statusColor[lead.websiteCategory],
                            }}
                          />
                          {lead.websiteCategory}
                        </span>
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem", color: "#0f172a", fontSize: "0.82rem" }}>
                        {lead.callStatus}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ status, error }: { status: QueueLead["status"]; error?: string }) {
  const palette: Record<QueueLead["status"], { bg: string; color: string }> = {
    pending: { bg: "#f8fafc", color: "#475569" },
    calling: { bg: "#fffbeb", color: "#b45309" },
    success: { bg: "#ecfdf3", color: "#15803d" },
    error: { bg: "#fef2f2", color: "#b91c1c" },
    skipped: { bg: "#f1f5f9", color: "#64748b" },
  };
  const paletteEntry = palette[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.25rem 0.55rem",
        borderRadius: "999px",
        backgroundColor: paletteEntry.bg,
        color: paletteEntry.color,
        fontSize: "0.82rem",
        fontWeight: 600,
      }}
      title={error}
    >
      <span
        style={{
          display: "inline-block",
          width: "0.45rem",
          height: "0.45rem",
          borderRadius: "50%",
          backgroundColor: paletteEntry.color,
        }}
      />
      {status}
    </span>
  );
}

const pillButtonStyle: CSSProperties = {
  padding: "0.55rem 0.95rem",
  fontSize: "0.85rem",
  fontWeight: 600,
  borderRadius: "12px",
  border: "none",
  background: "#eef2f8",
  color: "#0f172a",
  cursor: "pointer",
  boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
};

const queueHeaderCell: CSSProperties = {
  textAlign: "left",
  padding: "0.55rem 0.75rem",
  color: "#0f172a",
  fontWeight: 600,
  fontSize: "0.85rem",
};

function queueCellStyle(isActive: boolean): CSSProperties {
  return {
    padding: "0.55rem 0.75rem",
    color: isActive ? "#0f172a" : "#1f2937",
    fontWeight: isActive ? 600 : 500,
  };
}

function actionButtonStyle(textColor: string, background: string): CSSProperties {
  return {
    padding: "0.65rem 1.1rem",
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

