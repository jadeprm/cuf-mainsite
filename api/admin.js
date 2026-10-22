import { randomBytes } from 'node:crypto';
import { getSql, hasDatabase } from '../lib/db.js';
import { currentEditor, signIn, signOut, sessionCookie } from '../lib/auth.js';
import {
  SETTINGS, SETTING_GROUPS, ACCENTS, PAGE_FIELDS, RESERVED_SLUGS,
  isSettingKey, loadSettings, normaliseSlug,
} from '../lib/content.js';
import { safeUrl } from '../lib/md.js';
import { renderPage } from '../lib/view.js';

/**
 * The editing API behind /admin. JSON in, JSON out.
 *
 *   GET  ?do=me                     who is signed in
 *   POST ?do=login   {username, password}
 *   POST ?do=logout
 *   GET  ?do=list                   all pages and posts, drafts included
 *   GET  ?do=get&id=…               one page plus its revision history
 *   POST ?do=save    {…fields, id?, base?}
 *   POST ?do=delete  {id}
 *   POST ?do=restore {revision}
 *   GET  ?do=settings
 *   POST ?do=settings {values: {key: value}}
 *
 * Everything except me/login requires a CUFTM Admin or Co-Admin.
 */

const KINDS = ['page', 'post'];
const STATUSES = ['draft', 'published'];
const TEMPLATES = ['standard', 'survey'];
const MAX = { body: 100_000, text: 2_000, title: 200 };
const KEEP_REVISIONS = 30;

function json(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else for await (const chunk of req) raw += chunk;
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

/**
 * Cross-site request protection. The session cookie is SameSite=Lax already;
 * on top of that every write must be JSON and, when the browser says where it
 * came from, come from this same host.
 */
function sameOrigin(req) {
  const type = String(req.headers['content-type'] || '');
  if (!type.includes('application/json')) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers['x-forwarded-host'] || new URL(origin).host === req.headers.host;
  } catch { return false; }
}

const str = (v, max) => String(v ?? '').slice(0, max);

/** Turns whatever the form sent into a clean row, or an error code. */
function cleanPage(input) {
  const p = {};
  p.kind = KINDS.includes(input.kind) ? input.kind : 'page';
  p.status = STATUSES.includes(input.status) ? input.status : 'draft';
  p.template = TEMPLATES.includes(input.template) ? input.template : 'standard';
  p.accent = ACCENTS[input.accent] ? input.accent : 'pink';
  p.slug = normaliseSlug(input.slug || input.title_en || input.title_th);
  for (const k of ['title_th', 'title_en']) p[k] = str(input[k], MAX.title).trim();
  for (const k of ['summary_th', 'summary_en', 'notice_th', 'notice_en', 'cta_label_th', 'cta_label_en']) {
    p[k] = str(input[k], MAX.text).trim();
  }
  for (const k of ['body_th', 'body_en']) p[k] = str(input[k], MAX.body);
  for (const k of ['cta_url', 'cover_url']) {
    const raw = str(input[k], 1000).trim();
    if (raw && !safeUrl(raw)) return { error: 'BAD_URL', field: k };
    p[k] = raw;
  }
  p.in_nav = p.kind === 'page' && Boolean(input.in_nav);
  p.nav_order = Number.isFinite(Number(input.nav_order)) ? Math.trunc(Number(input.nav_order)) : 100;

  if (!p.title_th && !p.title_en) return { error: 'TITLE_REQUIRED' };
  if (!p.slug) return { error: 'SLUG_REQUIRED' };
  if (RESERVED_SLUGS.has(p.slug)) return { error: 'SLUG_RESERVED' };
  return { page: p };
}

const snapshotOf = (row) => Object.fromEntries(PAGE_FIELDS.map((k) => [k, row[k]]));

async function saveRevision(sql, row, username) {
  await sql`INSERT INTO site_revisions (page_id, snapshot, saved_by)
            VALUES (${row.id}, ${JSON.stringify(snapshotOf(row))}::jsonb, ${username})`;
  await sql`
    DELETE FROM site_revisions WHERE page_id = ${row.id} AND id NOT IN (
      SELECT id FROM site_revisions WHERE page_id = ${row.id}
      ORDER BY saved_at DESC, id DESC LIMIT ${KEEP_REVISIONS})`;
}

