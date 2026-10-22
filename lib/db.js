import { neon } from '@neondatabase/serverless';

/**
 * Database access for chulafair.com.
 *
 * This site deliberately shares CUFTM's database (task.chulafair.com). That is
 * how "only CUFTM admins and co-admins can edit the website" works without a
 * second list of accounts: sign-in reads CUFTM's own `users` table, read-only.
 *
 * Everything this site owns lives in tables prefixed `site_`, so it can never
 * collide with, or be touched by, CUFTM's migrations — and CUFTM's tables are
 * never written to from here.
 */

/**
 * Finding the connection string.
 *
 * Vercel does not always call it `DATABASE_URL`. When an existing storage
 * integration is connected to a SECOND project — exactly what happens here,
 * because CUFTM already owns this database — Vercel offers an environment
 * variable *prefix*, and the result is a name like `CUFTM_DATABASE_URL`. A
 * fixed list of names therefore fails in the one case this project is built
 * for, and fails silently, looking like "no database" when the database is
 * right there.
 *
 * So: the known names are tried first, and if none of them hold anything, any
 * variable whose value is actually a Postgres URL is used. Pooled connections
 * are preferred over unpooled ones, which matters on serverless.
 */
const PREFERRED = [
  'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL',
  'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL_NO_SSL',
];

const isPostgresUrl = (value) => typeof value === 'string' && /^postgres(ql)?:\/\/\S+$/.test(value.trim());

function findConnection() {
  for (const key of PREFERRED) {
    if (isPostgresUrl(process.env[key])) return { key, value: process.env[key].trim() };
  }
  // Anything prefixed, sorted so a pooled URL wins over an unpooled one.
  const found = Object.entries(process.env)
    .filter(([, value]) => isPostgresUrl(value))
    .sort(([a], [b]) => {
      const unpooled = (k) => /UNPOOLED|NON_POOLING/i.test(k);
      return (unpooled(a) ? 1 : 0) - (unpooled(b) ? 1 : 0) || a.localeCompare(b);
    });
  return found.length ? { key: found[0][0], value: found[0][1].trim() } : null;
}

const connection = findConnection();
const connectionString = connection ? connection.value : '';

export const hasDatabase = Boolean(connectionString);

/**
 * Names only, never values — enough for the admin page to say what it found
 * when a deployment cannot see its database.
 */
export const connectionReport = () => ({
  found: Boolean(connection),
  usingVariable: connection ? connection.key : null,
  postgresLookingVariables: Object.keys(process.env).filter((k) => isPostgresUrl(process.env[k])),
  databaseishVariables: Object.keys(process.env).filter((k) => /DATABASE|POSTGRES|NEON|^PG/i.test(k)),
});

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);

let client = null;
let schemaReady = null;

/**
 * Local Postgres (tests, `npm run dev`) speaks the wire protocol; Neon in
 * production speaks HTTP. Both are wrapped to the same tagged-template shape:
 * sql`SELECT ... ${value}` → array of rows.
 */
async function makeClient() {
  if (!isLocal) return neon(connectionString);
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString, max: 4 });
  const tag = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i++) text += `$${i + 1}` + strings[i + 1];
    const result = await pool.query(text, values);
    return result.rows;
  };
  tag.end = () => pool.end();
  return tag;
}

