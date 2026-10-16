import { NextResponse } from "next/server";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq, and, desc, sql, or, isNull, gt } from "drizzle-orm";
import { getUser, getDev } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { loadSite } from "@/lib/site-server";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeed();
  const user = await getUser();
  const dev = await getDev();
  const isDev = !!dev;

  const [allCourses, allModules, allLessons, notifs, site] = await Promise.all([
    db.select().from(s.courses).orderBy(s.courses.sortOrder),
    db.select().from(s.modules).orderBy(s.modules.sortOrder),
    db.select().from(s.lessons).orderBy(s.lessons.sortOrder),
    db.select().from(s.notifications).orderBy(desc(s.notifications.createdAt)).limit(10),
    loadSite(),
  ]);

  // Visitors only see published courses and their content.
  const courses = isDev ? allCourses : allCourses.filter(c => c.isPublished);
  const publishedIds = new Set(courses.map(c => c.id));
  const modules = allModules.filter(m => publishedIds.has(m.courseId));
  const lessonsInScope = allLessons.filter(l => publishedIds.has(l.courseId));

  let myAccess: any[] = [], myProgress: any[] = [], myFavs: any[] = [], myHistory: any[] = [];
  if (user) {
    [myAccess, myProgress, myFavs, myHistory] = await Promise.all([
      db.select().from(s.access).where(eq(s.access.userId, user.id)),
      db.select().from(s.progress).where(eq(s.progress.userId, user.id)),
      db.select().from(s.favorites).where(eq(s.favorites.userId, user.id)),
      db.select().from(s.history).where(eq(s.history.userId, user.id)).orderBy(desc(s.history.watchedAt)).limit(50),
    ]);
  }
  const accessSet = new Set(myAccess.map((a: any) => a.lessonId));

  // Locked content must never reach the browser: no YouTube id, no URL, no YouTube-derived thumbnail.
  const lessons = lessonsInScope.map(l => {
    const unlocked = isDev || l.isFree || !l.isProtected || accessSet.has(l.id);
    const out: any = { ...l, unlocked };
    if (!unlocked) {
      out.youtubeId = "";
      out.url = "";
      if (/img\.youtube\.com\//.test(out.thumbnail || "")) out.thumbnail = "";
    }
    if (out.type === "video") out.url = ""; // videos only use youtubeId
    return out;
  });

  return NextResponse.json({
    user: user ? { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar || "" } : null,
    isDev,
    courses,
    modules,
    lessons,
    notifications: notifs,
    site,
    access: myAccess,
    progress: myProgress,
    favorites: myFavs,
    history: myHistory,
  });
}

export async function POST(req: Request) {
  await ensureSeed();
  const b = await req.json().catch(() => ({}));
  const user = await getUser();
  const dev = await getDev();

  if (b.action === "redeem") {
    if (!user) return NextResponse.json({ error: "سجل الدخول أولاً لاستخدام الكود" }, { status: 401 });
    const lessonId = Number(b.lessonId);
    const input = String(b.code || "").trim();
    if (!input) return NextResponse.json({ error: "اكتب الكود أولاً" }, { status: 400 });
    const rows = await db.select().from(s.codes)
      .where(or(eq(s.codes.code, input), eq(s.codes.code, input.toUpperCase())));
    const code = rows[0];
    if (!code) return NextResponse.json({ error: "الكود غير صحيح" }, { status: 404 });
    if (code.lessonId !== lessonId) return NextResponse.json({ error: "هذا الكود مخصص لدرس آخر" }, { status: 400 });
    const already = await db.select().from(s.access).where(and(eq(s.access.userId, user.id), eq(s.access.lessonId, lessonId)));
    if (already.length) return NextResponse.json({ ok: true, alreadyOpen: true });
    if (!code.isActive) return NextResponse.json({ error: "هذا الكود موقوف حالياً" }, { status: 400 });
    if (code.expiresAt && new Date(code.expiresAt) < new Date()) return NextResponse.json({ error: "هذا الكود منتهي الصلاحية" }, { status: 400 });

    // Atomic: consume one use only if the code is still valid (prevents double spending under concurrency).
    const ok = await db.transaction(async tx => {
      const used = await tx.update(s.codes)
        .set({ usedCount: sql`${s.codes.usedCount} + 1` })
        .where(and(
          eq(s.codes.id, code.id),
          eq(s.codes.isActive, true),
          sql`${s.codes.usedCount} < ${s.codes.maxUses}`,
          or(isNull(s.codes.expiresAt), gt(s.codes.expiresAt, new Date())),
        ))
        .returning({ id: s.codes.id });
      if (!used.length) return false;
      await tx.insert(s.access).values({ userId: user.id, lessonId, codeId: code.id }).onConflictDoNothing();
      await tx.insert(s.auditLogs).values({ actor: user.email, action: "تفعيل كود فيديو", details: `lesson ${lessonId} code ${code.code}` });
      return true;
    });
    if (!ok) return NextResponse.json({ error: "تم استخدام هذا الكود بالكامل" }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (!user) return NextResponse.json({ error: "سجل الدخول أولاً" }, { status: 401 });

  if (b.action === "progress") {
    const lessonId = Number(b.lessonId);
    const [les] = await db.select().from(s.lessons).where(eq(s.lessons.id, lessonId));
    if (!les) return NextResponse.json({ error: "الدرس غير موجود" }, { status: 404 });
    const allowed = !!dev || les.isFree || !les.isProtected
      || (await db.select().from(s.access).where(and(eq(s.access.userId, user.id), eq(s.access.lessonId, lessonId)))).length > 0;
    if (!allowed) return NextResponse.json({ error: "افتح الدرس بالكود أولاً" }, { status: 403 });
    const completed = !!b.completed;
    await db.insert(s.progress).values({ userId: user.id, lessonId, courseId: les.courseId, isCompleted: completed })
      .onConflictDoUpdate({ target: [s.progress.userId, s.progress.lessonId], set: { isCompleted: completed, updatedAt: new Date() } });
    await db.insert(s.history).values({ userId: user.id, lessonId, courseId: les.courseId });
    await db.update(s.lessons).set({ views: sql`${s.lessons.views} + 1` }).where(eq(s.lessons.id, lessonId));
    return NextResponse.json({ ok: true });
  }

  if (b.action === "favorite") {
    const courseId = Number(b.courseId);
    const found = await db.select().from(s.favorites).where(and(eq(s.favorites.userId, user.id), eq(s.favorites.courseId, courseId)));
    if (found.length) await db.delete(s.favorites).where(eq(s.favorites.id, found[0].id));
    else await db.insert(s.favorites).values({ userId: user.id, courseId }).onConflictDoNothing();
    return NextResponse.json({ ok: true });
  }

  if (b.action === "view-course") {
    const courseId = Number(b.courseId);
    await db.update(s.courses).set({ views: sql`${s.courses.views} + 1` }).where(eq(s.courses.id, courseId));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown" }, { status: 400 });
}
