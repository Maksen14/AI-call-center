"use client";

import { FormEvent, useEffect, useState } from "react";
import jsPDF from "jspdf";
import { DEFAULT_CALL_STATUS, type CallStatus } from "@/lib/callStatus";

type PlaceResult = {
  name: string;
  phoneNumber: string | null;
  websiteUri: string | null;
  websiteCategory: "none" | "social" | "real";
  callStatus?: CallStatus;
};

type ScanResponse = {
  city: string;
  textQuery: string | null;
  nextPageToken: string | null;
  totalFoundThisPage: number;
  withoutWebsiteCount: number;
  socialOnlyCount: number;
  realWebsiteCount: number;
  places: PlaceResult[];
};

const categoryLabel: Record<PlaceResult["websiteCategory"], string> = {
  none: "No website",
  social: "Social only",
  real: "Real website",
};

const statusColor: Record<PlaceResult["websiteCategory"], string> = {
  none: "#e11d48",
  social: "#f97316",
  real: "#16a34a",
};

const categoryOrder: Record<PlaceResult["websiteCategory"], number> = {
  none: 0,
  social: 1,
  real: 2,
};

function sortPlaces(places: PlaceResult[]): PlaceResult[] {
  return [...places].sort((a, b) => {
    const diff = categoryOrder[a.websiteCategory] - categoryOrder[b.websiteCategory];
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}

function computeStats(places: PlaceResult[]) {
  return {
    total: places.length,
    withoutWebsiteCount: places.filter((p) => p.websiteCategory === "none").length,
    socialOnlyCount: places.filter((p) => p.websiteCategory === "social").length,
    realWebsiteCount: places.filter((p) => p.websiteCategory === "real").length,
  };
}

function formatWebsiteLabel(url: string | null): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\\./, "");
  } catch {
    return url;
  }
}

function computePlaceKey(place: { name: string; websiteUri: string | null }): string {
  const normName = (place.name || "").trim().toLowerCase();
  const normUrl = (place.websiteUri || "").trim().toLowerCase();
  return `${normName}|${normUrl}`;
}

