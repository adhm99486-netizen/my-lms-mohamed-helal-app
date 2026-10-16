/* Shared site-configuration model (used by the public page, the API and the developer editor). */

export type SectionType = "hero" | "continue" | "courses" | "features" | "notifications" | "custom";
export type Section = {
  id: string;
  type: SectionType;
  visible: boolean;
  align: "right" | "center" | "left";
  width: "contained" | "full";
  bg: "default" | "brand" | "muted";
  reverse: boolean;
  ref?: string; // custom sections only: id of the custom block
};
export type CustomBlock = {
  id: string;
  title: string;
  body: string;
  image: string;
  buttonText: string;
  buttonUrl: string;
};
export type SiteConfig = {
  brand: string; // main colour as #rrggbb, or "" for the default teal
  texts: Record<string, string>;
  images: Record<string, string>;
  sections: Section[];
  customBlocks: Record<string, CustomBlock>;
};

type TextField = { key: string; group: string; label: string; def: string; multiline?: boolean };
type ImageField = { key: string; label: string; def: string };

export const TEXT_FIELDS: TextField[] = [
  { key: "brand.name", group: "الهيدر والقائمة", label: "اسم المنصة (بجانب الشعار)", def: "مستر محمد هلال" },
  { key: "brand.sub", group: "الهيدر والقائمة", label: "السطر الصغير تحت الاسم", def: "MOHAMED HELAL ACADEMY • تعلم في أي مكان" },
  { key: "header.search", group: "الهيدر والقائمة", label: "نص خانة البحث", def: "🔍 ابحث عن كورس، درس، معلم..." },
  { key: "header.teacherBtn", group: "الهيدر والقائمة", label: "زر انضم كمعلم", def: "👨‍🏫 انضم كمعلم" },
  { key: "header.loginBtn", group: "الهيدر والقائمة", label: "زر تسجيل الدخول", def: "تسجيل الدخول" },
  { key: "header.devBtn", group: "الهيدر والقائمة", label: "زر المطور", def: "</> المطور" },
  { key: "header.dashboardBtn", group: "الهيدر والقائمة", label: "زر لوحة التحكم (للمطور)", def: "⚙️ لوحة التحكم" },
  { key: "nav.home", group: "الهيدر والقائمة", label: "قائمة: الرئيسية", def: "🏠 الرئيسية" },
  { key: "nav.favorites", group: "الهيدر والقائمة", label: "قائمة: المفضلة", def: "❤️ المفضلة" },
  { key: "nav.history", group: "الهيدر والقائمة", label: "قائمة: آخر ما شاهدت", def: "🕘 آخر ما شاهدت" },
  { key: "nav.profile", group: "الهيدر والقائمة", label: "قائمة: ملفي وتقدمي", def: "👤 ملفي وتقدمي" },
  { key: "hero.badge", group: "الواجهة الرئيسية", label: "الشارة فوق العنوان", def: "✨ فيديوهات يوتيوب محمية • PDF على درايف • أكواد لكل درس" },
  { key: "hero.title", group: "الواجهة الرئيسية", label: "العنوان الكبير (سطر جديد = Enter)", def: "تعلم باحترافية،\nفي أي وقت ومن أي جهاز 📱💻", multiline: true },
  { key: "hero.subtitle", group: "الواجهة الرئيسية", label: "الوصف تحت العنوان", def: "منصة عربية متكاملة: كورسات مرتبة بوحدات ودروس، مشغل فيديو محمي من النسخ، حفظ تقدمك وآخر درس، وملفات وروابط لكل كورس.", multiline: true },
  { key: "hero.ctaCourses", group: "الواجهة الرئيسية", label: "زر تصفح الكورسات", def: "تصفح الكورسات ←" },
  { key: "hero.ctaTeacher", group: "الواجهة الرئيسية", label: "زر انضم كمعلم (الواجهة)", def: "انضم كمعلم 👨‍🏫" },
  { key: "hero.statCourses", group: "الواجهة الرئيسية", label: "إحصائية: كلمة كورس", def: "كورس" },
  { key: "hero.statVideos", group: "الواجهة الرئيسية", label: "إحصائية: كلمة فيديو", def: "فيديو" },
  { key: "hero.statPdf", group: "الواجهة الرئيسية", label: "إحصائية: كلمة ملف PDF", def: "ملف PDF" },
  { key: "hero.statViews", group: "الواجهة الرئيسية", label: "إحصائية: كلمة مشاهدة", def: "مشاهدة" },
  { key: "continue.title", group: "الواجهة الرئيسية", label: "عنوان: استكمل المشاهدة", def: "▶️ استكمل المشاهدة" },
  { key: "continue.cta", group: "الواجهة الرئيسية", label: "نص بطاقة استكمال المشاهدة", def: "متابعة من حيث توقفت ←" },
  { key: "courses.title", group: "الكورسات", label: "عنوان قسم الكورسات", def: "📚 الكورسات المتاحة" },
  { key: "courses.subtitle", group: "الكورسات", label: "وصف قسم الكورسات", def: "الدرس الأول مجاني للمعاينة في أغلب الكورسات — باقي الدروس المحمية تُفتح بكود خاص", multiline: true },
  { key: "courses.enter", group: "الكورسات", label: "زر دخول الكورس", def: "دخول الكورس ←" },
  { key: "courses.empty", group: "الكورسات", label: "رسالة عدم وجود نتائج", def: "لا توجد كورسات مطابقة للبحث حالياً" },
  { key: "features.title", group: "المميزات الثلاث", label: "عنوان قسم المميزات (اتركه فارغاً لإخفائه)", def: "" },
  { key: "feature1.icon", group: "المميزات الثلاث", label: "الميزة 1: الأيقونة", def: "🛡️" },
  { key: "feature1.title", group: "المميزات الثلاث", label: "الميزة 1: العنوان", def: "مشغل يوتيوب محمي" },
  { key: "feature1.desc", group: "المميزات الثلاث", label: "الميزة 1: الوصف", def: "طبقة حماية تمنع الكليك يمين ونسخ الرابط والسحب، مع علامة مائية بحساب الطالب وأكواد تحقق قبل التشغيل.", multiline: true },
  { key: "feature2.icon", group: "المميزات الثلاث", label: "الميزة 2: الأيقونة", def: "🎟️" },
  { key: "feature2.title", group: "المميزات الثلاث", label: "الميزة 2: العنوان", def: "أكواد خاصة لكل درس" },
  { key: "feature2.desc", group: "المميزات الثلاث", label: "الميزة 2: الوصف", def: "كل فيديو محمي له أكواد فريدة: استخدام مرة أو متعدد، تاريخ انتهاء، تفعيل وإيقاف فوري من لوحة المطور.", multiline: true },
  { key: "feature3.icon", group: "المميزات الثلاث", label: "الميزة 3: الأيقونة", def: "☁️" },
  { key: "feature3.title", group: "المميزات الثلاث", label: "الميزة 3: العنوان", def: "خدمات مجانية 100%" },
  { key: "feature3.desc", group: "المميزات الثلاث", label: "الميزة 3: الوصف", def: "الفيديوهات على YouTube والملفات على Google Drive وقاعدة البيانات PostgreSQL مجانية — بدون بطاقة بنكية.", multiline: true },
  { key: "notifications.title", group: "الإشعارات", label: "عنوان قسم الإشعارات", def: "🔔 إشعارات المنصة" },
  { key: "teacher.title", group: "نافذة انضم كمعلم", label: "عنوان النافذة", def: "👨‍🏫 انضم كمعلم في المنصة" },
  { key: "teacher.desc", group: "نافذة انضم كمعلم", label: "وصف النافذة", def: "املأ الطلب وسيقوم المطور بمراجعته وإنشاء حساب معلم لك", multiline: true },
  { key: "teacher.submit", group: "نافذة انضم كمعلم", label: "زر إرسال الطلب", def: "إرسال طلب الانضمام" },
  { key: "footer.title", group: "الفوتر", label: "عنوان الفوتر", def: "🎓 منصة مستر محمد هلال" },
  { key: "footer.desc", group: "الفوتر", label: "وصف الفوتر", def: "فيديوهات يوتيوب محمية • ملفات درايف • أكواد لكل درس • تعمل على الموبايل والتابلت والكمبيوتر • PWA قابلة للتثبيت", multiline: true },
  { key: "footer.teacherBtn", group: "الفوتر", label: "زر انضم كمعلم (الفوتر)", def: "انضم كمعلم" },
  { key: "footer.devBtn", group: "الفوتر", label: "زر المطور (الفوتر)", def: "المطور" },
];

