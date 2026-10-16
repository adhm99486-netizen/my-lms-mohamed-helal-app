import { NextResponse } from "next/server";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { getDev, hashPw, verifyPw, genCode, genPassword, ytId, DEVELOPER_EMAIL } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { saveSite } from "@/lib/site-server";
import { normalizeSite } from "@/lib/site";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const ROLES = ["student", "teacher", "developer"];
const MIN_PW = 8;
const ASSET_MAX_BYTES = 2 * 1024 * 1024;
const ASSET_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

async function guard() { await ensureSeed(); return getDev(); }
async function log(actor: string, action: string, details = "") {
  try { await db.insert(s.auditLogs).values({ actor, action, details: details.slice(0, 500) }); } catch { /* logging must never break an action */ }
}
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const httpsUrl = (v: unknown, max = 2000) => { const t = str(v, max); return /^https:\/\/\S+$/.test(t) ? t : ""; };
const toDate = (v: unknown) => { if (!v) return null; const d = new Date(v as string); return isNaN(d.getTime()) ? null : d; };
const LESSON_TYPES = ["video", "pdf", "link"];

function lessonRow(L: any, courseId: number, moduleId: number | null, sortOrder: number) {
  const type = LESSON_TYPES.includes(L.type) ? L.type : "video";
  const youtubeId = type === "video" ? ytId(str(L.youtubeId || L.url, 300)) : "";
  const thumb = httpsUrl(L.thumbnail, 500) || (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : "");
  return {
    courseId,
    moduleId,
    type,
    title: str(L.title, 200),
    description: str(L.description, 2000),
    youtubeId,
    url: type === "video" ? "" : httpsUrl(L.url),
    thumbnail: thumb,
    duration: str(L.duration, 20),
    isFree: !!L.isFree,
    isProtected: L.isProtected !== false,
    allowDownload: type === "pdf" && !!L.allowDownload,
    sortOrder,
  };
}

async function newUniqueCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = genCode("VID");
    const found = await db.select({ id: s.codes.id }).from(s.codes).where(eq(s.codes.code, code));
    if (!found.length) return code;
  }
  return genCode("VID") + "-" + Date.now().toString(36).toUpperCase();
}

export async function GET(req: Request) {
  const dev = await guard();
  if (!dev) return NextResponse.json({ error: "صلاحية المطور مطلوبة" }, { status: 403 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").toLowerCase().slice(0, 100);
  const [users, courses, lessons, codesList, logs, reqs, allProgress] = await Promise.all([
    db.select().from(s.users).orderBy(desc(s.users.createdAt)),
    db.select().from(s.courses).orderBy(s.courses.sortOrder),
    db.select().from(s.lessons).orderBy(s.lessons.sortOrder),
    db.select().from(s.codes).orderBy(desc(s.codes.createdAt)),
    db.select().from(s.auditLogs).orderBy(desc(s.auditLogs.createdAt)).limit(100),
    db.select().from(s.teacherRequests).orderBy(desc(s.teacherRequests.createdAt)),
    db.select().from(s.progress),
  ]);
  const now = new Date();
  const stats = {
    users: users.length,
    courses: courses.length,
    videos: lessons.filter(l => l.type === "video").length,
    pdfs: lessons.filter(l => l.type === "pdf").length,
    links: lessons.filter(l => l.type === "link").length,
    views: lessons.reduce((a, l) => a + (l.views || 0), 0),
    codesActive: codesList.filter(c => c.isActive && !(c.expiresAt && new Date(c.expiresAt) < now) && (c.usedCount || 0) < (c.maxUses || 1)).length,
    codesExpired: codesList.filter(c => c.expiresAt && new Date(c.expiresAt) < now).length,
    codesTotal: codesList.length,
    completed: allProgress.filter(p => p.isCompleted).length,
  };
  const topVideos = [...lessons].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
  let search: any = null;
  if (q) {
    search = {
      courses: courses.filter(c => c.title.toLowerCase().includes(q)),
      lessons: lessons.filter(l => l.title.toLowerCase().includes(q)),
      users: users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)).map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })),
      codes: codesList.filter(c => c.code.toLowerCase().includes(q)),
    };
  }
  return NextResponse.json({
    stats, topVideos, search, courses, lessons, logs, progress: allProgress,
    users: users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt })),
    codes: codesList,
    teacherRequests: reqs,
  });
}

