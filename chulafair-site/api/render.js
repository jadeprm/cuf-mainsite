import { getSql, hasDatabase } from '../lib/db.js';
import { loadSettings } from '../lib/content.js';
import { currentEditor } from '../lib/auth.js';
import { renderHome, renderPage, renderBlog, renderNotFound } from '../lib/view.js';

/**
 * Every public page of chulafair.com is rendered here (see vercel.json):
 *
 *   /             → ?home=1
 *   /p/:slug      → ?page=:slug     (pages made in /admin)
 *   /blog         → ?blog=1
 *   /blog/:slug   → ?post=:slug
 *
 * Drafts answer 404 to the public. A signed-in admin sees them, with a
 * "draft" bar, and those responses are never cached.
 *
 * Public responses are cached at Vercel's edge for a minute, so an edit made
 * in /admin shows up for visitors within about a minute.
 */

const PUBLIC_CACHE = 'public, s-maxage=60, stale-while-revalidate=600';

function send(res, status, html, cache) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', cache);
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.end(html);
}

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://local');
  const q = url.searchParams;

  let sql = null;
  try {
    if (hasDatabase) sql = await getSql();
  } catch (error) {
    // The homepage must survive a database hiccup: it renders from defaults.
    console.error('[render] database unavailable', error);
    sql = null;
  }

  const settings = await loadSettings(sql).catch(() => loadSettings(null));
  const nav = sql
    ? await sql`SELECT kind, slug, title_th, title_en FROM site_pages
                WHERE kind = 'page' AND status = 'published' AND in_nav = true
                ORDER BY nav_order, title_th`.catch(() => [])
    : [];
  const posts = sql
    ? await sql`SELECT kind, slug, title_th, title_en, summary_th, summary_en, cover_url, accent,
                       published_at, updated_at
                FROM site_pages WHERE kind = 'post' AND status = 'published'
                ORDER BY coalesce(published_at, updated_at) DESC LIMIT 60`.catch(() => [])
    : [];
  const ctx = { settings, nav, posts, hasPosts: posts.length > 0, preview: null };

  try {
    if (q.has('sitemap')) {
      const pages = sql
        ? await sql`SELECT kind, slug, updated_at FROM site_pages WHERE status = 'published' ORDER BY updated_at DESC`
        : [];
      const urls = [{ loc: '/' }, ...(posts.length ? [{ loc: '/blog' }] : []),
        ...pages.map((p) => ({ loc: (p.kind === 'post' ? '/blog/' : '/p/') + encodeURIComponent(p.slug), mod: p.updated_at }))];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map((u) => `  <url><loc>https://chulafair.com${u.loc}</loc>${u.mod ? `<lastmod>${new Date(u.mod).toISOString()}</lastmod>` : ''}</url>`)
        .join('\n')}\n</urlset>\n`;
      res.statusCode = 200;
      res.setHeader('content-type', 'application/xml; charset=utf-8');
      res.setHeader('cache-control', PUBLIC_CACHE);
      return res.end(xml);
    }

    if (q.has('blog')) return send(res, 200, renderBlog(ctx, posts), PUBLIC_CACHE);

    const slug = q.get('page') ?? q.get('post');
    if (slug != null) {
      const kind = q.has('post') ? 'post' : 'page';
      const [p] = sql
        ? await sql`SELECT * FROM site_pages WHERE kind = ${kind} AND slug = ${decodeURIComponent(slug).toLowerCase()}`
        : [];
      if (p && p.status === 'published') return send(res, 200, renderPage(ctx, p), PUBLIC_CACHE);
      if (p && sql && (await currentEditor(req, sql))) {
        ctx.preview = p.id;
        return send(res, 200, renderPage(ctx, p), 'private, no-store');
      }
      return send(res, 404, renderNotFound(ctx), 'public, s-maxage=30');
    }

    return send(res, 200, renderHome(ctx), PUBLIC_CACHE);
  } catch (error) {
    console.error('[render]', error);
    return send(res, 500, renderNotFound(ctx), 'no-store');
  }
}
