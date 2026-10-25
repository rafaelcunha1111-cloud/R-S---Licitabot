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
  INITIAL_ADMIN_SETUP_KEY: z.string().min(32).optional(),
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REFRESH_TOKEN: z.string().optional(),
  GMAIL_SENDER_EMAIL: z.string().email().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  ALERT_RECIPIENT_EMAIL: z.string().email().optional(),
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
  Boolean((c.GMAIL_CLIENT_ID && c.GMAIL_CLIENT_SECRET && c.GMAIL_REFRESH_TOKEN && c.GMAIL_SENDER_EMAIL) || (c.RESEND_API_KEY && c.EMAIL_FROM));
export const whatsappReady = (c: Config) =>
  Boolean(
    c.WHATSAPP_TOKEN &&
    c.WHATSAPP_PHONE_NUMBER_ID &&
    c.WHATSAPP_GRAPH_VERSION &&
    c.WHATSAPP_TEMPLATE,
  );
