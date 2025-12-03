import nodemailer from "nodemailer";

export type StartCallOptions = {
  leadId: string;
  phoneNumber: string; // en +33...
  metadata?: Record<string, unknown>;
  assistantId?: string;
  assistantOverrides?: Record<string, unknown>;
};

type LimitAlertContext = {
  reason: string;
  status: number;
  url: string;
  payload: unknown;
  responseBody: unknown;
};

let cachedTransporter: nodemailer.Transporter | null = null;

async function getTransporter() {
  if (!cachedTransporter) {
    const from = process.env.ALERT_EMAIL_FROM;
    const appPassword = process.env.ALERT_EMAIL_APP_PASSWORD;
    if (!from || !appPassword) {
      throw new Error("Email alert env vars missing (ALERT_EMAIL_FROM, ALERT_EMAIL_APP_PASSWORD)");
    }
    cachedTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: from,
        pass: appPassword,
      },
    });
  }
  return cachedTransporter;
}

async function sendLimitAlert(context: LimitAlertContext) {
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  const appPassword = process.env.ALERT_EMAIL_APP_PASSWORD;
  if (!to || !from || !appPassword) {
    return;
  }

  try {
    const transporter = await getTransporter();
    const subjectPrefix = process.env.ALERT_EMAIL_SUBJECT_PREFIX ?? "[Vapi]";
    const subject = `${subjectPrefix} Limit reached (${context.status})`.trim();
    const textLines = [
      `Reason: ${context.reason}`,
      `Status: ${context.status}`,
      `Endpoint: ${context.url}`,
      "",
      "Payload:",
      JSON.stringify(context.payload, null, 2),
      "",
      "Response:",
      typeof context.responseBody === "string"
        ? context.responseBody
        : JSON.stringify(context.responseBody, null, 2),
    ];

    await transporter.sendMail({
      from,
      to,
      subject,
      text: textLines.join("\n"),
    });
  } catch (err) {
    console.error("Failed to send limit alert email:", err);
  }
}

function looksLikeLimit(status: number, body: unknown): boolean {
  if (status === 429) {
    return true;
  }
  if (!body) {
    return false;
  }
  const text =
    typeof body === "string"
      ? body
      : (() => {
          try {
            return JSON.stringify(body);
          } catch {
            return "";
          }
        })();
  const lower = text.toLowerCase();
  return lower.includes("limit") || lower.includes("concurrency");
}

export async function startVapiCall(opts: StartCallOptions): Promise<unknown> {
  const apiKey = process.env.VAPI_API_KEY;
  const defaultAssistantId = process.env.VAPI_ASSISTANT_ID;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID; // ID du numéro Vapi (pas +33, un UUID)
  const debug = process.env.VAPI_DEBUG === "true";

  const effectiveAssistantId = opts.assistantId ?? defaultAssistantId;

  if (!apiKey || !effectiveAssistantId || !phoneNumberId) {
    throw new Error(
      "Missing Vapi configuration (VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, assistant id)",
    );
  }

  // ✅ Endpoint officiel Vapi pour créer un appel
  const url = "https://api.vapi.ai/call";

  const payload = {
    assistantId: effectiveAssistantId,
    phoneNumberId,
    customer: {
      number: opts.phoneNumber, // numéro du lead en +33...
    },
    metadata: {
      leadId: opts.leadId,
      assistantId: effectiveAssistantId,
      ...(opts.metadata ?? {}),
    },
    ...(opts.assistantOverrides ? { assistantOverrides: opts.assistantOverrides } : {}),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (debug) {
    console.log("[Vapi] POST", url, { status: res.status });
  }

  if (!res.ok) {
    const text = await res.text();
    if (looksLikeLimit(res.status, text)) {
      await sendLimitAlert({
        reason: "HTTP error response",
        status: res.status,
        url,
        payload,
        responseBody: text,
      });
    }
    throw new Error(`Vapi call failed (${res.status}) at ${url}: ${text}`);
  }

  const data = await res.json();
  const limits = (data as { subscriptionLimits?: { concurrencyBlocked?: boolean; remainingConcurrentCalls?: number } }).subscriptionLimits;
  if (limits?.concurrencyBlocked || (typeof limits?.remainingConcurrentCalls === "number" && limits.remainingConcurrentCalls <= 0)) {
    await sendLimitAlert({
      reason: "Vapi reported concurrency limit reached",
      status: 200,
      url,
      payload,
      responseBody: data,
    });
  }

  return data;
}