export default function HomePage() {
  const [city, setCity] = useState("Compiegne, France");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [savedStatuses, setSavedStatuses] = useState<Record<string, CallStatus>>({});

  const hasPlaces = !!(result && result.places.length);
  const stats = result ? computeStats(result.places) : null;

  useEffect(() => {
    async function loadSaved() {
      try {
        const res = await fetch("/api/places-db");
        if (!res.ok) return;
        const data = (await res.json()) as {
          keys?: string[];
          places?: Array<PlaceResult & { key: string; callStatus: CallStatus }>;
        };
        const places = data?.places ?? [];
        const keys = places.map((p) => p.key);
        setSavedKeys(new Set(keys));
        const statusMap: Record<string, CallStatus> = {};
        places.forEach((p) => {
          statusMap[p.key] = p.callStatus ?? DEFAULT_CALL_STATUS;
        });
        setSavedStatuses(statusMap);
      } catch {
        // ignore load errors silently for this local helper
      }
    }
    loadSaved();
  }, []);

  async function fetchScan(pageToken?: string, append = false) {
    setLoading(true);
    setError(null);
    if (!append) {
      setResult(null);
    }

    try {
      const res = await fetch("/api/places-no-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          ...(pageToken ? { pageToken } : {}),
        }),
      });

      const data = (await res.json()) as ScanResponse & { error?: string; details?: string };
      if (!res.ok) {
        console.error("API error details:", data);
        const msg =
          data.error && data.details
            ? `${data.error}: ${data.details}`
            : data.error || data.details || "Request failed";
        throw new Error(msg);
      }

      const sortedPage = sortPlaces(data.places);
      const combinedPlaces = append && result ? [...result.places, ...sortedPage] : sortedPage;
      const stats = computeStats(combinedPlaces);

      setResult({
        city: data.city,
        textQuery: data.textQuery,
        nextPageToken: data.nextPageToken,
        totalFoundThisPage: data.totalFoundThisPage,
        withoutWebsiteCount: stats.withoutWebsiteCount,
        socialOnlyCount: stats.socialOnlyCount,
        realWebsiteCount: stats.realWebsiteCount,
        places: combinedPlaces,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    await fetchScan();
  }

  async function handleLoadMore() {
    if (!result?.nextPageToken || loading) return;
    await fetchScan(result.nextPageToken, true);
  }

  async function handleAddToDb(place: PlaceResult) {
    try {
      const key = computePlaceKey(place);
      const res = await fetch("/api/places-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place }),
      });
      const data = (await res.json()) as {
        error?: string;
        key?: string;
        place?: { key: string; callStatus: CallStatus };
      };
      if (!res.ok) {
        const msg = data?.error ?? "Add failed";
        throw new Error(msg);
      }
      const placeKey = data?.key ?? key;
      setSavedKeys((prev) => {
        const next = new Set(prev);
        next.add(placeKey);
        return next;
      });
      if (data?.place) {
        setSavedStatuses((prev) => ({
          ...prev,
          [data.place.key]: data.place.callStatus ?? DEFAULT_CALL_STATUS,
        }));
      } else {
        setSavedStatuses((prev) => ({
          ...prev,
          [placeKey]: DEFAULT_CALL_STATUS,
        }));
      }
    } catch (err) {
      console.error("Failed to add to DB", err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRemoveFromDb(place: PlaceResult) {
    try {
      const key = computePlaceKey(place);
      const res = await fetch("/api/places-db", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        const msg = data?.error ?? "Remove failed";
        throw new Error(msg);
      }
      setSavedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setSavedStatuses((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err) {
      console.error("Failed to remove from DB", err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleDownloadCsv() {
    if (!result || !hasPlaces) return;

    const rows = [
      ["Name", "Phone", "Website", "Category"],
      ...result.places.map((p) => [
        p.name,
        p.phoneNumber ?? "",
        p.websiteUri ?? "",
        categoryLabel[p.websiteCategory],
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((value) => {
            const v = value ?? "";
            return `"${String(v).replace(/"/g, '""')}"`;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const safeCity = result.city.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "scan";
    a.href = url;
    a.download = `places-scan-${safeCity}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleDownloadPdf() {
    if (!result || !hasPlaces) return;

    const stats = computeStats(result.places);
    const doc = new jsPDF({ orientation: "landscape" });
    const margin = 14;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const usableWidth = pageWidth - margin * 2;
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Food places scan", margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`City: ${result.city}`, margin, y);
    y += 6;
    doc.text(`Query: ${result.textQuery ?? "restaurants search"}`, margin, y);
    y += 6;
    doc.text(
      `Totals - All: ${stats.total}, No website: ${stats.withoutWebsiteCount}, Social only: ${stats.socialOnlyCount}, With website: ${stats.realWebsiteCount}`,
      margin,
      y
    );
    y += 10;

    doc.setFontSize(11);
    const headers = ["Name", "Phone", "Website", "Category"];
    const colWidths = [0.3, 0.2, 0.32, 0.18].map((ratio) => ratio * usableWidth);
    const lineHeight = 6;
    const startX = margin;
    const headerHeight = lineHeight;

    const drawHeader = () => {
      doc.setFont("helvetica", "bold");
      headers.forEach((header, idx) => {
        const x = startX + colWidths.slice(0, idx).reduce((sum, w) => sum + w, 0);
        doc.text(header, x, y);
      });
      doc.setFont("helvetica", "normal");
      y += headerHeight;
    };

    drawHeader();

    result.places.forEach((place) => {
      const values = [
        place.name || "-",
        place.phoneNumber || "-",
        formatWebsiteLabel(place.websiteUri) || "No URL",
        categoryLabel[place.websiteCategory],
      ];
      const wrapped = values.map((val, idx) => doc.splitTextToSize(val, colWidths[idx] - 2));
      const rowLines = Math.max(...wrapped.map((w) => w.length));
      const rowHeight = rowLines * lineHeight;

      if (y + rowHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
        drawHeader();
      }

      for (let lineIdx = 0; lineIdx < rowLines; lineIdx += 1) {
        wrapped.forEach((lines, idx) => {
          const x = startX + colWidths.slice(0, idx).reduce((sum, w) => sum + w, 0);
          const text = lines[lineIdx] ?? "";
          doc.text(text, x, y);
        });
        y += lineHeight;
      }
      y += 2;
    });

    const safeCity = result.city.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "scan";
    doc.save(`places-scan-${safeCity}.pdf`);
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
        ::selection {
          background: #0ea5e9;
          color: #ffffff;
        }
      `}</style>

      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "2.75rem 1.25rem 3rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        <header style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <h1 style={{ margin: 0, fontSize: "2.1rem", fontWeight: 700, letterSpacing: "-0.01em" }}>
            Discover food spots and who actually has a website.
          </h1>
          <p style={{ margin: 0, maxWidth: "720px", fontSize: "1rem", color: "#475569", lineHeight: 1.6 }}>
            Search a city, scan nearby restaurants, cafes, and bars, then see which places have no
            website, only social links, or a real site. Export a clean CSV or PDF for outreach.
          </p>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <a
              href="/database"
              style={{
                padding: "0.65rem 1.05rem",
                fontSize: "0.9rem",
                fontWeight: 600,
                borderRadius: "12px",
                border: "none",
                background: "#eef2f8",
                color: "#0f172a",
                textDecoration: "none",
                boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
              }}
            >
              View database
            </a>
          </div>
          {hasPlaces && (
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleDownloadCsv}
                style={{
                  padding: "0.75rem 1.1rem",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  borderRadius: "14px",
                  border: "none",
                  background: "#eef2f8",
                  color: "#0f172a",
                  cursor: "pointer",
                  boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
                }}
              >
                Download CSV
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                style={{
                  padding: "0.75rem 1.1rem",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  borderRadius: "14px",
                  border: "none",
                  background: "#eef2f8",
                  color: "#0f172a",
                  cursor: "pointer",
                  boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
                }}
              >
                Export PDF
              </button>
            </div>
          )}
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: "0.8rem",
          }}
        >
          {[
            { label: "Total places", value: stats ? stats.total : "-", accent: "#0f172a" },
            { label: "No website", value: stats ? stats.withoutWebsiteCount : "-", accent: statusColor.none },
            { label: "Social only", value: stats ? stats.socialOnlyCount : "-", accent: statusColor.social },
            { label: "Real website", value: stats ? stats.realWebsiteCount : "-", accent: statusColor.real },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                padding: "1rem 1.1rem",
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
              <span style={{ fontSize: "1.6rem", fontWeight: 700, color: item.accent }}>
                {item.value}
              </span>
            </div>
          ))}
        </section>

        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <div
            style={{
              padding: "1.25rem",
              borderRadius: "18px",
              background: "#eef2f8",
              border: "1px solid rgba(255,255,255,0.9)",
              boxShadow: "12px 12px 26px #cfd4dc, -10px -10px 22px #f9fbff",
              width: "100%",
            }}
          >
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <label htmlFor="city" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                  City or area
                </label>
                <input
                  id="city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Compiegne, France"
                  style={{
                    borderRadius: "12px",
                    border: "1px solid #d8dde6",
                    padding: "0.65rem 0.8rem",
                    fontSize: "0.95rem",
                    background: "#eef2f8",
                    color: "#0f172a",
                    boxShadow: "inset 4px 4px 10px #d1d6de, inset -4px -4px 10px #f8fbff",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: "0.65rem 1.15rem",
                    fontSize: "0.9rem",
                    fontWeight: 700,
                    borderRadius: "12px",
                    border: "none",
                    background: "#e9edf4",
                    color: "#0f172a",
                    cursor: loading ? "default" : "pointer",
                    opacity: loading ? 0.8 : 1,
                    boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
                  }}
                >
                  {loading ? "Scanning..." : "Scan city"}
                </button>

                {hasPlaces && (
                  <>
                    <button
                      type="button"
                      onClick={handleDownloadCsv}
                      style={{
                        padding: "0.65rem 1.05rem",
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        borderRadius: "12px",
                        border: "none",
                        background: "#eef2f8",
                        color: "#0f172a",
                        cursor: "pointer",
                        boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
                      }}
                    >
                      Download CSV
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      style={{
                        padding: "0.65rem 1.05rem",
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        borderRadius: "12px",
                        border: "none",
                        background: "#eef2f8",
                        color: "#0f172a",
                        cursor: "pointer",
                        boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
                      }}
                    >
                      Export PDF
                    </button>
                  </>
                )}
              </div>

              {error && (
                <p style={{ fontSize: "0.9rem", color: "#e11d48", margin: 0 }}>
                  Error: <span style={{ fontFamily: "monospace" }}>{error}</span>
                </p>
              )}
            </form>

            {result && (
              <div style={{ marginTop: "1rem", color: "#475569", fontSize: "0.9rem" }}>
                <p style={{ margin: 0 }}>
                  <strong>City:</strong> {result.city}
                </p>
                <p style={{ margin: "0.3rem 0 0" }}>
                  <strong>Query:</strong> {result.textQuery ?? "restaurants search"}
                </p>
              </div>
            )}
          </div>

          <div
            style={{
              padding: "1.25rem",
              borderRadius: "18px",
              background: "#eef2f8",
              border: "1px solid rgba(255,255,255,0.9)",
              boxShadow: "12px 12px 26px #cfd4dc, -10px -10px 22px #f9fbff",
              minHeight: "55vh",
              overflow: "hidden",
            }}
          >
            {!result ? (
              <div
                style={{
                  height: "100%",
                  display: "grid",
                  placeItems: "center",
                  color: "#94a3b8",
                }}
              >
                Launch a scan to see results.
              </div>
            ) : !hasPlaces ? (
              <div
                style={{
                  height: "100%",
                  display: "grid",
                  placeItems: "center",
                  color: "#94a3b8",
                }}
              >
                No food-related places returned for this search.
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
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "24%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "10%" }} />
                  </colgroup>
                  <thead style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <tr>
                      <th style={{ textAlign: "left", padding: "0.55rem 0.75rem", color: "#0f172a" }}>
                        Name
                      </th>
                      <th style={{ textAlign: "left", padding: "0.55rem 0.75rem", color: "#0f172a" }}>
                        Phone
                      </th>
                      <th style={{ textAlign: "left", padding: "0.55rem 0.75rem", color: "#0f172a" }}>
                        Website
                      </th>
                      <th style={{ textAlign: "left", padding: "0.55rem 0.75rem", color: "#0f172a" }}>
                        Status
                      </th>
                      <th style={{ textAlign: "left", padding: "0.55rem 0.75rem", color: "#0f172a" }}>
                        Call status
                      </th>
                      <th style={{ textAlign: "left", padding: "0.55rem 0.75rem", color: "#0f172a" }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.places.map((place, idx) => {
                      const placeKey = computePlaceKey(place);
                      const isSaved = savedKeys.has(placeKey);
                      const callStatus = savedStatuses[placeKey];
                      return (
                        <tr
                          key={placeKey || `${place.name}-${idx}`}
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
                                {formatWebsiteLabel(place.websiteUri)}
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
                              {categoryLabel[place.websiteCategory]}
                            </span>
                          </td>
                          <td style={{ padding: "0.55rem 0.75rem" }}>
                            {isSaved ? (
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "0.25rem 0.55rem",
                                  borderRadius: "10px",
                                  backgroundColor: "#e0f2fe",
                                  color: "#0369a1",
                                  fontSize: "0.8rem",
                                  fontWeight: 600,
                                }}
                              >
                                {callStatus ?? DEFAULT_CALL_STATUS}
                              </span>
                            ) : (
                              <span style={{ color: "#94a3b8" }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "0.55rem 0.75rem" }}>
                            {isSaved ? (
                              <button
                                type="button"
                                onClick={() => handleRemoveFromDb(place)}
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
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddToDb(place)}
                                disabled={loading}
                                style={{
                                  padding: "0.45rem 0.75rem",
                                  fontSize: "0.82rem",
                                  fontWeight: 600,
                                  borderRadius: "10px",
                                  border: "none",
                                  background: "#ecfdf3",
                                  color: "#15803d",
                                  cursor: loading ? "default" : "pointer",
                                  boxShadow: "inset 4px 4px 8px #d9f5e0, inset -3px -3px 8px #ffffff",
                                }}
                              >
                                Add to database
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {result?.nextPageToken && (
                  <div style={{ padding: "0.75rem 0.25rem", display: "flex", justifyContent: "flex-start" }}>
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={loading}
                      style={{
                        padding: "0.65rem 1rem",
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        borderRadius: "12px",
                        border: "none",
                        background: "#eef2f8",
                        color: "#0f172a",
                        cursor: loading ? "default" : "pointer",
                        boxShadow: "10px 10px 24px #cfd4dc, -8px -8px 18px #f9fbff",
                        opacity: loading ? 0.8 : 1,
                      }}
                    >
                      {loading ? "Loading..." : "Load more results"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
