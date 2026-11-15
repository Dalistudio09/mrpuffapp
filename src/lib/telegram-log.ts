import { getSql } from "./db";

const KEY = "tg_webhook_log";

export async function logWebhook(entry: Record<string, unknown>): Promise<void> {
  const row = { at: new Date().toISOString(), ...entry };
  console.error("[telegram]", JSON.stringify(row));
  try {
    const sql = await getSql();
    await sql.query(
      `insert into shop_settings (key, value) values ($1, $2)
       on conflict (key) do update set value = excluded.value`,
      [KEY, JSON.stringify(row).slice(0, 2000)],
    );
  } catch (err) {
    console.error("[telegram] log save failed", err);
  }
}

export async function readWebhookLog(): Promise<unknown> {
  try {
    const sql = await getSql();
    const rows = await sql<{ value: string }>`select value from shop_settings where key = ${KEY}`;
    if (!rows[0]?.value) return null;
    return JSON.parse(rows[0].value) as unknown;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "log-read-failed" };
  }
}
