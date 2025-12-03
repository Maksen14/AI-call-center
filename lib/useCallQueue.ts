import { useCallback, useEffect, useMemo, useState } from "react";
import type { CallStatus } from "@/lib/callStatus";

export type Lead = {
  key: string;
  name: string;
  phoneNumber: string | null;
  callStatus: CallStatus;
  websiteCategory: "none" | "social" | "real";
  websiteUri: string | null;
  notes?: string;
  city?: string;
  restaurantType?: string;
};

export type QueueLead = Lead & {
  status: "pending" | "calling" | "success" | "error" | "skipped";
  error?: string;
};

type StartResponse = {
  success: boolean;
  result?: unknown;
  error?: string;
};

async function startCallOnServer(leadId: string): Promise<StartResponse> {
  try {
    const res = await fetch("/api/calls/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });
    const data = (await res.json()) as StartResponse;
    if (!res.ok) {
      return { success: false, error: data.error ?? "Request failed" };
    }
    return { success: true, result: data.result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

type HookOptions = {
  autoAdvanceDelayMs?: number;
};

export function useCallQueue(leads: Lead[], options?: HookOptions) {
const autoAdvanceDelayMs = options?.autoAdvanceDelayMs ?? 1000;
  const [queue, setQueue] = useState<QueueLead[]>(
    leads.map((lead) => ({
      ...lead,
      status: lead.callStatus === "Not called" ? "pending" : "skipped",
    })),
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => queue.filter((lead) => lead.status === "pending").length,
    [queue],
  );
  const completedCount = useMemo(
    () => queue.filter((lead) => lead.status === "success").length,
    [queue],
  );
  const errorCount = useMemo(
    () => queue.filter((lead) => lead.status === "error").length,
    [queue],
  );

  const resetQueue = useCallback(() => {
    setQueue(
      leads.map((lead) => ({
        ...lead,
        status: lead.callStatus === "Not called" ? "pending" : "skipped",
        error: undefined,
      })),
    );
    setActiveIndex(null);
    setIsRunning(false);
    setStartedAt(null);
    setUpdatedAt(null);
  }, [leads]);

  const updateLeadStatus = useCallback((index: number, status: QueueLead["status"], error?: string) => {
    setQueue((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = [...prev];
      next[index] = { ...next[index], status, error };
      return next;
    });
    setUpdatedAt(new Date().toISOString());
  }, []);

  const advanceToNext = useCallback(() => {
    setActiveIndex((prev) => {
      const nextIndex = queue.findIndex((lead, idx) => idx > (prev ?? -1) && lead.status === "pending");
      if (nextIndex === -1) {
        setIsRunning(false);
        return null;
      }
      return nextIndex;
    });
  }, [queue]);

  const runCall = useCallback(
    async (index: number) => {
      const lead = queue[index];
      if (!lead || lead.status !== "pending") {
        setTimeout(() => advanceToNext(), autoAdvanceDelayMs);
        return;
      }
      if (!lead.phoneNumber) {
        updateLeadStatus(index, "skipped", "Missing phone number");
        setTimeout(() => advanceToNext(), autoAdvanceDelayMs);
        return;
      }
      updateLeadStatus(index, "calling");

      const res = await startCallOnServer(lead.key);
      if (res.success) {
        updateLeadStatus(index, "success");
      } else {
        updateLeadStatus(index, "error", res.error ?? "Unknown error");
      }
      setTimeout(() => advanceToNext(), autoAdvanceDelayMs);
    },
    [queue, updateLeadStatus, advanceToNext, autoAdvanceDelayMs],
  );

  const start = useCallback(() => {
    if (isRunning) return;
    const firstIndex = queue.findIndex((lead) => lead.status === "pending");
    if (firstIndex === -1) return;
    setIsRunning(true);
    setStartedAt(new Date().toISOString());
    setActiveIndex(firstIndex);
  }, [queue, isRunning]);

  const stop = useCallback(() => {
    setIsRunning(false);
    setActiveIndex(null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetQueue();
  }, [leads, resetQueue]);

  useEffect(() => {
    if (!isRunning || activeIndex === null) return;
    const lead = queue[activeIndex];
    if (!lead) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      advanceToNext();
      return;
    }
    if (lead.status === "pending") {
      runCall(activeIndex);
    }
  }, [isRunning, activeIndex, queue, runCall, advanceToNext]);

  const value = useMemo(
    () => ({
      queue,
      activeIndex,
      isRunning,
      startedAt,
      updatedAt,
      pendingCount,
      completedCount,
      errorCount,
      start,
      stop,
      resetQueue,
      runCall,
      updateLeadStatus,
    }),
    [
      queue,
      activeIndex,
      isRunning,
      startedAt,
      updatedAt,
      pendingCount,
      completedCount,
      errorCount,
      start,
      stop,
      resetQueue,
      runCall,
      updateLeadStatus,
    ],
  );

  return value;
}

