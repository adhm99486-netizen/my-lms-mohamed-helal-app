import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeSite, type SiteConfig } from "@/lib/site";

const KEY = "site_config";

export async function loadSite(): Promise<SiteConfig> {
  try {
    const rows = await db.select().from(s.settings).where(eq(s.settings.key, KEY));
    const raw = rows[0] ? JSON.parse(rows[0].value) : {};
    return normalizeSite(raw);
  } catch {
    return normalizeSite({});
  }
}

export async function saveSite(input: unknown): Promise<SiteConfig> {
  const site = normalizeSite(input);
  const value = JSON.stringify(site);
  await db.insert(s.settings).values({ key: KEY, value })
    .onConflictDoUpdate({ target: s.settings.key, set: { value } });
  return site;
}
