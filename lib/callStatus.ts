export const CALL_STATUSES = [
  "Not called",
  "Didn't answer",
  "Manager was not available",
  "Not interested",
  "Interested",
  "Meeting planned",
] as const;

export type CallStatus = (typeof CALL_STATUSES)[number];

export const DEFAULT_CALL_STATUS: CallStatus = "Not called";

export function isCallStatus(value: unknown): value is CallStatus {
  return typeof value === "string" && (CALL_STATUSES as readonly string[]).includes(value);
}

