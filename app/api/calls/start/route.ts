import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readJson } from "@/lib/jsonStore";
import { startVapiCall } from "@/lib/vapi";
import { CALL_STATUSES, type CallStatus } from "@/lib/callStatus";

type StoredPlace = {
  key: string;
  name: string;
  phoneNumber: string | null;
  websiteUri: string | null;
  websiteCategory: "none" | "social" | "real";
  restaurantType?: string;
  city?: string;
  notes?: string;
  callStatus: CallStatus;
};

type PlacesDb = {
  places: Record<string, StoredPlace>;
};

const placesPath = path.join(process.cwd(), "data", "places-db.json");

type AssistantVariant = "no-website" | "has-website";

type AssistantConfig = {
  variant: AssistantVariant;
  assistantId?: string;
  instructions: string;
  extraOverrides?: Record<string, unknown>;
};

function normalizeBaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : null;
}

function buildDefaultInstructions(place: StoredPlace, baseUrl: string | null): string {
  const hasWebsite = place.websiteCategory !== "none" && Boolean(place.websiteUri);
  const headline = hasWebsite
    ? `They already have an online presence (${place.websiteUri ?? "social profile"}). Focus on upgrading their web experience to capture more bookings and leads.`
    : "They do not have a proper website. Explain how quickly we can launch a professional site that helps them get more bookings and visibility.";

  const classification = [
    "- \"Didn't answer\": nobody picked up or the call dropped immediately.",
    "- \"Manager was not available\": someone answered but the decision maker was not reachable.",
    "- \"Not interested\": the decision maker declined the offer.",
    '- "Interested": they want next steps or agreed to consider a meeting.',
  ].join("\n");

  const toolGuidance = baseUrl
    ? [
        `Use the HTTP tools configured for you:`,
        `1. POST ${baseUrl}/api/calls/update-status with JSON { "leadId": "${place.key}", "callStatus": "<status>", "notes": "<optional summary>" } to log the outcome.`,
        `2. GET ${baseUrl}/api/availability?limit=10&durationMinutes=30 to fetch the next open slots (default 30 minutes).`,
        `3. POST ${baseUrl}/api/meetings/create with JSON { "leadId": "${place.key}", "scheduledAt": "<ISO time>", "channel": "phone", "notes": "<context>" } once a slot is confirmed.`,
        `If a meeting is booked, update the call status to "Meeting planned".`,
      ].join("\n")
    : [
        "You cannot call tools in this environment. Verbally confirm the chosen time, summarise it to the operator, and clearly state which call status applies.",
      ].join("\n");

  return [
    `You are phoning ${place.name}${place.city ? ` in ${place.city}` : ""}.`,
    headline,
    "Call flow:",
    `1. Confirm you are speaking with the decision maker.` +
      " 2. Introduce the product succinctly and tailor the pitch to their situation." +
      " 3. Ask discovery questions (current website, booking pain points, openness to new site)." +
      " 4. If they are interested, secure a concrete meeting time within the available slots.",
    "Call outcome classification (use exactly one of):",
    classification,
    toolGuidance,
    "Close politely and provide a concise summary (decision, next steps, commitments).",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function parseAssistantOverrides(variant: AssistantVariant): Record<string, unknown> | null {
  const raw =
    variant === "no-website"
      ? process.env.VAPI_ASSISTANT_OVERRIDES_NO_WEBSITE
      : process.env.VAPI_ASSISTANT_OVERRIDES_HAS_WEBSITE;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    console.warn(`Invalid JSON in assistant overrides for ${variant}:`, err);
    return null;
  }
}

function buildAssistantConfig(place: StoredPlace): AssistantConfig {
  const variant: AssistantVariant =
    place.websiteCategory === "none" || !place.websiteUri ? "no-website" : "has-website";
  const baseUrl = normalizeBaseUrl(process.env.VAPI_PUBLIC_BASE_URL);
  const instructionsEnv =
    variant === "no-website"
      ? process.env.VAPI_PROMPT_NO_WEBSITE
      : process.env.VAPI_PROMPT_HAS_WEBSITE;

  const instructions =
    instructionsEnv?.trim()?.length
      ? instructionsEnv
      : buildDefaultInstructions(place, baseUrl);

  const assistantId =
    variant === "no-website"
      ? process.env.VAPI_ASSISTANT_ID_NO_WEBSITE ?? undefined
      : process.env.VAPI_ASSISTANT_ID_HAS_WEBSITE ?? undefined;

  const extraOverrides = parseAssistantOverrides(variant) ?? undefined;

  return {
    variant,
    assistantId,
    instructions,
    extraOverrides,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { leadId?: string };
    const leadId = body.leadId;
    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    const placesDb = await readJson<PlacesDb>(placesPath, { places: {} });
    const place = placesDb.places[leadId];
    if (!place) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (!place.phoneNumber) {
      return NextResponse.json({ error: "Lead has no phoneNumber" }, { status: 400 });
    }

    const config = buildAssistantConfig(place);

    const assistantOverrides: Record<string, unknown> = {
      ...(config.extraOverrides ?? {}),
      instructions: config.extraOverrides?.instructions ?? config.instructions,
    };

    const publicBaseUrl = normalizeBaseUrl(process.env.VAPI_PUBLIC_BASE_URL);

    const vapiRes = await startVapiCall({
      leadId: place.key,
      phoneNumber: place.phoneNumber,
      assistantId: config.assistantId,
      assistantOverrides,
      metadata: {
        leadId: place.key,
        restaurantName: place.name,
        restaurantType: place.restaurantType,
        city: place.city,
        note: place.notes,
        websiteCategory: place.websiteCategory,
        websiteUri: place.websiteUri,
        callStatus: place.callStatus,
        assistantVariant: config.variant,
        leadHasWebsite: place.websiteCategory !== "none" && Boolean(place.websiteUri),
        callStatusOptions: CALL_STATUSES,
        availabilityEndpoint: publicBaseUrl ? `${publicBaseUrl}/api/availability` : null,
        callStatusEndpoint: publicBaseUrl ? `${publicBaseUrl}/api/calls/update-status` : null,
        meetingCreateEndpoint: publicBaseUrl
          ? `${publicBaseUrl}/api/meetings/create`
          : null,
      },
    });

    return NextResponse.json({ success: true, result: vapiRes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Start call error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
