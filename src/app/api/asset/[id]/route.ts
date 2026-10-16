import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return new Response("Not found", { status: 404 });
  const rows = await db.select({ mime: s.siteAssets.mime, data: s.siteAssets.data }).from(s.siteAssets).where(eq(s.siteAssets.id, n));
  const row = rows[0];
  if (!row) return new Response("Not found", { status: 404 });
  const bytes = Buffer.from(row.data, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    },
  });
}
