// End-to-end tests against a LOCAL Postgres.
//   DATABASE_URL=postgres://user:pass@localhost:5432/db INSECURE_COOKIES=1 node test/run.mjs
// Wipes the site_* tables and the local `users` table first — never point at production.
import http from 'node:http';
import assert from 'node:assert/strict';

if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing: tests need a LOCAL DATABASE_URL.');
  process.exit(1);
}
process.env.INSECURE_COOKIES = '1';

const { getSql, closeSql } = await import('../lib/db.js');
const { hashPassword } = await import('../lib/auth.js');
const { renderMarkdown } = await import('../lib/md.js');
const render = (await import('../api/render.js')).default;
const admin = (await import('../api/admin.js')).default;

// Fresh state
{
  const sql = await getSql();
  await sql`DROP TABLE IF EXISTS site_pages, site_revisions, site_settings, site_sessions, site_login_attempts, users`;
  await closeSql();
}
const sql = await getSql(); // re-creates site_* and re-seeds the draft survey page
await sql`CREATE TABLE users (username TEXT PRIMARY KEY, nickname TEXT NOT NULL DEFAULT '', sheet_name TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '', access TEXT NOT NULL DEFAULT 'editor', avatar TEXT, password_hash TEXT, password_salt TEXT,
  reset_allowed BOOLEAN NOT NULL DEFAULT false, active BOOLEAN NOT NULL DEFAULT true, suspended BOOLEAN NOT NULL DEFAULT false)`;
for (const [u, access, extra] of [
  ['Admin1', 'admin', {}], ['co1', 'coadmin', {}], ['ed1', 'editor', {}], ['inner1', 'inner', {}],
  ['sus1', 'admin', { suspended: true }], ['nopw', 'admin', { nopw: true }],
]) {
  const { hash, salt } = await hashPassword('fair2027pw');
  await sql`INSERT INTO users (username, display_name, access, password_hash, password_salt, suspended)
            VALUES (${u}, ${u + ' name'}, ${access}, ${extra.nopw ? null : hash}, ${extra.nopw ? null : salt}, ${!!extra.suspended})`;
}

// Server that mirrors vercel.json
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let m;
  if (u.pathname === '/') { req.url = '/api/render?home=1'; return render(req, res); }
  if (u.pathname === '/blog') { req.url = '/api/render?blog=1'; return render(req, res); }
  if ((m = u.pathname.match(/^\/blog\/(.+)$/))) { req.url = `/api/render?post=${m[1]}`; return render(req, res); }
  if ((m = u.pathname.match(/^\/p\/(.+)$/))) { req.url = `/api/render?page=${m[1]}`; return render(req, res); }
  if (u.pathname === '/api/admin') return admin(req, res);
  if (u.pathname === '/api/render') return render(req, res);
  res.statusCode = 404; res.end();
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

async function call(path, { body, cookie, origin, type = 'application/json' } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  if (body !== undefined) headers['content-type'] = type;
  const r = await fetch(base + path, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, setCookie: r.headers.get('set-cookie') || '' };
}
const login = async (username, password = 'fair2027pw') => {
  const r = await call('/api/admin?do=login', { body: { username, password } });
  return { ...r, cookie: (r.setCookie.match(/site_session=[a-f0-9]+/) || [])[0] };
};

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

console.log('chulafair.com tests');

await test('homepage renders both languages and the coming-soon message', async () => {
  const r = await call('/');
  assert.equal(r.status, 200);
  assert.match(r.data, /รอรายละเอียด เร็ว ๆ นี้/);
  assert.match(r.data, /Details coming soon/);
  assert.match(r.data, /href="https:\/\/task\.chulafair\.com"/);
  assert.match(r.data, /class="staff-btn"/);
});

await test('seeded survey page exists, is a draft, and 404s for the public', async () => {
  const [p] = await sql`SELECT * FROM site_pages WHERE slug = 'shop-interest'`;
  assert.equal(p.status, 'draft');
  assert.equal(p.template, 'survey');
  assert.match(p.notice_th, /ไม่ใช่ใบสมัคร/);
  const r = await call('/p/shop-interest');
  assert.equal(r.status, 404);
  assert.doesNotMatch(r.data, /แบบสำรวจความสนใจร่วมเปิดร้านค้า/);
});

await test('sign-in: only active CUFTM admins / co-admins get in', async () => {
  assert.equal((await login('ed1')).data.error, 'NOT_ADMIN');
  assert.equal((await login('inner1')).data.error, 'NOT_ADMIN');
  assert.equal((await login('sus1')).data.error, 'BAD_CREDENTIALS');
  assert.equal((await login('nopw')).data.error, 'NO_PASSWORD_YET');
  assert.equal((await login('Admin1', 'wrong-pass1')).data.error, 'BAD_CREDENTIALS');
  const a = await login('admin1'); // case-insensitive, like CUFTM
  assert.equal(a.status, 200); assert.equal(a.data.editor.access, 'admin'); assert.ok(a.cookie);
  const c = await login('co1');
  assert.equal(c.status, 200); assert.equal(c.data.editor.access, 'coadmin');
});

