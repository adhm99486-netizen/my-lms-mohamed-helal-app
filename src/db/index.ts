import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

function poolConfig(raw?: string): PoolConfig {
  if (!raw) return { max: 5 };
  const u = new URL(raw);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  // pg treats sslmode in the URL specially; we control TLS explicitly below.
  u.searchParams.delete("sslmode");
  return {
    connectionString: u.toString(),
    max: 5,
    // Supabase / managed Postgres use TLS; local development uses plain TCP.
    ssl: local ? false : { rejectUnauthorized: false },
  };
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && process.env.NODE_ENV === "production") {
  console.error("[db] DATABASE_URL is not set. Add it in Vercel → Settings → Environment Variables.");
}

const globalForDb = globalThis as typeof globalThis & { __mhPool?: Pool };

export const pool: Pool = globalForDb.__mhPool ?? new Pool(poolConfig(databaseUrl));
if (process.env.NODE_ENV !== "production") globalForDb.__mhPool = pool;

export const db = drizzle(pool);