async function writePage(sql, editor, existing, p) {
  const [clash] = await sql`
    SELECT id FROM site_pages WHERE kind = ${p.kind} AND slug = ${p.slug}
      AND id <> ${existing?.id ?? ''}`;
  if (clash) return { error: 'SLUG_TAKEN' };

  if (existing) {
    await saveRevision(sql, existing, editor.username);
    const [row] = await sql`
      UPDATE site_pages SET
        kind = ${p.kind}, slug = ${p.slug}, status = ${p.status}, template = ${p.template},
        title_th = ${p.title_th}, title_en = ${p.title_en},
        summary_th = ${p.summary_th}, summary_en = ${p.summary_en},
        body_th = ${p.body_th}, body_en = ${p.body_en},
        notice_th = ${p.notice_th}, notice_en = ${p.notice_en},
        cta_label_th = ${p.cta_label_th}, cta_label_en = ${p.cta_label_en}, cta_url = ${p.cta_url},
        cover_url = ${p.cover_url}, accent = ${p.accent},
        in_nav = ${p.in_nav}, nav_order = ${p.nav_order},
        published_at = CASE WHEN ${p.status} = 'published' AND published_at IS NULL THEN now() ELSE published_at END,
        updated_by = ${editor.username}, updated_at = now()
      WHERE id = ${existing.id}
      RETURNING *`;
    return { row };
  }

  const id = randomBytes(9).toString('base64url');
  const [row] = await sql`
    INSERT INTO site_pages (
      id, kind, slug, status, template, title_th, title_en, summary_th, summary_en,
      body_th, body_en, notice_th, notice_en, cta_label_th, cta_label_en, cta_url,
      cover_url, accent, in_nav, nav_order, published_at, created_by, updated_by)
    VALUES (
      ${id}, ${p.kind}, ${p.slug}, ${p.status}, ${p.template}, ${p.title_th}, ${p.title_en},
      ${p.summary_th}, ${p.summary_en}, ${p.body_th}, ${p.body_en}, ${p.notice_th}, ${p.notice_en},
      ${p.cta_label_th}, ${p.cta_label_en}, ${p.cta_url}, ${p.cover_url}, ${p.accent},
      ${p.in_nav}, ${p.nav_order}, ${p.status === 'published' ? new Date().toISOString() : null},
      ${editor.username}, ${editor.username})
    RETURNING *`;
  return { row };
}

const nameOf = async (sql, username) => {
  if (!username || username === 'system') return username === 'system' ? 'ระบบ' : null;
  const [u] = await sql`SELECT display_name, nickname, sheet_name FROM users WHERE username = ${username}`;
  return u ? u.display_name || u.nickname || u.sheet_name || username : username;
};

