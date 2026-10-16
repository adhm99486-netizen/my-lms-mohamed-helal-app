import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  hashPw, verifyPw, signToken, getUser, setCookie, DEVELOPER_EMAIL,
  isRateLimited, recordFail, clearFails,
} from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const MIN_PW = 8;

function cleanEmail(v: unknown) { return typeof v === "string" ? v.trim().toLowerCase().slice(0, 254) : ""; }
function cleanName(v: unknown) { return typeof v === "string" ? v.trim().slice(0, 80) : ""; }

export async function GET() {
  await ensureSeed();
  const u = await getUser();
  return NextResponse.json({ user: u ? { id: u.id, name: u.name, email: u.email, role: u.role, avatar: u.avatar || "" } : null });
}

export async function POST(req: Request) {
  await ensureSeed();
  const b = await req.json().catch(() => ({}));
  const action = b.action;
  const jar = await cookies();

  if (action === "logout") {
    jar.delete("session");
    jar.delete("dev_session");
    return NextResponse.json({ ok: true });
  }

  if (action === "register") {
    const name = cleanName(b.name);
    const email = cleanEmail(b.email);
    const password = typeof b.password === "string" ? b.password : "";
    if (!name || !EMAIL_RE.test(email) || password.length < MIN_PW) {
      return NextResponse.json({ error: `اكتب الاسم وبريداً صحيحاً وكلمة مرور ${MIN_PW} أحرف على الأقل` }, { status: 400 });
    }
    if (email === DEVELOPER_EMAIL) return NextResponse.json({ error: "هذا البريد مخصص للمطور، سجل الدخول بدلاً من ذلك" }, { status: 400 });
    const exists = await db.select().from(s.users).where(eq(s.users.email, email));
    if (exists.length) return NextResponse.json({ error: "هذا البريد مسجل بالفعل، سجل الدخول" }, { status: 400 });
    // New accounts are always students. Developers and teachers are created only from the developer panel.
    const [u] = await db.insert(s.users).values({ name, email, passwordHash: await hashPw(password), role: "student" }).returning();
    setCookie(jar, "session", signToken({ id: u.id, name: u.name, email: u.email, role: u.role }));
    await db.insert(s.auditLogs).values({ actor: email, action: "تسجيل حساب جديد", details: name });
    return NextResponse.json({ ok: true, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  }

  if (action === "login") {
    const email = cleanEmail(b.email);
    const password = typeof b.password === "string" ? b.password : "";
    const key = `login:${email}`;
    if (await isRateLimited(key)) return NextResponse.json({ error: "محاولات كثيرة خاطئة. انتظر 15 دقيقة ثم حاول مجدداً" }, { status: 429 });
    const rows = await db.select().from(s.users).where(eq(s.users.email, email));
    const u = rows[0];
    if (!u || !(await verifyPw(password, u.passwordHash))) {
      await recordFail(key);
      return NextResponse.json({ error: "البريد أو كلمة المرور غير صحيحة" }, { status: 401 });
    }
    await clearFails(key);
    setCookie(jar, "session", signToken({ id: u.id, name: u.name, email: u.email, role: u.role, avatar: u.avatar || "" }));
    if (u.email === DEVELOPER_EMAIL) {
      setCookie(jar, "dev_session", signToken({ dev: true, id: u.id, email: u.email, role: "developer" }));
    }
    return NextResponse.json({ ok: true, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  }

  if (action === "developer-login") {
    const password = typeof b.password === "string" ? b.password : "";
    const key = "dev-login";
    if (await isRateLimited(key)) return NextResponse.json({ error: "محاولات كثيرة. انتظر 15 دقيقة" }, { status: 429 });
    const rows = await db.select().from(s.settings).where(eq(s.settings.key, "dev_password"));
    const hash = rows[0]?.value || "";
    if (!(await verifyPw(password, hash))) {
      await recordFail(key);
      return NextResponse.json({ error: "كلمة مرور المطور غير صحيحة" }, { status: 401 });
    }
    await clearFails(key);
    setCookie(jar, "dev_session", signToken({ dev: true, email: DEVELOPER_EMAIL, role: "developer", name: "المطور" }));
    await db.insert(s.auditLogs).values({ actor: DEVELOPER_EMAIL, action: "دخول المطور", details: "تم الدخول بكلمة مرور المطور" });
    return NextResponse.json({ ok: true });
  }

  // Self-service reset is not offered: without an email service it would hand a password to whoever asks.
  if (action === "forgot") {
    return NextResponse.json({ ok: true, message: "لإعادة تعيين كلمة المرور تواصل مع المطور، وسيزوّدك بكلمة مؤقتة." });
  }

  // Owner-only recovery for the developer password: needs DEV_RESET_TOKEN set in the environment.
  if (action === "dev-reset") {
    const expected = process.env.DEV_RESET_TOKEN || "";
    const key = "dev-reset";
    if (expected.length < 24) return NextResponse.json({ error: "استعادة المطور غير مفعّلة على الخادم" }, { status: 403 });
    if (await isRateLimited(key)) return NextResponse.json({ error: "محاولات كثيرة. انتظر 15 دقيقة" }, { status: 429 });
    const given = typeof b.token === "string" ? b.token : "";
    const a = Buffer.from(given), e = Buffer.from(expected);
    const same = a.length === e.length && crypto.timingSafeEqual(a, e);
    if (!same) { await recordFail(key); return NextResponse.json({ error: "رمز الاستعادة غير صحيح" }, { status: 401 }); }
    const next = typeof b.password === "string" ? b.password : "";
    if (next.length < MIN_PW) return NextResponse.json({ error: `كلمة المرور الجديدة ${MIN_PW} أحرف على الأقل` }, { status: 400 });
    const hash = await hashPw(next);
    await db.insert(s.settings).values({ key: "dev_password", value: hash }).onConflictDoUpdate({ target: s.settings.key, set: { value: hash } });
    await db.update(s.users).set({ passwordHash: hash }).where(eq(s.users.email, DEVELOPER_EMAIL));
    await clearFails(key);
    await db.insert(s.auditLogs).values({ actor: DEVELOPER_EMAIL, action: "استعادة كلمة مرور المطور", details: "عبر رمز الاستعادة" });
    return NextResponse.json({ ok: true });
  }

  if (action === "update-profile") {
    const me = await getUser();
    if (!me) return NextResponse.json({ error: "سجل الدخول أولاً" }, { status: 401 });
    const name = cleanName(b.name) || me.name;
    const avatar = typeof b.avatar === "string" ? b.avatar.slice(0, 300) : "";
    await db.update(s.users).set({ name, avatar }).where(eq(s.users.id, me.id));
    setCookie(jar, "session", signToken({ id: me.id, name, email: me.email, role: me.role, avatar }));
    return NextResponse.json({ ok: true });
  }

  if (action === "teacher-request") {
    const name = cleanName(b.name);
    const email = cleanEmail(b.email);
    if (!name || !EMAIL_RE.test(email)) return NextResponse.json({ error: "اكتب الاسم وبريداً إلكترونياً صحيحاً" }, { status: 400 });
    const subject = typeof b.subject === "string" ? b.subject.slice(0, 120) : "";
    const message = typeof b.message === "string" ? b.message.slice(0, 2000) : "";
    await db.insert(s.teacherRequests).values({ name, email, subject, message });
    await db.insert(s.auditLogs).values({ actor: email, action: "طلب انضمام معلم", details: subject });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action غير معروف" }, { status: 400 });
}
