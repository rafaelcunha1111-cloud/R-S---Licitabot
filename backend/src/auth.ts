import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import type { RequestHandler } from "express";
import type pg from "pg";
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return salt + ":" + key.toString("hex");
}
export async function verifyPassword(password: string, hash: string) {
  const [salt, hex] = hash.split(":");
  if (!salt || !hex || hex.length !== 128) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hex, "hex"));
}
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function createSession(pool: pg.Pool, userId: string) {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
    [hashToken(token), userId],
  );
  return token;
}
export function authenticate(pool: pg.Pool): RequestHandler {
  return async (req, res, next) => {
    try {
      const match = /^Bearer ([a-f0-9]{64})$/.exec(
        req.headers.authorization || "",
      );
      if (!match) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      const { rows } = await pool.query(
        "SELECT user_id FROM auth_sessions WHERE token_hash=$1 AND expires_at>now()",
        [hashToken(match[1])],
      );
      if (!rows[0]) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      res.locals.userId = rows[0].user_id;
      res.locals.tokenHash = hashToken(match[1]);
      next();
    } catch (error) {
      next(error);
    }
  };
}
