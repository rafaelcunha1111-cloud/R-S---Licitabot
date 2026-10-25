import { z } from "zod";
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) =>
        value.startsWith("postgresql://") || value.startsWith("postgres://"),
    ),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_SSL_MODE: z
    .enum(["auto", "verify-full", "render-internal"])
    .default("auto"),
  // Non-secret platform marker injected by Render.
  RENDER: z.enum(["true", "false"]).optional(),
  DATABASE_CA_CERT: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["resend", "gmail"]).default("resend"),
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REDIRECT_URI: z.string().url().optional(),
  GMAIL_SENDER_EMAIL: z
    .string()
    .email()
    .default("construcenter.licitacao@gmail.com"),
  GMAIL_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  WHATSAPP_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().regex(/^\d+$/).optional(),
  WHATSAPP_GRAPH_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .optional(),
  WHATSAPP_TEMPLATE: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .optional(),
  WHATSAPP_LANGUAGE: z.string().default("pt_BR"),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
});
export type Config = z.infer<typeof envSchema>;
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success)
    throw Error(
      "Configuração inválida: " +
        parsed.error.issues.map((i) => i.path.join(".")).join(", "),
    );
  const c = parsed.data;
  if (
    c.GMAIL_TOKEN_ENCRYPTION_KEY &&
    !/^[A-Za-z0-9+/]{43}=$/.test(c.GMAIL_TOKEN_ENCRYPTION_KEY)
  )
    throw Error(
      "GMAIL_TOKEN_ENCRYPTION_KEY deve conter 32 bytes aleatórios em base64.",
    );
  if (
    c.GMAIL_REDIRECT_URI &&
    (new URL(c.GMAIL_REDIRECT_URI).pathname !== "/oauth/gmail/callback" ||
      (c.NODE_ENV === "production" &&
        new URL(c.GMAIL_REDIRECT_URI).protocol !== "https:"))
  )
    throw Error(
      "GMAIL_REDIRECT_URI deve usar o callback /oauth/gmail/callback e HTTPS em produção.",
    );
  const origin = new URL(c.FRONTEND_ORIGIN);
  if (origin.origin !== c.FRONTEND_ORIGIN)
    throw Error(
      "FRONTEND_ORIGIN deve ser uma origem sem caminho ou barra final.",
    );
  if (c.NODE_ENV === "production" && origin.protocol !== "https:")
    throw Error("Produção exige FRONTEND_ORIGIN HTTPS.");
  return c;
}
export const emailReady = (c: Config) =>
  c.EMAIL_PROVIDER === "gmail"
    ? Boolean(
        c.GMAIL_CLIENT_ID &&
        c.GMAIL_CLIENT_SECRET &&
        c.GMAIL_REDIRECT_URI &&
        c.GMAIL_TOKEN_ENCRYPTION_KEY,
      )
    : Boolean(c.RESEND_API_KEY && c.EMAIL_FROM);
export const whatsappReady = (c: Config) =>
  Boolean(
    c.WHATSAPP_ENABLED &&
    c.WHATSAPP_TOKEN &&
    c.WHATSAPP_PHONE_NUMBER_ID &&
    c.WHATSAPP_GRAPH_VERSION &&
    c.WHATSAPP_TEMPLATE,
  );
