import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { loadSite } from "@/lib/site-server";
import { brandCss } from "@/lib/site";

// The brand colour is read from the database on every request, so a change in the developer panel shows at once.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "منصة مستر محمد هلال | Mohamed Helal Academy",
  description: "منصة تعليمية عربية - فيديوهات يوتيوب محمية، ملفات PDF على درايف، أكواد حماية لكل درس",
  manifest: "/manifest.json",
  icons: { icon: "/logo.png", apple: "/logo.png" },
  appleWebApp: { capable: true, title: "مستر محمد هلال", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#0f766e", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const site = await loadSite();
  const css = brandCss(site.brand);
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-[#f6f7f9] text-slate-900 dark:bg-[#0b1220] dark:text-slate-100 antialiased min-h-screen">
        {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
        {children}
      </body>
    </html>
  );
}
