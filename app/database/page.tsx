"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CALL_STATUSES, type CallStatus } from "@/lib/callStatus";

type DbPlace = {
  key: string;
  name: string;
  phoneNumber: string | null;
  websiteUri: string | null;
  websiteCategory: "none" | "social" | "real";
  callStatus: CallStatus;
};

const statusColor: Record<DbPlace["websiteCategory"], string> = {
  none: "#e11d48",
  social: "#f97316",
  real: "#16a34a",
};

export default function DatabasePage() {
  const [places, setPlaces] = useState<DbPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const total = places.length;
  const byStatus = places.reduce(
    (acc, p) => {
      acc[p.websiteCategory] += 1;
      return acc;
    },
    { none: 0, social: 0, real: 0 }
  );
  const callStatusCounts = useMemo(() => {
    return CALL_STATUSES.reduce((acc, status) => {
      acc[status] = places.filter((p) => p.callStatus === status).length;
      return acc;
    }, {} as Record<CallStatus, number>);
  }, [places]);

  async function loadPlaces() {
    try {
      setLoading(true);
      const res = await fetch("/api/places-db");
      if (!res.ok) {
        throw new Error("Failed to load database");
      }
      const data = (await res.json()) as { places?: DbPlace[] };
      setPlaces(data.places ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlaces();
  }, []);

  async function handleRemove(key: string) {
    try {
      setLoading(true);
      const res = await fetch("/api/places-db", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) {
        const data = await res.json();
        const msg = (data as { error?: string }).error ?? "Remove failed";
        throw new Error(msg);
      }
      setPlaces((prev) => prev.filter((p) => p.key !== key));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateCallStatus(key: string, callStatus: CallStatus) {
    try {
      setUpdatingKey(key);
      const res = await fetch("/api/places-db", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, callStatus }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        const msg = data?.error ?? "Update failed";
        throw new Error(msg);
      }
      setPlaces((prev) =>
        prev.map((place) =>
          place.key === key ? { ...place, callStatus } : place,
        ),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingKey(null);
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
          <p style={{ margin: 0, color: "#475569" }}>
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
          <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: 700 }}>Saved places database</h1>
          <p style={{ margin: 0, color: "#475569" }}>
            View and remove entries stored locally. This data lives in a JSON file under <code>data/places-db.json</code>.
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
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "0.8rem",
          }}
        >
          {[
            { label: "Total saved", value: total, accent: "#0f172a" },
            { label: "No website", value: byStatus.none, accent: statusColor.none },
            { label: "Social only", value: byStatus.social, accent: statusColor.social },
            { label: "Real website", value: byStatus.real, accent: statusColor.real },
          ].map((item) => (
            <div
              key={item.label}
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
              <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{item.label}</span>
              <span style={{ fontSize: "1.5rem", fontWeight: 700, color: item.accent }}>
                {item.value}
              </span>
            </div>
          ))}
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: "0.8rem",
          }}
        >
          {CALL_STATUSES.map((status) => (
            <div
              key={status}
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
              <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{status}</span>
              <span style={{ fontSize: "1.4rem", fontWeight: 700, color: "#0f172a" }}>
                {callStatusCounts[status]}
              </span>
            </div>
          ))}
        </section>

        <div
          style={{
            padding: "1.25rem",
            borderRadius: "18px",
            background: "#eef2f8",
            border: "1px solid rgba(255,255,255,0.9)",
            boxShadow: "12px 12px 26px #cfd4dc, -10px -10px 22px #f9fbff",
            minHeight: "60vh",
            overflow: "hidden",
          }}
        >
          {loading && places.length === 0 ? (
            <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#94a3b8" }}>
              Loading...
            </div>
          ) : places.length === 0 ? (
            <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#94a3b8" }}>
              No places saved yet.
            </div>
          ) : (
            <div style={{ overflowX: "auto", overflowY: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.92rem",
                  tableLayout: "fixed",
                  minWidth: "100%",
                }}
              >
                <colgroup>
                  <col style={{ width: "24%" }} />
                  <col style={{ width: "17%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "10%" }} />
                </colgroup>
                <thead style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <tr>
                    <th style={{ textAlign: "left", padding: "0.55rem 0.75rem", color: "#0f172a" }}>Name</th>
                    <th style={{ textAlign: "left", padding: "0.55rem 0.75rem", color: "#0f172a" }}>Phone</th>
                    <th style={{ textAlign: "left", padding: "0.55rem 0.75rem", color: "#0f172a" }}>Website</th>
                    <th style={{ textAlign: "left", padding: "0.55rem 0.75rem", color: "#0f172a" }}>Website status</th>
                    <th style={{ textAlign: "left", padding: "0.55rem 0.75rem", color: "#0f172a" }}>Call status</th>
                    <th style={{ textAlign: "left", padding: "0.55rem 0.75rem", color: "#0f172a" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {places.map((place, idx) => (
                    <tr
                      key={place.key || idx}
                      style={{
                        backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                      }}
                    >
                      <td style={{ padding: "0.55rem 0.75rem", color: "#0f172a" }}>{place.name}</td>
                      <td
                        style={{
                          padding: "0.55rem 0.75rem",
                          color: "#0f172a",
                          fontSize: "0.85rem",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {place.phoneNumber ?? "—"}
                      </td>
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
                        {place.websiteUri ? (
                          <a
                            href={place.websiteUri}
                            target="_blank"
                            rel="noreferrer"
                            title={place.websiteUri}
                            style={{
                              color: "#0ea5e9",
                              textDecoration: "none",
                              display: "inline-block",
                              maxWidth: "100%",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              verticalAlign: "bottom",
                            }}
                          >
                            {place.websiteUri}
                          </a>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>No URL provided</span>
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
                            color: statusColor[place.websiteCategory],
                            fontSize: "0.82rem",
                            fontWeight: 700,
                            marginRight: "0.5rem",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              width: "0.48rem",
                              height: "0.48rem",
                              borderRadius: "50%",
                              backgroundColor: statusColor[place.websiteCategory],
                            }}
                          />
                          {place.websiteCategory}
                        </span>
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem" }}>
                        <select
                          value={place.callStatus}
                          onChange={(e) => handleUpdateCallStatus(place.key, e.target.value as CallStatus)}
                          disabled={updatingKey === place.key}
                          style={{
                            width: "100%",
                            padding: "0.45rem 0.5rem",
                            borderRadius: "10px",
                            border: "1px solid #cbd5f5",
                            background: "#f8fafc",
                            color: "#0f172a",
                            fontSize: "0.82rem",
                            cursor: updatingKey === place.key ? "wait" : "pointer",
                          }}
                        >
                          {CALL_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem" }}>
                        <button
                          type="button"
                          onClick={() => handleRemove(place.key)}
                          disabled={loading}
                          style={{
                            padding: "0.45rem 0.75rem",
                            fontSize: "0.82rem",
                            fontWeight: 600,
                            borderRadius: "10px",
                            border: "none",
                            background: "#fef2f2",
                            color: "#b91c1c",
                            cursor: loading ? "default" : "pointer",
                            boxShadow: "inset 4px 4px 8px #e0e0e0, inset -3px -3px 8px #ffffff",
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
