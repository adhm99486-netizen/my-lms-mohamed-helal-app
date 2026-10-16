import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPw, genCode, DEVELOPER_EMAIL } from "./auth";

let seeded=false;
// Initial developer password. Set INITIAL_DEV_PASSWORD in the environment and change it after first login.
const INITIAL_DEV_PW = (process.env.INITIAL_DEV_PASSWORD && process.env.INITIAL_DEV_PASSWORD.length >= 8) ? process.env.INITIAL_DEV_PASSWORD : (process.env.NODE_ENV === "production" ? "" : "Developer2026!");
export async function ensureSeed(){
  if(seeded) return; seeded=true;
  try{
    const existing = await db.select().from(s.courses).limit(1);
        const pw = await db.select().from(s.settings).where(eq(s.settings.key,"dev_password"));
    if(!pw.length && INITIAL_DEV_PW){ await db.insert(s.settings).values({key:"dev_password", value: await hashPw(INITIAL_DEV_PW)}).onConflictDoNothing(); }
    // developer user
    const dev = await db.select().from(s.users).where(eq(s.users.email, DEVELOPER_EMAIL));
    if(!dev.length && INITIAL_DEV_PW){ await db.insert(s.users).values({name:"مطور المنصة", email:DEVELOPER_EMAIL, passwordHash: await hashPw(INITIAL_DEV_PW), role:"developer"}).onConflictDoNothing(); }
    // Demo courses are only created when SEED_DEMO=true (never on a real academy by accident).
    if(existing.length || process.env.SEED_DEMO!=="true") return;
    const imgs=[
      "https://images.pexels.com/photos/5905749/pexels-photo-5905749.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
      "https://images.pexels.com/photos/5905964/pexels-photo-5905964.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
      "https://images.pexels.com/photos/7972949/pexels-photo-7972949.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
      "https://images.pexels.com/photos/5905709/pexels-photo-5905709.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    ];
    const data=[
      {title:"أساسيات البرمجة بلغة بايثون",desc:"تعلم البرمجة من الصفر حتى بناء مشاريع حقيقية، مع تمارين وملفات وروابط لكل درس.",cat:"برمجة",teacher:"أ. أحمد سامي",yt:"rfscVS0vtbw"},
      {title:"الرياضيات للثانوية العامة",desc:"شرح مبسط للجبر والتفاضل والتكامل مع حلول نموذجية وملفات PDF للمراجعة النهائية.",cat:"رياضيات",teacher:"أ. سارة محمود",yt:"NybHckSEQBI"},
      {title:"اللغة الإنجليزية من الصفر",desc:"قواعد ومحادثة ومفردات بطريقة تفاعلية، دروس قصيرة واختبارات وروابط تدريب خارجية.",cat:"لغات",teacher:"م. كريم علي",yt:"juKd26qkNAI"},
      {title:"تطوير الويب الحديث JavaScript",desc:"من HTML و CSS إلى JavaScript وبناء واجهات تفاعلية ومشاريع عملية كاملة.",cat:"برمجة",teacher:"أ. مستر محمد هلال الدين",yt:"PkZNo7MFNFg"},
    ];
    for(let i=0;i<data.length;i++){
      const [c]=await db.insert(s.courses).values({title:data[i].title,description:data[i].desc,image:imgs[i],teacherName:data[i].teacher,category:data[i].cat,level:"جميع المستويات",isPublished:true,sortOrder:i}).returning();
      const [m1]=await db.insert(s.modules).values({courseId:c.id,title:"الوحدة الأولى: البداية",sortOrder:0}).returning();
      const [m2]=await db.insert(s.modules).values({courseId:c.id,title:"الوحدة الثانية: التطبيق العملي",sortOrder:1}).returning();
      const lessonsData=[
        {moduleId:m1.id,type:"video",title:"المقدمة ومعاينة مجانية",desc:"درس مجاني للتعرف على خطة الكورس وطريقة التعلم داخل المنصة.",yt:data[i].yt,free:true,prot:false,dur:"12:30"},
        {moduleId:m1.id,type:"video",title:"الدرس الأول: الأساسيات خطوة بخطوة",desc:"شرح تفصيلي بالأمثلة مع تلخيص في نهاية الدرس.",yt:data[i].yt,free:false,prot:true,dur:"24:10"},
        {moduleId:m1.id,type:"pdf",title:"ملف الشرح والتلخيص PDF",desc:"ملف PDF على Google Drive يلخص أهم نقاط الوحدة الأولى.",url:"https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view",free:false,prot:true,dur:"PDF"},
        {moduleId:m2.id,type:"video",title:"الدرس الثاني: تطبيق عملي ومشروع",desc:"تطبيق كل ما تعلمته في مشروع عملي مع متابعة خطوة بخطوة.",yt:data[i].yt,free:false,prot:true,dur:"31:45"},
        {moduleId:m2.id,type:"link",title:"رابط خارجي: تمارين وتدريبات إضافية",desc:"موقع خارجي للتدريب وحل تمارين إضافية على الدرس.",url:"https://www.w3schools.com",free:true,prot:false,dur:"رابط"},
      ];
      for(let j=0;j<lessonsData.length;j++){
        const l=lessonsData[j];
        const [les]=await db.insert(s.lessons).values({courseId:c.id,moduleId:l.moduleId,type:l.type,title:l.title,description:l.desc,youtubeId:(l as any).yt||"",url:(l as any).url||"",duration:l.dur,isFree:l.free,isProtected:l.prot,allowDownload:l.type==="pdf",sortOrder:j,thumbnail:`https://img.youtube.com/vi/${data[i].yt}/hqdefault.jpg`}).returning();
        if(l.prot && l.type==="video"){
          for(let k=0;k<3;k++) await db.insert(s.codes).values({lessonId:les.id,code:genCode("VID"),maxUses:1,isActive:true}).onConflictDoNothing();
        }
      }
    }
    await db.insert(s.notifications).values({title:"مرحباً بك في منصة مستر محمد هلال أكاديمي 🎓",body:"تم إطلاق كورسات جديدة في البرمجة والرياضيات والإنجليزية. الدرس الأول مجاني في كل كورس!"});
  }catch(e){ seeded=false; console.error("seed",e); }
}