export const IMAGE_FIELDS: ImageField[] = [
  { key: "logo", label: "شعار المنصة (يظهر في الهيدر)", def: "/logo.png" },
  { key: "heroImage", label: "صورة الواجهة الرئيسية", def: "https://images.pexels.com/photos/5905749/pexels-photo-5905749.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200" },
  { key: "defaultCourseImage", label: "صورة الكورس الافتراضية (إذا لم تُرفع صورة للكورس)", def: "https://images.pexels.com/photos/5905964/pexels-photo-5905964.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200" },
];

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "الواجهة الرئيسية (العنوان والصورة والإحصائيات)",
  continue: "استكمال المشاهدة",
  courses: "الكورسات",
  features: "المميزات الثلاث",
  notifications: "الإشعارات",
  custom: "قسم مخصص",
};

export const DEFAULT_TEXT: Record<string, string> = Object.fromEntries(TEXT_FIELDS.map(f => [f.key, f.def]));
export const DEFAULT_IMAGE: Record<string, string> = Object.fromEntries(IMAGE_FIELDS.map(f => [f.key, f.def]));

export const DEFAULT_SECTIONS: Section[] = [
  { id: "hero", type: "hero", visible: true, align: "right", width: "contained", bg: "brand", reverse: false },
  { id: "continue", type: "continue", visible: true, align: "right", width: "contained", bg: "default", reverse: false },
  { id: "courses", type: "courses", visible: true, align: "right", width: "contained", bg: "default", reverse: false },
  { id: "notifications", type: "notifications", visible: true, align: "right", width: "contained", bg: "default", reverse: false },
  { id: "features", type: "features", visible: true, align: "right", width: "contained", bg: "default", reverse: false },
];