export default async function handler(req, res) {
  if (!hasDatabase) return json(res, 503, { error: 'NO_DATABASE' });
  const sql = await getSql();
  const url = new URL(req.url || '/', 'http://local');
  const action = url.searchParams.get('do') || 'me';
  const isPost = req.method === 'POST';

  if (isPost && !sameOrigin(req)) return json(res, 403, { error: 'BAD_ORIGIN' });

  // Without CUFTM's tables there is nobody who could sign in.
  const [{ ok: hasUsers }] = await sql`SELECT to_regclass('public.users') IS NOT NULL AS ok`;
  if (!hasUsers) return json(res, 503, { error: 'NO_CUFTM_USERS' });

  if (action === 'login' && isPost) {
    const body = await readBody(req);
    const result = await signIn(sql, body.username, String(body.password ?? ''));
    if (result.error) {
      const status = result.error === 'TOO_MANY_ATTEMPTS' ? 429 : result.error === 'NOT_ADMIN' ? 403 : 401;
      return json(res, status, { error: result.error });
    }
    return json(res, 200, { editor: result.editor }, { 'set-cookie': sessionCookie(result.token) });
  }

  if (action === 'logout' && isPost) {
    await signOut(req, sql);
    return json(res, 200, { ok: true }, { 'set-cookie': sessionCookie('', { clear: true }) });
  }

  const editor = await currentEditor(req, sql);
  if (action === 'me') return json(res, 200, { editor });
  if (!editor) return json(res, 401, { error: 'SIGNED_OUT' });

  if (action === 'list' && !isPost) {
    const rows = await sql`
      SELECT p.id, p.kind, p.slug, p.status, p.template, p.title_th, p.title_en, p.accent,
             p.in_nav, p.nav_order, p.updated_at, p.published_at,
             coalesce(nullif(u.display_name, ''), nullif(u.nickname, ''), p.updated_by) AS updated_by_name
      FROM site_pages p LEFT JOIN users u ON u.username = p.updated_by
      ORDER BY p.updated_at DESC`;
    return json(res, 200, { pages: rows });
  }

  if (action === 'get' && !isPost) {
    const id = url.searchParams.get('id') || '';
    const [page] = await sql`SELECT * FROM site_pages WHERE id = ${id}`;
    if (!page) return json(res, 404, { error: 'NOT_FOUND' });
    const revisions = await sql`
      SELECT r.id, r.saved_at, r.snapshot->>'status' AS status,
             coalesce(nullif(u.display_name, ''), nullif(u.nickname, ''), r.saved_by) AS saved_by_name
      FROM site_revisions r LEFT JOIN users u ON u.username = r.saved_by
      WHERE r.page_id = ${id} ORDER BY r.saved_at DESC, r.id DESC`;
    page.updated_by_name = await nameOf(sql, page.updated_by);
    return json(res, 200, { page, revisions });
  }

  if (action === 'save' && isPost) {
    const body = await readBody(req);
    const cleaned = cleanPage(body);
    if (cleaned.error) return json(res, 400, cleaned);

    let existing = null;
    if (body.id) {
      [existing] = await sql`SELECT * FROM site_pages WHERE id = ${String(body.id)}`;
      if (!existing) return json(res, 404, { error: 'NOT_FOUND' });
      // Two admins editing the same page: the second save must not silently
      // erase the first. `base` is the updated_at the editor started from.
      if (body.base && new Date(body.base).getTime() !== new Date(existing.updated_at).getTime()) {
        return json(res, 409, { error: 'CONFLICT', by: await nameOf(sql, existing.updated_by), at: existing.updated_at });
      }
    }
    const result = await writePage(sql, editor, existing, cleaned.page);
    if (result.error) return json(res, 409, result);
    return json(res, 200, { page: result.row });
  }

  // Renders unsaved edits exactly as the public page would look.
  if (action === 'preview' && isPost) {
    const body = await readBody(req);
    const cleaned = cleanPage({ ...body, slug: body.slug || 'preview', title_th: body.title_th || body.title_en || ' ' });
    if (cleaned.error) return json(res, 400, cleaned);
    const settings = await loadSettings(sql);
    const nav = await sql`SELECT kind, slug, title_th, title_en FROM site_pages
      WHERE kind = 'page' AND status = 'published' AND in_nav = true ORDER BY nav_order, title_th`;
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM site_pages WHERE kind = 'post' AND status = 'published'`;
    const html = renderPage({ settings, nav, posts: [], hasPosts: n > 0, preview: null }, { ...cleaned.page, published_at: new Date() });
    return json(res, 200, { html });
  }

  if (action === 'delete' && isPost) {
    const body = await readBody(req);
    const [existing] = await sql`SELECT * FROM site_pages WHERE id = ${String(body.id ?? '')}`;
    if (!existing) return json(res, 404, { error: 'NOT_FOUND' });
    // Kept as a revision, so a mistaken delete can still be recovered by hand.
    await saveRevision(sql, existing, editor.username);
    await sql`DELETE FROM site_pages WHERE id = ${existing.id}`;
    return json(res, 200, { ok: true });
  }

  if (action === 'restore' && isPost) {
    const body = await readBody(req);
    const [rev] = await sql`SELECT * FROM site_revisions WHERE id = ${Number(body.revision) || 0}`;
    if (!rev) return json(res, 404, { error: 'NOT_FOUND' });
    const [existing] = await sql`SELECT * FROM site_pages WHERE id = ${rev.page_id}`;
    if (!existing) return json(res, 404, { error: 'NOT_FOUND' });
    const snap = typeof rev.snapshot === 'string' ? JSON.parse(rev.snapshot) : rev.snapshot;
    const cleaned = cleanPage(snap);
    if (cleaned.error) return json(res, 400, cleaned);
    const result = await writePage(sql, editor, existing, cleaned.page);
    if (result.error) return json(res, 409, result);
    return json(res, 200, { page: result.row });
  }

  if (action === 'settings' && !isPost) {
    const values = await loadSettings(sql);
    return json(res, 200, { definitions: SETTINGS, groups: SETTING_GROUPS, values });
  }

  if (action === 'settings' && isPost) {
    const body = await readBody(req);
    const values = body.values && typeof body.values === 'object' ? body.values : {};
    for (const [key, raw] of Object.entries(values)) {
      if (!isSettingKey(key)) continue;
      const value = str(raw, MAX.body).trim();
      if (key.endsWith('_url') && value && !safeUrl(value)) {
        return json(res, 400, { error: 'BAD_URL', field: key });
      }
      await sql`
        INSERT INTO site_settings (key, value, updated_by, updated_at)
        VALUES (${key}, ${value}, ${editor.username}, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
          updated_by = EXCLUDED.updated_by, updated_at = now()`;
    }
    return json(res, 200, { values: await loadSettings(sql) });
  }

  return json(res, 400, { error: 'UNKNOWN_ACTION' });
}
