import { Pool, types } from "pg";

/**
 * Server-only Neon client. `DATABASE_URL` comes from Vercel project env.
 * Empty/whitespace counts as unset.
 */
const rawDatabaseUrl =
  typeof process !== "undefined" ? process.env.DATABASE_URL : undefined;
const databaseUrl =
  rawDatabaseUrl && rawDatabaseUrl.trim() ? rawDatabaseUrl.trim() : undefined;

/**
 * Minimal SQL surface used by server functions:
 *
 *   const sql = await getSql();
 *   const rows = await sql`select * from products where id = ${id}`;
 *   const rows2 = await sql.query("select * from products where id = $1", [id]);
 */
export interface Sql {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
}

/**
 * Init lives on globalThis so dev HMR does not open a second pool.
 * A failed init clears its slot so the next call retries.
 */
const globalRef = globalThis as typeof globalThis & {
  __pgSqlPromise__?: Promise<Sql>;
};

// Postgres sends every value as text plus a type OID. Normalize the ones that
// differ across drivers so JSON responses stay stable:
//   int8/bigint (incl. count(*)) -> number
//   date                         -> 'YYYY-MM-DD'
//   interval                     -> Postgres interval text
const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (v: string) => v;

type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

function toSql(run: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  return sql;
}

function needsSsl(url: string): boolean {
  return /sslmode=require|neon\.tech/i.test(url);
}

function createNeonSql(): Promise<Sql> {
  if (!databaseUrl) {
    return Promise.reject(
      new Error(
        "DATABASE_URL is not set. Add the Neon connection string to Vercel env.",
      ),
    );
  }
  globalRef.__pgSqlPromise__ ??= (async () => {
    types.setTypeParser(OID_INT8, Number);
    types.setTypeParser(OID_DATE, identity);
    types.setTypeParser(OID_INTERVAL, identity);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      ssl: needsSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined,
    });
    return toSql(async <T>(text: string, params: unknown[]) => {
      const res = await pool.query(text, params);
      return res.rows as T[];
    });
  })().catch((err) => {
    globalRef.__pgSqlPromise__ = undefined;
    throw err;
  });
  return globalRef.__pgSqlPromise__;
}

let sqlPromise: Promise<Sql> | null = null;

async function createSql(): Promise<Sql> {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only — call getSql() from a createServerFn handler " +
        "or a server route loader, never from client code.",
    );
  }
  return createNeonSql();
}

/**
 * Shared server-only SQL client. Neon only, via `DATABASE_URL`.
 * Schema is applied by `scripts/migrate.mjs` during `npm run build`.
 */
export function getSql(): Promise<Sql> {
  sqlPromise ??= createSql().catch((err) => {
    sqlPromise = null;
    throw err;
  });
  return sqlPromise;
}

/** Kept so existing startup hooks stay a no-op. Migrations run at build time. */
export function ensureDbReady(): Promise<void> {
  return Promise.resolve();
}