export function defaultSite(): SiteConfig {
  return { brand: "", texts: {}, images: {}, sections: DEFAULT_SECTIONS.map(s => ({ ...s })), customBlocks: {} };
}

const IMG_OK = /^(\/api\/asset\/\d{1,10}|\/[A-Za-z0-9_\-./]{1,200}\.(png|jpe?g|webp|gif|svg)|https:\/\/[^\s"'<>]{4,2000})$/;
const LINK_OK = /^(https:\/\/[^\s"'<>]{4,2000}|\/(?!\/)[^\s"'<>]{0,2000}|#[A-Za-z0-9_-]{1,60})$/;
const SECTION_TYPES: SectionType[] = ["hero", "continue", "courses", "features", "notifications", "custom"];
const BLOCK_ID = /^[a-z0-9]{4,20}$/;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max).trim() : "";
}

/* Clean any incoming config (from the editor or from the database) into a safe, complete shape. */
export function normalizeSite(raw: any): SiteConfig {
  const r = raw && typeof raw === "object" ? raw : {};

  const texts: Record<string, string> = {};
  const rawTexts = r.texts && typeof r.texts === "object" ? r.texts : {};
  for (const f of TEXT_FIELDS) {
    const v = str(rawTexts[f.key], f.multiline ? 2000 : 500);
    if (v && v !== f.def) texts[f.key] = v;
  }

  const images: Record<string, string> = {};
  const rawImages = r.images && typeof r.images === "object" ? r.images : {};
  for (const f of IMAGE_FIELDS) {
    const v = str(rawImages[f.key], 2100);
    if (v && v !== f.def && IMG_OK.test(v)) images[f.key] = v;
  }

  const customBlocks: Record<string, CustomBlock> = {};
  const rawBlocks = r.customBlocks && typeof r.customBlocks === "object" ? r.customBlocks : {};
  for (const [key, b] of Object.entries<any>(rawBlocks).slice(0, 40)) {
    if (!BLOCK_ID.test(key) || !b || typeof b !== "object") continue;
    const image = str(b.image, 2100);
    const buttonUrl = str(b.buttonUrl, 2100);
    customBlocks[key] = {
      id: key,
      title: str(b.title, 200),
      body: str(b.body, 4000),
      image: image && IMG_OK.test(image) ? image : "",
      buttonText: str(b.buttonText, 80),
      buttonUrl: buttonUrl && LINK_OK.test(buttonUrl) ? buttonUrl : "",
    };
  }

  const sections: Section[] = [];
  const seen = new Set<string>();
  const rawSections = Array.isArray(r.sections) ? r.sections.slice(0, 60) : [];
  for (const x of rawSections) {
    if (!x || typeof x !== "object" || !SECTION_TYPES.includes(x.type)) continue;
    const type: SectionType = x.type;
    let id: string;
    let ref: string | undefined;
    if (type === "custom") {
      ref = typeof x.ref === "string" ? x.ref : "";
      if (!customBlocks[ref]) continue;
      id = `custom-${ref}`;
    } else {
      id = type;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const def = DEFAULT_SECTIONS.find(d => d.type === type);
    sections.push({
      id,
      type,
      visible: typeof x.visible === "boolean" ? x.visible : true,
      align: ["right", "center", "left"].includes(x.align) ? x.align : "right",
      width: x.width === "full" ? "full" : "contained",
      bg: ["default", "brand", "muted"].includes(x.bg) ? x.bg : (def?.bg ?? "default"),
      reverse: x.reverse === true,
      ...(ref !== undefined ? { ref } : {}),
    });
  }
  for (const d of DEFAULT_SECTIONS) if (!seen.has(d.id)) sections.push({ ...d });

  // keep only the custom blocks that are placed on the page
  const used = new Set(sections.filter(s => s.type === "custom").map(s => s.ref as string));
  for (const k of Object.keys(customBlocks)) if (!used.has(k)) delete customBlocks[k];

  const brand = typeof r.brand === "string" && /^#[0-9a-fA-F]{6}$/.test(r.brand.trim()) ? r.brand.trim().toLowerCase() : "";
  return { brand, texts, images, sections, customBlocks };
}

export function newBlockId(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(6, "x");
}

/* CSS that re-colours the teal palette used across the page (Tailwind v4 reads these variables at runtime). */
export function brandCss(brand: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(brand || "")) return "";
  const c = brand;
  return ":root{" +
    `--color-teal-50:color-mix(in srgb,${c} 8%,#fff);` +
    `--color-teal-100:color-mix(in srgb,${c} 16%,#fff);` +
    `--color-teal-600:color-mix(in srgb,${c} 88%,#fff);` +
    `--color-teal-700:${c};` +
    `--color-teal-800:color-mix(in srgb,${c} 82%,#000);` +
    `--color-teal-900:color-mix(in srgb,${c} 62%,#000);` +
    "}";
}