await test('repeated wrong passwords lock the username for a while', async () => {
  for (let i = 0; i < 8; i++) await login('co1', 'nope-' + i);
  assert.equal((await login('co1')).data.error, 'TOO_MANY_ATTEMPTS');
  await sql`DELETE FROM site_login_attempts`;
});

const admin1 = (await login('Admin1')).cookie;
const co1 = (await login('co1')).cookie;

await test('API refuses signed-out users and cross-site writes', async () => {
  assert.equal((await call('/api/admin?do=list')).status, 401);
  assert.equal((await call('/api/admin?do=save', { body: { title_th: 'x' } })).status, 401);
  const evil = await call('/api/admin?do=save', { body: { title_th: 'x' }, cookie: admin1, origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  const form = await call('/api/admin?do=save', { body: { title_th: 'x' }, cookie: admin1, type: 'text/plain' });
  assert.equal(form.status, 403);
});

await test('admin preview of a draft works; demotion in CUFTM revokes access at once', async () => {
  const r = await call('/p/shop-interest', { cookie: admin1 });
  assert.equal(r.status, 200);
  assert.match(r.data, /ไม่ใช่ใบสมัคร/);
  assert.match(r.data, /ลิงก์แบบสำรวจจะเปิดเร็ว ๆ นี้/); // no URL yet → disabled button
  assert.match(r.data, /noindex/);
  await sql`UPDATE users SET access = 'editor' WHERE username = 'co1'`;
  assert.equal((await call('/api/admin?do=list', { cookie: co1 })).status, 401);
  await sql`UPDATE users SET access = 'coadmin' WHERE username = 'co1'`;
  assert.equal((await call('/api/admin?do=list', { cookie: co1 })).status, 200);
});

let postId;
await test('create a draft post, publish it, it appears on home and /blog', async () => {
  const r = await call('/api/admin?do=save', { cookie: co1, body: {
    kind: 'post', title_th: 'เปิดตัวเว็บไซต์', title_en: 'Website launch', summary_th: 'สวัสดี', body_th: '## หัวข้อ\nเนื้อหา **หนา**', status: 'draft',
  } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  postId = r.data.page.id;
  assert.equal(r.data.page.slug, 'website-launch');
  assert.equal((await call('/blog/website-launch')).status, 404);
  assert.doesNotMatch((await call('/')).data, /เปิดตัวเว็บไซต์/);

  const full = (await call(`/api/admin?do=get&id=${postId}`, { cookie: co1 })).data.page;
  const pub = await call('/api/admin?do=save', { cookie: co1, body: { ...full, status: 'published', id: postId, base: full.updated_at } });
  assert.equal(pub.status, 200);
  assert.ok(pub.data.page.published_at);
  const page = await call('/blog/website-launch');
  assert.equal(page.status, 200);
  assert.match(page.data, /<strong>หนา<\/strong>/);
  assert.match((await call('/')).data, /อัปเดตล่าสุด/);
  assert.match((await call('/blog')).data, /Website launch/);
});

await test('stale save is rejected instead of overwriting someone else', async () => {
  const { page } = (await call(`/api/admin?do=get&id=${postId}`, { cookie: admin1 })).data;
  await call('/api/admin?do=save', { cookie: co1, body: { ...page, id: postId, base: page.updated_at, title_th: 'แก้โดย co1' } });
  const stale = await call('/api/admin?do=save', { cookie: admin1, body: { ...page, id: postId, base: page.updated_at, title_th: 'แก้โดย admin' } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error, 'CONFLICT');
});

await test('every save keeps a revision, and restoring brings old text back', async () => {
  const got = (await call(`/api/admin?do=get&id=${postId}`, { cookie: admin1 })).data;
  assert.ok(got.revisions.length >= 2);
  const oldest = got.revisions[got.revisions.length - 1];
  const r = await call('/api/admin?do=restore', { cookie: admin1, body: { revision: oldest.id } });
  assert.equal(r.status, 200);
  assert.equal(r.data.page.title_th, 'เปิดตัวเว็บไซต์');
});

await test('slug rules: unique per kind, reserved words blocked, bad URLs blocked', async () => {
  const dup = await call('/api/admin?do=save', { cookie: admin1, body: { kind: 'post', slug: 'website-launch', title_th: 'ซ้ำ' } });
  assert.equal(dup.data.error, 'SLUG_TAKEN');
  const samePage = await call('/api/admin?do=save', { cookie: admin1, body: { kind: 'page', slug: 'website-launch', title_th: 'หน้าเดียวกัน' } });
  assert.equal(samePage.status, 200); // a page and a post may share a slug: /p/… vs /blog/…
  assert.equal((await call('/api/admin?do=save', { cookie: admin1, body: { slug: 'admin', title_th: 'x' } })).data.error, 'SLUG_RESERVED');
  assert.equal((await call('/api/admin?do=save', { cookie: admin1, body: { slug: 'x1', title_th: 'x', cta_url: 'javascript:alert(1)' } })).data.error, 'BAD_URL');
});

await test('survey page: add the form link, publish, page shows the not-an-application notice', async () => {
  const [p] = await sql`SELECT * FROM site_pages WHERE slug = 'shop-interest'`;
  const r = await call('/api/admin?do=save', { cookie: admin1, body: { ...p, id: p.id, base: p.updated_at, cta_url: 'https://forms.gle/example', status: 'published' } });
  assert.equal(r.status, 200);
  const page = await call('/p/shop-interest');
  assert.equal(page.status, 200);
  assert.match(page.data, /Not an application form/);
  assert.match(page.data, /href="https:\/\/forms\.gle\/example"/);
  assert.doesNotMatch(page.data, /noindex/);
});

await test('nav: published pages flagged in_nav show in the header', async () => {
  const r = await call('/api/admin?do=save', { cookie: admin1, body: { kind: 'page', slug: 'faq', title_th: 'คำถามที่พบบ่อย', title_en: 'FAQ', in_nav: true, status: 'published' } });
  assert.equal(r.status, 200);
  assert.match((await call('/')).data, /<a href="\/p\/faq">/);
});

await test('settings: edit homepage text, empty hides a line, junk keys ignored', async () => {
  const r = await call('/api/admin?do=settings', { cookie: admin1, body: { values: { soon_title_th: 'อีกไม่นานเกินรอ', date_line_th: '', date_line_en: '', not_a_key: 'x' } } });
  assert.equal(r.status, 200);
  const home = (await call('/')).data;
  assert.match(home, /อีกไม่นานเกินรอ/);
  assert.doesNotMatch(home, /hero-date/);
  const [junk] = await sql`SELECT 1 FROM site_settings WHERE key = 'not_a_key'`;
  assert.equal(junk, undefined);
  assert.equal((await call('/api/admin?do=settings', { cookie: admin1, body: { values: { instagram_url: 'not a url' } } })).data.error, 'BAD_URL');
});

await test('preview endpoint renders unsaved content', async () => {
  const r = await call('/api/admin?do=preview', { cookie: admin1, body: { title_th: 'ทดลอง', body_th: 'สวัสดี *ชาวโลก*' } });
  assert.equal(r.status, 200);
  assert.match(r.data.html, /<em>ชาวโลก<\/em>/);
});

await test('markdown never lets raw HTML or script links through', async () => {
  const html = renderMarkdown('<script>alert(1)</script>\n[x](javascript:alert(1))\n![a](https://ok.example/i.png)\n[[ปุ่ม: ไป | https://ok.example]]');
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /<img src="https:\/\/ok\.example\/i\.png"/);
  assert.match(html, /class="btn btn-primary" href="https:\/\/ok\.example"/);
  const r = await call('/api/admin?do=save', { cookie: admin1, body: { kind: 'page', slug: 'xss', title_th: '<img src=x onerror=alert(1)>', status: 'published' } });
  assert.equal(r.status, 200);
  const page = (await call('/p/xss')).data;
  assert.doesNotMatch(page, /<img src=x onerror/);
});

await test('delete removes the page but keeps a revision', async () => {
  const r = await call('/api/admin?do=delete', { cookie: admin1, body: { id: postId } });
  assert.equal(r.status, 200);
  assert.equal((await call('/blog/website-launch')).status, 404);
  const [rev] = await sql`SELECT 1 FROM site_revisions WHERE page_id = ${postId} LIMIT 1`;
  assert.ok(rev);
});

await test('sitemap lists published pages only', async () => {
  const r = await call('/api/render?sitemap=1');
  assert.match(r.data, /\/p\/shop-interest/);
  assert.match(r.data, /\/p\/faq/);
  await sql`UPDATE site_pages SET status = 'draft' WHERE slug = 'faq'`;
  assert.doesNotMatch((await call('/api/render?sitemap=1')).data, /\/p\/faq/);
});

await test('logout ends the session', async () => {
  const s = await login('co1');
  await call('/api/admin?do=logout', { cookie: s.cookie, body: {} });
  assert.equal((await call('/api/admin?do=list', { cookie: s.cookie })).status, 401);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
server.close();
await closeSql();
