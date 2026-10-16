"use client";
import { useMemo, useRef, useState } from "react";
import {
  TEXT_FIELDS, IMAGE_FIELDS, SECTION_LABELS, DEFAULT_TEXT, DEFAULT_IMAGE, defaultSite, newBlockId,
  type SiteConfig, type Section, type CustomBlock,
} from "@/lib/site";

type Props = {
  site: SiteConfig;
  save: (site: SiteConfig) => Promise<SiteConfig>;
  upload: (dataUrl: string, name: string) => Promise<string>;
  notify: (msg: string) => void;
};

const cls = {
  input: "w-full border dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2.5",
  btn: "px-4 py-2.5 rounded-xl font-bold text-sm",
  card: "bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-3xl p-5",
};

/* Resize and compress a picked image in the browser so it fits the database comfortably. */
async function compressImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("اختر صورة PNG أو JPG أو WebP أو GIF");
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("تعذر قراءة الصورة"));
      el.src = objectUrl;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("المتصفح لا يدعم معالجة الصور");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const LIMIT = 1900 * 1024; // decoded bytes, server limit is 2 MB
    const decodedSize = (u: string) => Math.floor(((u.length - u.indexOf(",") - 1) * 3) / 4);
    for (const q of [0.9, 0.8, 0.7, 0.6]) {
      const u = canvas.toDataURL("image/webp", q);
      if (u.startsWith("data:image/webp") && decodedSize(u) <= LIMIT) return u;
    }
    for (const q of [0.8, 0.6, 0.5]) {
      const u = canvas.toDataURL("image/jpeg", q);
      if (decodedSize(u) <= LIMIT) return u;
    }
    throw new Error("الصورة كبيرة جداً، اختر صورة أصغر");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function ImageSlot({ label, value, def, onChange, upload, notify }: {
  label: string; value: string; def: string; onChange: (v: string) => void;
  upload: Props["upload"]; notify: Props["notify"];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const shown = value || def;
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const data = await compressImage(f);
      const url = await upload(data, f.name);
      onChange(url);
      notify("✅ تم رفع الصورة — اضغط «حفظ التعديلات» لنشرها");
    } catch (e: any) {
      notify("❌ " + (e?.message || "تعذر رفع الصورة"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return (
    <div className="border dark:border-slate-800 rounded-2xl p-3 grid md:grid-cols-[160px_1fr] gap-3 items-start">
      <div className="rounded-xl bg-slate-100 dark:bg-slate-800 h-28 grid place-items-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shown} alt={label} className="max-h-28 w-full object-contain" />
      </div>
      <div className="space-y-2">
        <b className="text-sm block">{label}</b>
        <div className="flex gap-2 flex-wrap">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={e => pick(e.target.files?.[0])} />
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={`${cls.btn} bg-teal-700 text-white disabled:opacity-50`}>{busy ? "جاري الرفع..." : "📤 رفع صورة من جهازك"}</button>
          <button type="button" onClick={() => onChange("")} className={`${cls.btn} bg-slate-100 dark:bg-slate-800`}>↺ الافتراضية</button>
        </div>
        <input value={value} onChange={e => onChange(e.target.value.trim())} placeholder="أو الصق رابط صورة (https://...)" dir="ltr" className={cls.input} />
      </div>
    </div>
  );
}

export default function SiteEditor({ site, save, upload, notify }: Props) {
  const [draft, setDraft] = useState<SiteConfig>(() => structuredClone(site));
  const [saving, setSaving] = useState(false);
  const [group, setGroup] = useState<string>("sections");

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(site), [draft, site]);
  const groups = useMemo(() => Array.from(new Set(TEXT_FIELDS.map(f => f.group))), []);

  const setText = (key: string, value: string) => {
    setDraft(d => {
      const texts = { ...d.texts };
      if (value === "" || value === DEFAULT_TEXT[key]) delete texts[key]; else texts[key] = value;
      return { ...d, texts };
    });
  };
  const setImage = (key: string, value: string) => {
    setDraft(d => {
      const images = { ...d.images };
      if (!value || value === DEFAULT_IMAGE[key]) delete images[key]; else images[key] = value;
      return { ...d, images };
    });
  };
  const patchSection = (id: string, patch: Partial<Section>) =>
    setDraft(d => ({ ...d, sections: d.sections.map(s => (s.id === id ? { ...s, ...patch } : s)) }));
  const moveSection = (idx: number, dir: -1 | 1) =>
    setDraft(d => {
      const arr = [...d.sections];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return d;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return { ...d, sections: arr };
    });
  const patchBlock = (id: string, patch: Partial<CustomBlock>) =>
    setDraft(d => ({ ...d, customBlocks: { ...d.customBlocks, [id]: { ...d.customBlocks[id], ...patch } } }));
  const addCustom = () =>
    setDraft(d => {
      const id = newBlockId();
      const block: CustomBlock = { id, title: "قسم جديد", body: "اكتب هنا محتوى القسم", image: "", buttonText: "", buttonUrl: "" };
      return {
        ...d,
        customBlocks: { ...d.customBlocks, [id]: block },
        sections: [...d.sections, { id: `custom-${id}`, type: "custom", visible: true, align: "right", width: "contained", bg: "default", reverse: false, ref: id }],
      };
    });
  const removeCustom = (section: Section) => {
    if (!section.ref || !confirm("حذف هذا القسم المخصص نهائياً؟")) return;
    setDraft(d => {
      const customBlocks = { ...d.customBlocks };
      delete customBlocks[section.ref as string];
      return { ...d, customBlocks, sections: d.sections.filter(s => s.id !== section.id) };
    });
  };

  const sectionName = (s: Section) => (s.type === "custom" && s.ref ? `📝 ${draft.customBlocks[s.ref]?.title || "قسم مخصص"}` : SECTION_LABELS[s.type]);

  const doSave = async () => {
    setSaving(true);
    try { const saved = await save(draft); setDraft(structuredClone(saved)); } catch { /* the page shows the error */ } finally { setSaving(false); }
  };

  const tabs: [string, string][] = [["sections", "🧩 الأقسام والترتيب"], ["texts", "✏️ النصوص"], ["colors", "🎨 الألوان"], ["images", "🖼️ الصور"], ["custom", "📝 الأقسام المخصصة"]];

  return (
    <div className="space-y-4">
      <div className={`${cls.card} sticky top-2 z-10 shadow-lg`}>
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div>
            <h3 className="font-black text-lg">🎨 تخصيص الواجهة</h3>
            <p className="text-xs text-slate-500">غيّر النصوص والصور وترتيب الأقسام، ثم اضغط «حفظ» لنشر التعديلات على الموقع.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a href="/" target="_blank" rel="noreferrer" className={`${cls.btn} bg-slate-100 dark:bg-slate-800`}>👁️ معاينة الموقع</a>
            <button type="button" onClick={() => { if (confirm("إرجاع كل تعديلات الواجهة للوضع الافتراضي؟ (لن تُحذف الكورسات)")) setDraft(defaultSite()); }} className={`${cls.btn} bg-amber-100 text-amber-800`}>↺ الافتراضي</button>
            <button type="button" disabled={!dirty || saving} onClick={doSave} className={`${cls.btn} bg-teal-700 text-white disabled:opacity-40`}>{saving ? "جاري الحفظ..." : dirty ? "💾 حفظ التعديلات" : "✅ محفوظ"}</button>
          </div>
        </div>
        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
          {tabs.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setGroup(k)} className={`${cls.btn} whitespace-nowrap ${group === k ? "bg-slate-900 text-white dark:bg-white dark:text-black" : "bg-slate-100 dark:bg-slate-800"}`}>{l}</button>
          ))}
        </div>
      </div>

      {group === "sections" && (
        <div className={cls.card}>
          <h4 className="font-black mb-1">ترتيب الأقسام</h4>
          <p className="text-xs text-slate-500 mb-4">استخدم ▲ ▼ لتحريك القسم لأعلى أو لأسفل. الترتيب هنا هو ترتيبه في الصفحة الرئيسية، ويعمل بشكل صحيح على الموبايل والكمبيوتر.</p>
          <div className="space-y-3">
            {draft.sections.map((s, idx) => (
              <div key={s.id} className={`border dark:border-slate-800 rounded-2xl p-3 ${s.visible ? "" : "opacity-60"}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black flex-1 min-w-[180px]">{idx + 1}. {sectionName(s)}</span>
                  <button type="button" onClick={() => moveSection(idx, -1)} disabled={idx === 0} className={`${cls.btn} bg-slate-100 dark:bg-slate-800 disabled:opacity-30`} aria-label="تحريك لأعلى">▲</button>
                  <button type="button" onClick={() => moveSection(idx, 1)} disabled={idx === draft.sections.length - 1} className={`${cls.btn} bg-slate-100 dark:bg-slate-800 disabled:opacity-30`} aria-label="تحريك لأسفل">▼</button>
                  <button type="button" onClick={() => patchSection(s.id, { visible: !s.visible })} className={`${cls.btn} ${s.visible ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{s.visible ? "👁 ظاهر" : "🚫 مخفي"}</button>
                  {s.type === "custom" && <button type="button" onClick={() => removeCustom(s)} className={`${cls.btn} bg-red-600 text-white`}>حذف</button>}
                </div>
                <div className="grid sm:grid-cols-4 gap-2 mt-3 text-sm">
                  <label className="flex flex-col gap-1 font-bold">المحاذاة
                    <select value={s.align} onChange={e => patchSection(s.id, { align: e.target.value as Section["align"] })} className={cls.input}>
                      <option value="right">يمين</option><option value="center">وسط</option><option value="left">يسار</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 font-bold">العرض
                    <select value={s.width} onChange={e => patchSection(s.id, { width: e.target.value as Section["width"] })} className={cls.input}>
                      <option value="contained">داخل الصفحة</option><option value="full">عرض كامل</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 font-bold">الخلفية
                    <select value={s.bg} onChange={e => patchSection(s.id, { bg: e.target.value as Section["bg"] })} className={cls.input}>
                      <option value="default">عادية</option><option value="brand">لون المنصة (تيل)</option><option value="muted">رمادية فاتحة</option>
                    </select>
                  </label>
                  {(s.type === "hero" || s.type === "custom") && (
                    <label className="flex items-center gap-2 font-bold mt-5">
                      <input type="checkbox" checked={s.reverse} onChange={e => patchSection(s.id, { reverse: e.target.checked })} /> تبديل مكان الصورة والنص
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addCustom} className={`${cls.btn} bg-slate-900 text-white dark:bg-white dark:text-black mt-4`}>＋ إضافة قسم مخصص (نص + صورة + زر)</button>
        </div>
      )}

      {group === "colors" && (
        <div className={cls.card}>
          <h4 className="font-black mb-1">🎨 لون المنصة</h4>
          <p className="text-xs text-slate-500 mb-4">يغيّر لون الهيدر والأزرار والأقسام الملونة في كل الموقع. اختر لوناً، أو ارجع للون الافتراضي (تيل).</p>
          <div className="flex gap-3 items-center flex-wrap">
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(draft.brand) ? draft.brand : "#0f766e"} onChange={e => setDraft(d => ({ ...d, brand: e.target.value }))} className="w-16 h-12 rounded-xl border cursor-pointer" aria-label="اختيار لون المنصة" />
            <input value={draft.brand} onChange={e => setDraft(d => ({ ...d, brand: e.target.value.trim() }))} placeholder="#0f766e" dir="ltr" className={`${cls.input} max-w-[180px]`} />
            <button type="button" onClick={() => setDraft(d => ({ ...d, brand: "" }))} className={`${cls.btn} bg-slate-100 dark:bg-slate-800`}>↺ الافتراضي</button>
          </div>
          <p className="text-xs text-slate-500 mt-3">بعد الاختيار اضغط «حفظ التعديلات» لنشره على الموقع.</p>
        </div>
      )}

      {group === "texts" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {groups.map(g => (
              <a key={g} href={`#grp-${g}`} className="px-3 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold">{g}</a>
            ))}
          </div>
          {groups.map(g => (
            <div key={g} id={`grp-${g}`} className={cls.card}>
              <h4 className="font-black mb-3">{g}</h4>
              <div className="space-y-3">
                {TEXT_FIELDS.filter(f => f.group === g).map(f => {
                  const value = draft.texts[f.key] ?? f.def;
                  const isDefault = draft.texts[f.key] === undefined;
                  return (
                    <div key={f.key}>
                      <div className="flex justify-between items-center gap-2 mb-1">
                        <span className="text-sm font-bold">{f.label}</span>
                        {!isDefault && <button type="button" onClick={() => setText(f.key, "")} className="text-xs text-teal-700 font-bold">↺ الافتراضي</button>}
                      </div>
                      {f.multiline ? (
                        <textarea value={value} onChange={e => setText(f.key, e.target.value)} rows={3} className={cls.input} />
                      ) : (
                        <input value={value} onChange={e => setText(f.key, e.target.value)} className={cls.input} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {group === "images" && (
        <div className={cls.card}>
          <h4 className="font-black mb-1">الصور</h4>
          <p className="text-xs text-slate-500 mb-4">ارفع صورة من جهازك (تُضغط تلقائياً) أو الصق رابطها. الحد الأقصى للصورة المرفوعة 2 ميجا بعد الضغط.</p>
          <div className="space-y-3">
            {IMAGE_FIELDS.map(f => (
              <ImageSlot key={f.key} label={f.label} value={draft.images[f.key] ?? ""} def={DEFAULT_IMAGE[f.key] ?? f.def} onChange={v => setImage(f.key, v)} upload={upload} notify={notify} />
            ))}
          </div>
        </div>
      )}

      {group === "custom" && (
        <div className="space-y-4">
          {draft.sections.filter(s => s.type === "custom" && s.ref && draft.customBlocks[s.ref]).length === 0 && (
            <div className={cls.card}><p className="text-slate-500">لا توجد أقسام مخصصة بعد. اذهب إلى «الأقسام والترتيب» واضغط «إضافة قسم مخصص».</p></div>
          )}
          {draft.sections.filter(s => s.type === "custom" && s.ref && draft.customBlocks[s.ref]).map(s => {
            const b = draft.customBlocks[s.ref as string];
            return (
              <div key={s.id} className={cls.card}>
                <h4 className="font-black mb-3">📝 {b.title || "قسم مخصص"}</h4>
                <div className="grid gap-3">
                  <input value={b.title} onChange={e => patchBlock(b.id, { title: e.target.value.slice(0, 200) })} placeholder="عنوان القسم" className={cls.input} />
                  <textarea value={b.body} onChange={e => patchBlock(b.id, { body: e.target.value.slice(0, 4000) })} rows={5} placeholder="نص القسم (سطر جديد = Enter)" className={cls.input} />
                  <ImageSlot label="صورة القسم (اختياري)" value={b.image} def="" onChange={v => patchBlock(b.id, { image: v })} upload={upload} notify={notify} />
                  <div className="grid md:grid-cols-2 gap-2">
                    <input value={b.buttonText} onChange={e => patchBlock(b.id, { buttonText: e.target.value.slice(0, 80) })} placeholder="نص الزر (اختياري)" className={cls.input} />
                    <input value={b.buttonUrl} onChange={e => patchBlock(b.id, { buttonUrl: e.target.value.trim() })} placeholder="رابط الزر: https://... أو #courses" dir="ltr" className={cls.input} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="sticky bottom-3 flex justify-end">
        <button type="button" disabled={!dirty || saving} onClick={doSave} className={`${cls.btn} bg-teal-700 text-white shadow-2xl disabled:opacity-40`}>{saving ? "جاري الحفظ..." : "💾 حفظ التعديلات على الموقع"}</button>
      </div>
    </div>
  );
}
