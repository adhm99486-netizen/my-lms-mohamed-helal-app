import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";

export const DEVELOPER_EMAIL = "adhm99486@gmail.com";
const WEEK_MS = 1000 * 60 * 60 * 24 * 7;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

/* The signing secret MUST come from the environment in production. */
function secret(): string {
  const v = process.env.SESSION_SECRET;
  if (v && v.length >= 32) return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET (at least 32 characters) must be set in production");
  }
  return "dev-only-secret-change-me-0123456789abcdef";
}

export async function hashPw(p: string) { return bcrypt.hash(p, 10); }
export async function verifyPw(p: string, h: string) { try { return await bcrypt.compare(p, h); } catch { return false; } }

export function signToken(payload: any) {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + WEEK_MS })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyToken(token?: string | null) {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString());
    if (p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}

export function setCookie(jar: Awaited<ReturnType<typeof cookies>>, name: string, value: string) {
  jar.set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WEEK_MS / 1000,
  });
}

export async function getUser() {
  const c = await cookies();
  return verifyToken(c.get("session")?.value);
}

export async function getDev() {
  const c = await cookies();
  // The owner signed in with the developer password.
  const d = verifyToken(c.get("dev_session")?.value);
  if (d?.dev && d.email === DEVELOPER_EMAIL) return d;
  // Everyone else must still be a developer in the database right now, so a demoted developer loses access at once.
  const u = verifyToken(c.get("session")?.value);
  if (!u?.id) return null;
  const rows = await db.select({ role: s.users.role, email: s.users.email }).from(s.users).where(eq(s.users.id, u.id));
  const row = rows[0];
  if (row && (row.role === "developer" || row.email === DEVELOPER_EMAIL)) return { ...u, role: row.role, email: row.email };
  return null;
}

export function genCode(prefix = "VID") {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (n: number) => Array.from(crypto.randomBytes(n)).map(b => chars[b % chars.length]).join("");
  return `${prefix}-${part(4)}-${part(4)}-${part(4)}`;
}

export function genPassword(prefix = "Temp") {
  return `${prefix}-${crypto.randomBytes(5).toString("base64url")}`;
}

/* Login throttling stored in the database, so it also works across serverless instances. */
export async function isRateLimited(key: string): Promise<boolean> {
  const rows = await db.select().from(s.loginAttempts).where(eq(s.loginAttempts.key, key));
  const r = rows[0];
  if (!r || !r.lockedUntil) return false;
  if (new Date(r.lockedUntil) > new Date()) return true;
  await db.delete(s.loginAttempts).where(eq(s.loginAttempts.key, key));
  return false;
}

export async function recordFail(key: string) {
  const [row] = await db.insert(s.loginAttempts)
    .values({ key, count: 1 })
    .onConflictDoUpdate({ target: s.loginAttempts.key, set: { count: sql`${s.loginAttempts.count} + 1` } })
    .returning();
  if (row.count >= MAX_FAILS) {
    await db.update(s.loginAttempts).set({ count: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }).where(eq(s.loginAttempts.key, key));
  }
}

export async function clearFails(key: string) {
  await db.delete(s.loginAttempts).where(eq(s.loginAttempts.key, key));
}

export function ytId(input: string) {
  if (!input) return "";
  const m = input.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  return m ? m[1] : input.trim();
}

export function drivePreview(url: string) {
  if (!url) return "";
  const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  return m ? `https://drive.google.com/file/d/${m[1]}/preview` : url;
}