export async function POST(req: Request) {
  const dev = await guard();
  if (!dev) return NextResponse.json({ error: "صلاحية المطور مطلوبة - سجل دخول المطور أولاً" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const actor = dev.email || DEVELOPER_EMAIL;
  try {
    switch (b.action) {
      case "create-course": {
        const title = str(b.title, 200);
        if (!title) return NextResponse.json({ error: "اكتب اسم الكورس" }, { status: 400 });
        const [c] = await db.insert(s.courses).values({
          title,
          description: str(b.description, 4000),
          image: httpsUrl(b.image, 500),
          teacherName: str(b.teacherName, 120),
          category: str(b.category, 60) || "عام",
          level: str(b.level, 60) || "جميع المستويات",
          isPublished: b.isPublished !== false,
          sortOrder: num(b.sortOrder),
        }).returning();
        if (Array.isArray(b.modules)) {
          for (let i = 0; i < Math.min(b.modules.length, 50); i++) {
            const M = b.modules[i] || {};
            const [m] = await db.insert(s.modules).values({ courseId: c.id, title: str(M.title, 200) || `الوحدة ${i + 1}`, sortOrder: i }).returning();
            if (Array.isArray(M.lessons)) {
              for (let j = 0; j < Math.min(M.lessons.length, 200); j++) {
                const row = lessonRow(M.lessons[j] || {}, c.id, m.id, j);
                if (!row.title) continue;
                const [les] = await db.insert(s.lessons).values(row).returning();
                if (les.type === "video" && les.isProtected) await db.insert(s.codes).values({ lessonId: les.id, code: await newUniqueCode(), maxUses: 1, isActive: true });
              }
            }
          }
        }
        await log(actor, "إنشاء كورس", title);
        return NextResponse.json({ ok: true, course: c });
      }
      case "update-course": {
        const id = num(b.id);
        await db.update(s.courses).set({
          title: str(b.title, 200), description: str(b.description, 4000), image: httpsUrl(b.image, 500),
          teacherName: str(b.teacherName, 120), category: str(b.category, 60) || "عام", level: str(b.level, 60) || "جميع المستويات",
          isPublished: b.isPublished !== false, sortOrder: num(b.sortOrder),
        }).where(eq(s.courses.id, id));
        await log(actor, "تعديل كورس", str(b.title, 200));
        return NextResponse.json({ ok: true });
      }
      case "delete-course": {
        const id = num(b.id);
        const lessonIds = (await db.select({ id: s.lessons.id }).from(s.lessons).where(eq(s.lessons.courseId, id))).map(x => x.id);
        await db.transaction(async tx => {
          if (lessonIds.length) {
            await tx.delete(s.codes).where(inArray(s.codes.lessonId, lessonIds));
            await tx.delete(s.access).where(inArray(s.access.lessonId, lessonIds));
            await tx.delete(s.progress).where(inArray(s.progress.lessonId, lessonIds));
            await tx.delete(s.history).where(inArray(s.history.lessonId, lessonIds));
          }
          await tx.delete(s.lessons).where(eq(s.lessons.courseId, id));
          await tx.delete(s.modules).where(eq(s.modules.courseId, id));
          await tx.delete(s.favorites).where(eq(s.favorites.courseId, id));
          await tx.delete(s.courses).where(eq(s.courses.id, id));
        });
        await log(actor, "حذف كورس", String(id));
        return NextResponse.json({ ok: true });
      }
      case "create-module": {
        const [m] = await db.insert(s.modules).values({ courseId: num(b.courseId), title: str(b.title, 200) || "وحدة جديدة", sortOrder: num(b.sortOrder) }).returning();
        await log(actor, "إنشاء وحدة", str(b.title, 200));
        return NextResponse.json({ ok: true, module: m });
      }
      case "delete-module": {
        const id = num(b.id);
        await db.update(s.lessons).set({ moduleId: null }).where(eq(s.lessons.moduleId, id));
        await db.delete(s.modules).where(eq(s.modules.id, id));
        return NextResponse.json({ ok: true });
      }
      case "save-lesson": {
        const courseId = num(b.courseId);
        if (!courseId) return NextResponse.json({ error: "اختر الكورس" }, { status: 400 });
        const row = lessonRow(b, courseId, b.moduleId ? num(b.moduleId) : null, num(b.sortOrder));
        if (!row.title) return NextResponse.json({ error: "اكتب عنوان الدرس" }, { status: 400 });
        let les: any;
        if (b.id) {
          const id = num(b.id);
          await db.update(s.lessons).set(row).where(eq(s.lessons.id, id));
          [les] = await db.select().from(s.lessons).where(eq(s.lessons.id, id));
          await log(actor, "تعديل محتوى", row.title);
        } else {
          [les] = await db.insert(s.lessons).values(row).returning();
          if (les.type === "video" && les.isProtected) await db.insert(s.codes).values({ lessonId: les.id, code: await newUniqueCode(), maxUses: 1, isActive: true });
          await log(actor, "إضافة محتوى", row.title);
        }
        return NextResponse.json({ ok: true, lesson: les });
      }
      case "delete-lesson": {
        const id = num(b.id);
        await db.transaction(async tx => {
          await tx.delete(s.codes).where(eq(s.codes.lessonId, id));
          await tx.delete(s.access).where(eq(s.access.lessonId, id));
          await tx.delete(s.progress).where(eq(s.progress.lessonId, id));
          await tx.delete(s.history).where(eq(s.history.lessonId, id));
          await tx.delete(s.lessons).where(eq(s.lessons.id, id));
        });
        await log(actor, "حذف محتوى", String(id));
        return NextResponse.json({ ok: true });
      }
      case "reorder-lessons": {
        const ids: number[] = Array.isArray(b.ids) ? b.ids.map(Number).slice(0, 500) : [];
        for (let i = 0; i < ids.length; i++) await db.update(s.lessons).set({ sortOrder: i }).where(eq(s.lessons.id, ids[i]));
        return NextResponse.json({ ok: true });
      }
      case "reorder-courses": {
        const ids: number[] = Array.isArray(b.ids) ? b.ids.map(Number).slice(0, 500) : [];
        for (let i = 0; i < ids.length; i++) await db.update(s.courses).set({ sortOrder: i }).where(eq(s.courses.id, ids[i]));
        return NextResponse.json({ ok: true });
      }
      case "generate-codes": {
        const lessonId = num(b.lessonId);
        const [les] = await db.select().from(s.lessons).where(eq(s.lessons.id, lessonId));
        if (!les || les.type !== "video") return NextResponse.json({ error: "اختر فيديو صالحاً" }, { status: 400 });
        const count = Math.min(200, Math.max(1, num(b.count, 10)));
        const maxUses = Math.min(100000, Math.max(1, num(b.maxUses, 1)));
        const expiresAt = toDate(b.expiresAt);
        const custom = str(b.customCode, 40).toUpperCase();
        const created: string[] = [];
        if (custom && count === 1) {
          if (!/^[A-Z0-9-]{4,40}$/.test(custom)) return NextResponse.json({ error: "الكود المخصص: أحرف وأرقام و- فقط (4-40)" }, { status: 400 });
          try { await db.insert(s.codes).values({ lessonId, code: custom, isActive: true, maxUses, expiresAt }); created.push(custom); }
          catch { return NextResponse.json({ error: "هذا الكود مستخدم بالفعل" }, { status: 400 }); }
        } else {
          for (let i = 0; i < count; i++) {
            const code = await newUniqueCode();
            await db.insert(s.codes).values({ lessonId, code, isActive: true, maxUses, expiresAt });
            created.push(code);
          }
        }
        await log(actor, "إنشاء أكواد", `${created.length} كود للدرس ${lessonId}`);
        return NextResponse.json({ ok: true, created });
      }
      case "import-codes": {
        const lessonId = num(b.lessonId);
        const [les] = await db.select().from(s.lessons).where(eq(s.lessons.id, lessonId));
        if (!les) return NextResponse.json({ error: "اختر الفيديو أولاً" }, { status: 400 });
        const list = [...new Set(String(b.csv || "").split(/[\n,;]+/).map(x => x.trim().toUpperCase()).filter(x => /^[A-Z0-9-]{4,40}$/.test(x)))].slice(0, 1000);
        const maxUses = Math.min(100000, Math.max(1, num(b.maxUses, 1)));
        let imported = 0, skipped = 0;
        for (const code of list) {
          try { await db.insert(s.codes).values({ lessonId, code, maxUses, isActive: true }); imported++; }
          catch { skipped++; }
        }
        await log(actor, "استيراد أكواد CSV", `${imported} مستورد، ${skipped} مكرر/غير صالح`);
        return NextResponse.json({ ok: true, imported, skipped });
      }
      case "update-code": {
        const set: any = {};
        if (typeof b.isActive === "boolean") set.isActive = b.isActive;
        if (b.maxUses) set.maxUses = Math.min(100000, Math.max(1, num(b.maxUses, 1)));
        if (b.code) {
          const c = str(b.code, 40).toUpperCase();
          if (!/^[A-Z0-9-]{4,40}$/.test(c)) return NextResponse.json({ error: "الكود: أحرف وأرقام و- فقط" }, { status: 400 });
          set.code = c;
        }
        if (b.expiresAt !== undefined) set.expiresAt = toDate(b.expiresAt);
        if (!Object.keys(set).length) return NextResponse.json({ ok: true });
        try { await db.update(s.codes).set(set).where(eq(s.codes.id, num(b.id))); }
        catch { return NextResponse.json({ error: "هذا الكود مستخدم بالفعل" }, { status: 400 }); }
        await log(actor, "تعديل كود", String(b.id));
        return NextResponse.json({ ok: true });
      }
      case "delete-code":
        await db.delete(s.codes).where(eq(s.codes.id, num(b.id)));
        return NextResponse.json({ ok: true });
      case "regenerate-code": {
        const code = await newUniqueCode();
        await db.update(s.codes).set({ code, usedCount: 0, isActive: true }).where(eq(s.codes.id, num(b.id)));
        await db.delete(s.access).where(eq(s.access.codeId, num(b.id)));
        return NextResponse.json({ ok: true, code });
      }
      case "add-user": {
        const name = str(b.name, 80);
        const email = str(b.email, 254).toLowerCase();
        const password = typeof b.password === "string" ? b.password : "";
        const role = ROLES.includes(b.role) ? b.role : "teacher";
        if (!name || !EMAIL_RE.test(email) || password.length < MIN_PW) return NextResponse.json({ error: `اكتب الاسم وبريداً صحيحاً وكلمة مرور ${MIN_PW} أحرف على الأقل` }, { status: 400 });
        const ex = await db.select().from(s.users).where(eq(s.users.email, email));
        if (ex.length) return NextResponse.json({ error: "البريد موجود بالفعل" }, { status: 400 });
        const [u] = await db.insert(s.users).values({ name, email, passwordHash: await hashPw(password), role }).returning();
        await log(actor, "إضافة مستخدم/مطور/معلم", `${role} ${email}`);
        return NextResponse.json({ ok: true, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
      }
      case "update-role": {
        const id = num(b.id);
        const [target] = await db.select().from(s.users).where(eq(s.users.id, id));
        if (!target) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
        if (target.email === DEVELOPER_EMAIL) return NextResponse.json({ error: "صلاحية المطور الرئيسي لا تتغير" }, { status: 400 });
        if (!ROLES.includes(b.role)) return NextResponse.json({ error: "صلاحية غير صالحة" }, { status: 400 });
        await db.update(s.users).set({ role: b.role }).where(eq(s.users.id, id));
        await log(actor, "تغيير صلاحية", `${target.email} -> ${b.role}`);
        return NextResponse.json({ ok: true });
      }
      case "reset-user-password": {
        const id = num(b.id);
        const [target] = await db.select().from(s.users).where(eq(s.users.id, id));
        if (!target) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
        if (target.email === DEVELOPER_EMAIL) return NextResponse.json({ error: "كلمة مرور المطور تُغيَّر من الإعدادات" }, { status: 400 });
        const tempPassword = genPassword("Temp");
        await db.update(s.users).set({ passwordHash: await hashPw(tempPassword) }).where(eq(s.users.id, id));
        await log(actor, "إعادة تعيين كلمة مرور", target.email);
        return NextResponse.json({ ok: true, tempPassword });
      }
      case "delete-user": {
        const id = num(b.id);
        const [target] = await db.select().from(s.users).where(eq(s.users.id, id));
        if (!target) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
        if (target.email === DEVELOPER_EMAIL) return NextResponse.json({ error: "لا يمكن حذف حساب المطور الرئيسي" }, { status: 400 });
        await db.transaction(async tx => {
          await tx.delete(s.access).where(eq(s.access.userId, id));
          await tx.delete(s.progress).where(eq(s.progress.userId, id));
          await tx.delete(s.history).where(eq(s.history.userId, id));
          await tx.delete(s.favorites).where(eq(s.favorites.userId, id));
          await tx.delete(s.users).where(eq(s.users.id, id));
        });
        await log(actor, "حذف مستخدم", target.email);
        return NextResponse.json({ ok: true });
      }
      case "teacher-request-status": {
        const id = num(b.id);
        const status = ["pending", "approved", "rejected"].includes(b.status) ? b.status : "pending";
        const [reqRow] = await db.select().from(s.teacherRequests).where(eq(s.teacherRequests.id, id));
        if (!reqRow) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
        await db.update(s.teacherRequests).set({ status }).where(eq(s.teacherRequests.id, id));
        let tempPassword: string | undefined;
        if (status === "approved") {
          const email = reqRow.email.toLowerCase();
          const ex = await db.select().from(s.users).where(eq(s.users.email, email));
          if (!ex.length) {
            tempPassword = genPassword("Teacher");
            await db.insert(s.users).values({ name: reqRow.name || "معلم", email, passwordHash: await hashPw(tempPassword), role: "teacher" });
          }
        }
        await log(actor, "طلب معلم", `${status} ${reqRow.email}`);
        return NextResponse.json({ ok: true, tempPassword, accountExists: status === "approved" && !tempPassword });
      }
      case "change-dev-password": {
        const rows = await db.select().from(s.settings).where(eq(s.settings.key, "dev_password"));
        if (!(await verifyPw(typeof b.current === "string" ? b.current : "", rows[0]?.value || ""))) return NextResponse.json({ error: "كلمة المرور الحالية غير صحيحة" }, { status: 400 });
        if (typeof b.next !== "string" || b.next.length < MIN_PW) return NextResponse.json({ error: `الجديدة ${MIN_PW} أحرف على الأقل` }, { status: 400 });
        const hash = await hashPw(b.next);
        await db.update(s.settings).set({ value: hash }).where(eq(s.settings.key, "dev_password"));
        await db.update(s.users).set({ passwordHash: hash }).where(eq(s.users.email, DEVELOPER_EMAIL));
        await log(actor, "تغيير كلمة مرور المطور", "");
        return NextResponse.json({ ok: true });
      }
      case "notify": {
        const title = str(b.title, 200);
        if (!title) return NextResponse.json({ error: "اكتب عنوان الإشعار" }, { status: 400 });
        await db.insert(s.notifications).values({ title, body: str(b.body, 1000) });
        await log(actor, "إرسال إشعار", title);
        return NextResponse.json({ ok: true });
      }
      case "save-site": {
        const site = await saveSite(b.site);
        await log(actor, "تحديث الواجهة", `${Object.keys(site.texts).length} نص • ${Object.keys(site.images).length} صورة • ${site.sections.length} قسم`);
        return NextResponse.json({ ok: true, site });
      }
      case "upload-asset": {
        const m = typeof b.data === "string" ? b.data.match(ASSET_RE) : null;
        if (!m) return NextResponse.json({ error: "الملف يجب أن يكون صورة PNG أو JPG أو WebP أو GIF" }, { status: 400 });
        const size = Math.floor((m[2].length * 3) / 4);
        if (size > ASSET_MAX_BYTES) return NextResponse.json({ error: "الصورة كبيرة جداً بعد الضغط (الحد 2 ميجا)" }, { status: 400 });
        const [row] = await db.insert(s.siteAssets).values({ name: str(b.name, 120), mime: m[1], size, data: m[2] }).returning({ id: s.siteAssets.id });
        await log(actor, "رفع صورة", `#${row.id} ${size} bytes`);
        return NextResponse.json({ ok: true, id: row.id, url: `/api/asset/${row.id}` });
      }
      case "backup": {
        const [courses, modules, lessons, codesList, users, assets, siteRow] = await Promise.all([
          db.select().from(s.courses), db.select().from(s.modules), db.select().from(s.lessons), db.select().from(s.codes),
          db.select().from(s.users), db.select().from(s.siteAssets),
          db.select().from(s.settings).where(eq(s.settings.key, "site_config")),
        ]);
        return NextResponse.json({
          ok: true,
          backup: {
            version: 2,
            exportedAt: new Date().toISOString(),
            courses, modules, lessons, codes: codesList,
            users: users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })),
            site: siteRow[0] ? JSON.parse(siteRow[0].value) : null,
            assets,
          },
        });
      }
      case "restore": {
        const bk = b.backup;
        if (!bk || !Array.isArray(bk.courses) || !Array.isArray(bk.modules) || !Array.isArray(bk.lessons) || !Array.isArray(bk.codes)) {
          return NextResponse.json({ error: "ملف النسخة الاحتياطية غير صالح" }, { status: 400 });
        }
        const pick = (r: any, keys: string[]) => Object.fromEntries(keys.filter(k => r[k] !== undefined).map(k => [k, /At$|expiresAt$|watchedAt$|updatedAt$/.test(k) ? toDate(r[k]) : r[k]]));
        const courseRows = bk.courses.map((r: any) => pick(r, ["id", "title", "description", "image", "teacherName", "category", "level", "isPublished", "sortOrder", "views", "createdBy", "createdAt"]));
        const moduleRows = bk.modules.map((r: any) => pick(r, ["id", "courseId", "title", "sortOrder"]));
        const lessonRows = bk.lessons.map((r: any) => pick(r, ["id", "courseId", "moduleId", "type", "title", "description", "youtubeId", "url", "thumbnail", "duration", "isFree", "isProtected", "allowDownload", "sortOrder", "views", "createdAt"]));
        const codeRows = bk.codes.map((r: any) => pick(r, ["id", "lessonId", "code", "isActive", "maxUses", "usedCount", "expiresAt", "createdAt"]));
        await db.transaction(async tx => {
          await tx.delete(s.codes);
          await tx.delete(s.lessons);
          await tx.delete(s.modules);
          await tx.delete(s.courses);
          if (courseRows.length) await tx.insert(s.courses).values(courseRows);
          if (moduleRows.length) await tx.insert(s.modules).values(moduleRows);
          if (lessonRows.length) await tx.insert(s.lessons).values(lessonRows);
          if (codeRows.length) await tx.insert(s.codes).values(codeRows);
          for (const t of ["courses", "modules", "lessons", "codes"]) {
            await tx.execute(sql.raw(`SELECT setval(pg_get_serial_sequence('${t}','id'), COALESCE((SELECT MAX(id) FROM ${t}), 1), (SELECT MAX(id) FROM ${t}) IS NOT NULL)`));
          }
          if (Array.isArray(bk.assets)) {
            for (const a of bk.assets.slice(0, 500)) {
              if (typeof a?.id !== "number" || typeof a?.data !== "string" || typeof a?.mime !== "string") continue;
              await tx.insert(s.siteAssets).values({ id: a.id, name: str(a.name, 120), mime: a.mime, size: num(a.size), data: a.data, createdAt: toDate(a.createdAt) })
                .onConflictDoNothing();
            }
            await tx.execute(sql.raw(`SELECT setval(pg_get_serial_sequence('site_assets','id'), COALESCE((SELECT MAX(id) FROM site_assets), 1), (SELECT MAX(id) FROM site_assets) IS NOT NULL)`));
          }
          if (bk.site && typeof bk.site === "object") {
            const value = JSON.stringify(normalizeSite(bk.site));
            await tx.insert(s.settings).values({ key: "site_config", value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
          }
        });
        await log(actor, "استعادة نسخة احتياطية", `${courseRows.length} كورس • ${lessonRows.length} درس • ${codeRows.length} كود`);
        return NextResponse.json({ ok: true, restored: { courses: courseRows.length, lessons: lessonRows.length, codes: codeRows.length } });
      }
      default:
        return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
    }
  } catch (e: any) {
    console.error("[admin]", b?.action, e);
    return NextResponse.json({ error: "حدث خطأ في الخادم، حاول مرة أخرى" }, { status: 500 });
  }
}