export async function getSql() {
  if (!hasDatabase) throw new Error('NO_DATABASE');
  if (!client) client = await makeClient();
  if (!schemaReady) {
    schemaReady = migrate(client).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
  return client;
}

/** For the test runner only. */
export async function closeSql() {
  if (client?.end) await client.end();
  client = null;
  schemaReady = null;
}

async function migrate(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS site_pages (
      id            TEXT PRIMARY KEY,
      kind          TEXT NOT NULL DEFAULT 'page',      -- 'page' | 'post'
      slug          TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'draft',     -- 'draft' | 'published'
      template      TEXT NOT NULL DEFAULT 'standard',  -- 'standard' | 'survey'
      title_th      TEXT NOT NULL DEFAULT '',
      title_en      TEXT NOT NULL DEFAULT '',
      summary_th    TEXT NOT NULL DEFAULT '',
      summary_en    TEXT NOT NULL DEFAULT '',
      body_th       TEXT NOT NULL DEFAULT '',
      body_en       TEXT NOT NULL DEFAULT '',
      notice_th     TEXT NOT NULL DEFAULT '',
      notice_en     TEXT NOT NULL DEFAULT '',
      cta_label_th  TEXT NOT NULL DEFAULT '',
      cta_label_en  TEXT NOT NULL DEFAULT '',
      cta_url       TEXT NOT NULL DEFAULT '',
      cover_url     TEXT NOT NULL DEFAULT '',
      accent        TEXT NOT NULL DEFAULT 'pink',
      in_nav        BOOLEAN NOT NULL DEFAULT false,
      nav_order     INTEGER NOT NULL DEFAULT 100,
      published_at  TIMESTAMPTZ,
      created_by    TEXT,
      updated_by    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (kind, slug)
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS site_revisions (
      id        BIGSERIAL PRIMARY KEY,
      page_id   TEXT NOT NULL,
      snapshot  JSONB NOT NULL,
      saved_by  TEXT,
      saved_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS site_revisions_page ON site_revisions (page_id, saved_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS site_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL DEFAULT '',
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS site_sessions (
      token      TEXT PRIMARY KEY,
      username   TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS site_login_attempts (
      username TEXT NOT NULL,
      at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  await seed(sql);
}

/**
 * The vendor-interest survey page is created once, as a DRAFT. It is never
 * re-created, so if an admin deletes or rewrites it, that choice stands.
 */
async function seed(sql) {
  const [done] = await sql`SELECT value FROM site_settings WHERE key = '_seeded_v1'`;
  if (done) return;

  await sql`
    INSERT INTO site_pages (
      id, kind, slug, status, template, accent,
      title_th, title_en, summary_th, summary_en,
      notice_th, notice_en, body_th, body_en,
      cta_label_th, cta_label_en, cta_url, created_by, updated_by)
    VALUES (
      'seed-shop-interest', 'page', 'shop-interest', 'draft', 'survey', 'gold',
      'แบบสำรวจความสนใจร่วมเปิดร้านค้ากับจุฬาฯแฟร์',
      'Interest survey: opening a shop at ChulaFAIR',
      'สนใจมาเปิดร้านในงานจุฬาฯแฟร์ 2027? บอกเราไว้ก่อน เพื่อช่วยให้ทีมงานวางแผนพื้นที่ร้านค้าได้ดีขึ้น',
      'Thinking of running a shop at ChulaFAIR 2027? Let us know early so the team can plan the market area.',
      'นี่ไม่ใช่ใบสมัครเปิดร้านค้า — เป็นเพียงแบบสำรวจความสนใจเท่านั้น การกรอกแบบสำรวจไม่ได้เป็นการจองพื้นที่หรือยืนยันสิทธิ์ใด ๆ รายละเอียดการรับสมัครจริงจะประกาศเร็ว ๆ นี้',
      'This is not an application form — it is only an interest survey. Filling it in does not reserve a space or guarantee a place. Details on how to actually apply will be announced soon.',
      ${'## ทำไมถึงมีแบบสำรวจนี้\n\nจุฬาฯแฟร์อยากรู้ว่ามีร้านค้าแบบไหนบ้างที่สนใจมาร่วมงาน เพื่อนำไปออกแบบโซนร้านค้า จำนวนพื้นที่ และรูปแบบการรับสมัครให้เหมาะสม\n\n## หลังจากกรอกแล้ว\n\n- ทีมงานจะใช้ข้อมูลเพื่อการวางแผนเท่านั้น\n- เมื่อเปิดรับสมัครจริง เราจะประกาศผ่านเว็บไซต์นี้และช่องทางของจุฬาฯแฟร์\n- ผู้ที่กรอกแบบสำรวจไว้อาจได้รับข่าวสารก่อน แต่ยังต้องสมัครตามขั้นตอนจริงอีกครั้ง'},
      ${'## Why this survey\n\nChulaFAIR wants to know what kinds of shops are interested in joining, so we can plan the market zones, the number of spaces and how applications will work.\n\n## After you fill it in\n\n- The team uses your answers for planning only\n- When applications actually open, we will announce it on this website and on ChulaFAIR channels\n- People who answered may hear the news first, but will still need to apply through the real process'},
      'ไปที่แบบสำรวจความสนใจ', 'Go to the interest survey', '',
      'system', 'system')
    ON CONFLICT DO NOTHING`;

  await sql`INSERT INTO site_settings (key, value, updated_by)
            VALUES ('_seeded_v1', 'yes', 'system') ON CONFLICT DO NOTHING`;
}
