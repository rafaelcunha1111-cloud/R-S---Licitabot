import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import type pg from "pg";
import type { Config } from "./config.js";
import type { Delivery, SendResult } from "./providers.js";
export const gmailScopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
];
export function encryptSecret(value: string, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  return [
    iv,
    Buffer.concat([cipher.update(value, "utf8"), cipher.final()]),
    cipher.getAuthTag(),
  ]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function decryptSecret(value: string, key: string) {
  const parts = value.split(".");
  if (parts.length !== 3) throw Error("invalid_ciphertext");
  const [iv, body, tag] = parts.map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "base64"),
    iv,
  );
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString(
    "utf8",
  );
}
export const stateHash = (state: string) =>
  createHash("sha256").update(state).digest("hex");
export async function authorizeGmail(pool: pg.Pool, c: Config, userId: string) {
  if (
    !c.GMAIL_CLIENT_ID ||
    !c.GMAIL_CLIENT_SECRET ||
    !c.GMAIL_REDIRECT_URI ||
    !c.GMAIL_TOKEN_ENCRYPTION_KEY
  )
    throw Error("gmail_pending_configuration");
  const state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(32).toString("base64url");
  await pool.query("DELETE FROM gmail_oauth_states WHERE expires_at<now()");
  await pool.query(
    "INSERT INTO gmail_oauth_states(state_hash,user_id,verifier_encrypted,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
    [
      stateHash(state),
      userId,
      encryptSecret(verifier, c.GMAIL_TOKEN_ENCRYPTION_KEY),
    ],
  );
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [key, value] of Object.entries({
    client_id: c.GMAIL_CLIENT_ID,
    redirect_uri: c.GMAIL_REDIRECT_URI,
    response_type: "code",
    scope: gmailScopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    login_hint: c.GMAIL_SENDER_EMAIL,
  }))
    url.searchParams.set(key, value);
  return url.toString();
}
export type VerifyIdentity = (
  idToken: string,
  clientId: string,
) => Promise<{ email?: string; email_verified?: boolean }>;
const verifyIdentity: VerifyIdentity = async (idToken, clientId) => {
  const ticket = await new OAuth2Client(clientId).verifyIdToken({
    idToken,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  return { email: payload?.email, email_verified: payload?.email_verified };
};
export async function completeGmailAuthorization(
  pool: pg.Pool,
  c: Config,
  state: string,
  code: string,
  request: typeof fetch = fetch,
  verify: VerifyIdentity = verifyIdentity,
) {
  if (
    !c.GMAIL_TOKEN_ENCRYPTION_KEY ||
    !c.GMAIL_CLIENT_ID ||
    !c.GMAIL_CLIENT_SECRET ||
    !c.GMAIL_REDIRECT_URI
  )
    throw Error("gmail_pending_configuration");
  const entry = (
    await pool.query(
      "DELETE FROM gmail_oauth_states WHERE state_hash=$1 AND expires_at>now() RETURNING *",
      [stateHash(state)],
    )
  ).rows[0];
  if (!entry) throw Error("invalid_oauth_state");
  const response = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.GMAIL_CLIENT_ID,
      client_secret: c.GMAIL_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: c.GMAIL_REDIRECT_URI,
      code_verifier: decryptSecret(
        entry.verifier_encrypted,
        c.GMAIL_TOKEN_ENCRYPTION_KEY,
      ),
    }),
  });
  if (!response.ok) throw Error("oauth_exchange_failed");
  const token = (await response.json()) as {
    refresh_token?: string;
    id_token?: string;
    scope?: string;
  };
  if (
    !token.id_token ||
    !token.refresh_token ||
    !token.scope?.split(" ").includes(gmailScopes[2])
  )
    throw Error("offline_send_permission_missing");
  const identity = await verify(token.id_token, c.GMAIL_CLIENT_ID);
  if (
    !identity.email_verified ||
    identity.email?.toLowerCase() !== c.GMAIL_SENDER_EMAIL.toLowerCase()
  )
    throw Error("wrong_google_account");
  await pool.query(
    "INSERT INTO gmail_accounts(email,refresh_token_encrypted,connected_by) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET refresh_token_encrypted=excluded.refresh_token_encrypted,connected_by=excluded.connected_by,connected_at=now()",
    [
      c.GMAIL_SENDER_EMAIL,
      encryptSecret(token.refresh_token, c.GMAIL_TOKEN_ENCRYPTION_KEY),
      entry.user_id,
    ],
  );
}
export function gmailRaw(c: Config, n: Delivery) {
  if (
    /[\r\n]/.test(n.email) ||
    !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(n.email)
  )
    throw Error("invalid_recipient");
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(n.id)) throw Error("invalid_message_id");
  return Buffer.from(
    [
      `From: R&S LicitaBot <${c.GMAIL_SENDER_EMAIL}>`,
      `To: ${n.email}`,
      `Subject: =?UTF-8?B?${Buffer.from(n.title).toString("base64")}?=`,
      `Message-ID: <${n.id}@licitabot.local>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(n.body)
        .toString("base64")
        .match(/.{1,76}/g)
        ?.join("\r\n") || "",
    ].join("\r\n"),
  ).toString("base64url");
}
export async function sendGmail(
  pool: pg.Pool,
  c: Config,
  n: Delivery,
  request: typeof fetch = fetch,
): Promise<SendResult> {
  if (
    !c.GMAIL_CLIENT_ID ||
    !c.GMAIL_CLIENT_SECRET ||
    !c.GMAIL_TOKEN_ENCRYPTION_KEY
  )
    return {
      status: "pending_configuration",
      code: "gmail_pending_configuration",
    };
  const account = (
    await pool.query(
      "SELECT refresh_token_encrypted FROM gmail_accounts WHERE email=$1",
      [c.GMAIL_SENDER_EMAIL],
    )
  ).rows[0];
  if (!account)
    return {
      status: "pending_configuration",
      code: "gmail_authorization_required",
    };
  let refreshToken: string;
  try {
    refreshToken = decryptSecret(
      account.refresh_token_encrypted,
      c.GMAIL_TOKEN_ENCRYPTION_KEY,
    );
  } catch {
    return { status: "pending_configuration", code: "gmail_key_mismatch" };
  }
  let accessToken: string;
  try {
    const response = await request("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: c.GMAIL_CLIENT_ID,
        client_secret: c.GMAIL_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (response.status === 400 || response.status === 401)
      return {
        status: "pending_configuration",
        code: "gmail_reauthorization_required",
      };
    if (!response.ok)
      return { status: "retry", code: "gmail_token_temporarily_unavailable" };
    const token = (await response.json()) as { access_token?: string };
    if (!token.access_token)
      return { status: "retry", code: "gmail_missing_access_token" };
    accessToken = token.access_token;
  } catch {
    return { status: "retry", code: "gmail_token_network_error" };
  }
  let raw: string;
  try {
    raw = gmailRaw(c, n);
  } catch {
    return { status: "failed", code: "invalid_email_input" };
  }
  // Gmail has no documented send idempotency key. Never blindly retry ambiguous sends.
  try {
    const response = await request(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      },
    );
    if (response.status === 429)
      return { status: "retry", code: "gmail_rate_limited", retrySeconds: 300 };
    if (response.status === 401)
      return { status: "retry", code: "gmail_access_expired" };
    if (response.status >= 500)
      return { status: "delivery_unknown", code: "gmail_send_outcome_unknown" };
    if (!response.ok)
      return { status: "failed", code: "gmail_rejected_" + response.status };
    const data = (await response.json()) as { id?: string };
    if (typeof data.id !== "string")
      return { status: "delivery_unknown", code: "gmail_missing_message_id" };
    return { status: "provider_accepted", providerId: data.id };
  } catch {
    return { status: "delivery_unknown", code: "gmail_send_outcome_unknown" };
  }
}
