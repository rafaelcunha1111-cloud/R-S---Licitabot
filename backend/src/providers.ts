import type { Config } from "./config.js";
import { emailReady, whatsappReady } from "./config.js";
export type Delivery = {
  channel: "email" | "whatsapp";
  id: string;
  email: string;
  phone: string | null;
  title: string;
  body: string;
};
export type SendResult =
  | { status: "provider_accepted"; providerId: string }
  | {
      status: "pending_configuration" | "retry" | "failed" | "delivery_unknown";
      code: string;
      retrySeconds?: number;
    };
export async function sendNotification(
  c: Config,
  n: Delivery,
  request: typeof fetch = fetch,
): Promise<SendResult> {
  if (
    (n.channel === "email" && !emailReady(c)) ||
    (n.channel === "whatsapp" && (!whatsappReady(c) || !n.phone))
  )
    return { status: "pending_configuration", code: "provider_not_configured" };
  let response: Response;
  try {
    if (n.channel === "email" && c.GMAIL_CLIENT_ID && c.GMAIL_CLIENT_SECRET && c.GMAIL_REFRESH_TOKEN && c.GMAIL_SENDER_EMAIL) {
      const tokenResponse = await request("https://oauth2.googleapis.com/token", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: c.GMAIL_CLIENT_ID,
          client_secret: c.GMAIL_CLIENT_SECRET,
          refresh_token: c.GMAIL_REFRESH_TOKEN,
          grant_type: "refresh_token",
        }).toString(),
      });
      if (!tokenResponse.ok) return { status: "pending_configuration", code: "gmail_authorization_required" };
      const token = (await tokenResponse.json()) as { access_token?: string };
      if (!token.access_token) return { status: "pending_configuration", code: "gmail_token_missing" };
      const mime = [
        "From: " + c.GMAIL_SENDER_EMAIL,
        "To: " + n.email,
        "Subject: =?UTF-8?B?" + Buffer.from(n.title).toString("base64") + "?=",
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "",
        n.body,
      ].join("\r\n");
      response = await request("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: { Authorization: "Bearer " + token.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
      });
    } else if (n.channel === "email")
      response = await request("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${c.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": n.id,
        },
        body: JSON.stringify({
          from: c.EMAIL_FROM,
          to: [n.email],
          subject: n.title,
          text: n.body,
        }),
      });
    else
      response = await request(
        `https://graph.facebook.com/${c.WHATSAPP_GRAPH_VERSION}/${c.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          signal: AbortSignal.timeout(10000),
          headers: {
            Authorization: `Bearer ${c.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: n.phone!.replace("+", ""),
            type: "template",
            template: {
              name: c.WHATSAPP_TEMPLATE,
              language: { code: c.WHATSAPP_LANGUAGE },
              components: [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: n.title.slice(0, 200) },
                    { type: "text", text: n.body.slice(0, 800) },
                  ],
                },
              ],
            },
          }),
        },
      );
  } catch {
    return {
      status: n.channel === "email" ? "retry" : "delivery_unknown",
      code: "network_outcome_unknown",
    };
  }
  if (response.status === 429) {
    const delay = Number(response.headers.get("retry-after"));
    return {
      status: "retry",
      code: "rate_limited",
      retrySeconds:
        Number.isFinite(delay) && delay > 0 ? Math.min(delay, 86400) : 300,
    };
  }
  if (response.status >= 500)
    return {
      status: n.channel === "email" ? "retry" : "delivery_unknown",
      code: "provider_5xx",
    };
  if (!response.ok)
    return { status: "failed", code: "provider_rejected_" + response.status };
  try {
    const body = (await response.json()) as {
      id?: string;
      messages?: { id: string }[];
    };
    const providerId = n.channel === "email" ? body.id : body.messages?.[0]?.id;
    if (!providerId)
      return { status: "delivery_unknown", code: "missing_provider_id" };
    return { status: "provider_accepted", providerId };
  } catch {
    return { status: "delivery_unknown", code: "invalid_provider_response" };
  }
}
