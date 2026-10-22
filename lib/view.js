import { escapeHtml as e, renderMarkdown, safeUrl } from './md.js';
import { ACCENTS, pagePath } from './content.js';

/**
 * HTML for every public page.
 *
 * Both languages are always in the page. `t(th, en)` writes two spans and the
 * stylesheet shows the one matching <html data-lang>, so switching language is
 * instant, works without a reload, and search engines index both. An empty
 * English field falls back to the Thai text rather than leaving a hole.
 */
export function t(th, en, { md = false } = {}) {
  const thText = th ?? '';
  const enText = en && String(en).trim() ? en : thText;
  if (md) {
    return `<div class="th" lang="th">${renderMarkdown(thText)}</div><div class="en" lang="en">${renderMarkdown(enText)}</div>`;
  }
  if (thText === enText) return e(thText);
  return `<span class="th" lang="th">${e(thText)}</span><span class="en" lang="en">${e(enText)}</span>`;
}

const ASSET_V = '1';
const SITE = 'https://chulafair.com';

/** Deterministic stars so the sky looks the same on every load (no flicker). */
function stars(count, seed, maxTop = 58) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = (rnd() * 100).toFixed(2);
    const y = (rnd() * maxTop).toFixed(2);
    const size = (rnd() * 2.2 + 0.8).toFixed(1);
    const delay = (rnd() * 6).toFixed(2);
    const big = rnd() > 0.93 ? ' big' : '';
    out += `<i class="star${big}" style="left:${x}%;top:${y}%;--s:${size}px;--d:${delay}s"></i>`;
  }
  return `<div class="stars" aria-hidden="true">${out}</div>`;
}

const clouds = () => `
<div class="clouds" aria-hidden="true">
  <svg class="cloud c1" viewBox="0 0 600 200" preserveAspectRatio="none"><path d="M0 200 C40 120 110 110 150 140 C170 70 270 50 310 110 C350 60 450 60 470 130 C520 110 580 140 600 200Z"/></svg>
  <svg class="cloud c2" viewBox="0 0 600 200" preserveAspectRatio="none"><path d="M0 200 C60 140 120 130 170 150 C200 90 300 80 330 130 C380 90 470 100 490 150 C540 140 590 160 600 200Z"/></svg>
  <svg class="cloud c3" viewBox="0 0 600 200" preserveAspectRatio="none"><path d="M0 200 C50 150 130 120 180 160 C220 110 320 110 340 160 C400 120 500 130 520 170 C560 160 590 180 600 200Z"/></svg>
</div>`;

function staffButton(settings) {
  const url = safeUrl(settings.staff_url) || 'https://task.chulafair.com';
  return `<a class="staff-btn" href="${e(url)}" rel="noopener" title="CUFTM — ระบบงานสตาฟ / Staff workspace">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z"/></svg>
    <span>${t('สตาฟ', 'Staff')}</span></a>`;
}

function header(ctx) {
  const nav = ctx.nav
    .map((p) => `<a href="${pagePath(p)}">${t(p.title_th, p.title_en)}</a>`)
    .join('');
  const blog = ctx.hasPosts ? `<a href="/blog">${t('อัปเดต', 'Updates')}</a>` : '';
  return `
<header class="site-header">
  <a class="brand" href="/" aria-label="จุฬาฯแฟร์ — หน้าแรก / ChulaFAIR home">
    <span class="brand-mark" aria-hidden="true"><i></i></span>
    <span class="brand-word">${t('จุฬาฯแฟร์', 'ChulaFAIR')}</span>
  </a>
  <nav class="site-nav" aria-label="${e('เมนู')}">${nav}${blog}</nav>
  <div class="header-tools">
    <div class="lang-toggle" role="group" aria-label="ภาษา / Language">
      <button type="button" data-set-lang="th" aria-pressed="true">TH</button>
      <button type="button" data-set-lang="en" aria-pressed="false">EN</button>
    </div>
    ${staffButton(ctx.settings)}
  </div>
</header>`;
}

function footer(ctx) {
  const s = ctx.settings;
  const socials = [
    ['instagram_url', 'Instagram'], ['facebook_url', 'Facebook'],
    ['tiktok_url', 'TikTok'], ['line_url', 'LINE'],
  ]
    .filter(([k]) => safeUrl(s[k]))
    .map(([k, label]) => `<a href="${e(safeUrl(s[k]))}" target="_blank" rel="noopener">${label}</a>`)
    .join('');
  const email = s.contact_email && /^[^@\s]+@[^@\s]+$/.test(s.contact_email)
    ? `<a href="mailto:${e(s.contact_email)}">${e(s.contact_email)}</a>` : '';
  return `
<footer class="site-footer">
  ${stars(40, 7, 90)}
  <div class="footer-inner">
    <div class="footer-brand">
      <p class="footer-title">${t('จุฬาฯแฟร์ 2027', 'ChulaFAIR 2027')}</p>
      <p class="footer-tag">D(R)AWN to the Zenith</p>
    </div>
    <div class="footer-links">
      ${email ? `<p><span class="muted">${t('ติดต่อ', 'Contact')}</span> ${email}</p>` : ''}
      ${socials ? `<p class="socials">${socials}</p>` : ''}
    </div>
  </div>
  <div class="footer-base">
    <span>© ${t('จุฬาฯแฟร์ · จุฬาลงกรณ์มหาวิทยาลัย', 'ChulaFAIR · Chulalongkorn University')}</span>
    <a class="admin-link" href="/admin">${t('สำหรับผู้ดูแลเว็บไซต์', 'Site admin')}</a>
  </div>
</footer>`;
}

/** Runs before first paint so the page never flashes the wrong language. */
const LANG_BOOT = `<script>(function(){try{var q=new URLSearchParams(location.search).get('lang');var l=q||localStorage.getItem('cf_lang')||'th';if(l!=='th'&&l!=='en')l='th';document.documentElement.setAttribute('data-lang',l);document.documentElement.lang=l;}catch(_){}})();</script>`;

function layout(ctx, { title, description, body, path = '/', accent = 'pink', noindex = false, image }) {
  const a = ACCENTS[accent] || ACCENTS.pink;
  const fullTitle = title ? `${title} · จุฬาฯแฟร์ ChulaFAIR 2027` : 'จุฬาฯแฟร์ ChulaFAIR 2027 — D(R)AWN to the Zenith';
  const desc = description || 'จุฬาฯแฟร์ 2027 — รอรายละเอียดเร็ว ๆ นี้ · ChulaFAIR 2027 — details coming soon.';
  const og = image && safeUrl(image) ? safeUrl(image) : `${SITE}/og.png`;
  return `<!doctype html>
<html lang="th" data-lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${e(fullTitle)}</title>
<meta name="description" content="${e(desc)}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : `<link rel="canonical" href="${SITE}${e(path)}">`}
<meta property="og:type" content="website">
<meta property="og:site_name" content="จุฬาฯแฟร์ ChulaFAIR">
<meta property="og:title" content="${e(fullTitle)}">
<meta property="og:description" content="${e(desc)}">
<meta property="og:image" content="${e(og.startsWith('/') ? SITE + og : og)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#2D135F">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anuphan:wght@300;400;500;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=Jost:wght@400;500;600&family=MuseoModerno:wght@500;600;700;800&display=swap">
<link rel="stylesheet" href="/assets/site.css?v=${ASSET_V}">
${LANG_BOOT}
</head>
<body style="--accent:${a.a};--accent-2:${a.b}">
<a class="skip" href="#main">${t('ข้ามไปเนื้อหา', 'Skip to content')}</a>
${header(ctx)}
${ctx.preview ? `<div class="preview-bar" role="status">${t('ฉบับร่าง — หน้านี้ยังไม่เผยแพร่ เห็นได้เฉพาะผู้ดูแลเว็บไซต์', 'Draft — not published. Only site admins can see this page.')} <a href="/admin#/edit/${e(ctx.preview)}">${t('แก้ไข', 'Edit')}</a></div>` : ''}
<main id="main">
${body}
</main>
${footer(ctx)}
<script src="/assets/site.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

const FAIR = [
  ['F', 'Flourished', 'Academically', 'ความรู้ส่งเสริมการประยุกต์', 'Knowledge that grows into practice'],
  ['A', 'Awakened', 'by Culture', 'รากฐานการตื่นรู้', 'Culture as the root of awakening'],
  ['I', 'Ignited', 'with Innovations', 'จุดประกายการสร้างสรรค์', 'Innovation that sparks creation'],
  ['R', 'Reveal', 'the hidden Arts', 'เผยความลึกล้ำของมนุษย์', 'Art that reveals human depth'],
];

const TEASERS = [
  ['exhibit', 'นิทรรศการผลงานนิสิต', 'Student exhibitions', 'ผลงานจากทุกคณะ ผ่านแสง สี และพื้นที่ทั่วจุฬาฯ', 'Work from every faculty, told through light and space across campus'],
  ['talk', 'เวทีเสวนา', 'Dialogues', 'บทสนทนาในประเด็นที่น่าสนใจ ในพื้นที่ที่ใกล้ชิดกว่าเดิม', 'Conversations on ideas that matter, up close'],
  ['music', 'คอนเสิร์ต', 'Concerts', 'ศิลปินจากนิสิตและศิลปินรับเชิญ ใต้ฟ้าเดียวกัน', 'Student and guest artists, under the same sky'],
  ['shop', 'ร้านค้า', 'Shops & market', 'ร้านค้ามากมายให้เดินเล่นได้ไม่มีเบื่อ', 'A market worth wandering, end to end'],
];

const icon = {
  exhibit: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>',
  talk: '<path d="M4 6h11v8H9l-4 3v-3H4z"/><path d="M15 10h5v7h-1v3l-3-3h-4v-2"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  shop: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v2a3 3 0 0 1-6 0 3 3 0 0 1-4 0 3 3 0 0 1-6 0z"/><path d="M5 13v7h14v-7"/>',
};

export function renderHome(ctx) {
  const s = ctx.settings;
  const dateLine = (s.date_line_th || s.date_line_en)
    ? `<p class="hero-date">${t(s.date_line_th, s.date_line_en)}</p>` : '';

  const posts = ctx.posts.length ? `
<section class="section updates" aria-labelledby="updates-h">
  <div class="wrap">
    <div class="section-head">
      <h2 id="updates-h">${t('อัปเดตล่าสุด', 'Latest updates')}</h2>
      <a class="more" href="/blog">${t('ดูทั้งหมด', 'See all')} →</a>
    </div>
    <div class="post-grid">${ctx.posts.slice(0, 3).map(postCard).join('')}</div>
  </div>
</section>` : '';

  const body = `
<section class="hero" aria-labelledby="hero-title">
  <div class="sky"></div>
  ${stars(90, 42)}
  <div class="zenith" aria-hidden="true"></div>
  <div class="sun" aria-hidden="true"></div>
  <div class="horizon" aria-hidden="true"><span></span></div>
  ${clouds()}
  <div class="hero-content">
    <p class="kicker">Chula Fair 2027</p>
    <h1 id="hero-title" class="hero-title">${t('จุฬาฯแฟร์', 'ChulaFAIR')}</h1>
    <p class="hero-tagline">${e(s.hero_tagline)}</p>
    <p class="hero-sub">${t(s.hero_sub_th, s.hero_sub_en)}</p>
    <a class="soon-pill" href="#soon"><span class="pulse" aria-hidden="true"></span>${t('รอรายละเอียด เร็ว ๆ นี้', 'Details coming soon')}</a>
    ${dateLine}
  </div>
  <a class="scroll-cue" href="#soon" aria-label="${e('เลื่อนลง / Scroll down')}"><span></span></a>
</section>

<section id="soon" class="section soon" aria-labelledby="soon-h">
  <div class="wrap">
    <div class="soon-card">
      <p class="eyebrow">${t('ประกาศ', 'Announcement')}</p>
      <h2 id="soon-h" class="soon-title">${t(s.soon_title_th, s.soon_title_en)}</h2>
      <p class="soon-body">${t(s.soon_body_th, s.soon_body_en)}</p>
    </div>
    <ul class="teasers">
      ${TEASERS.map(([k, th, en, dth, den]) => `
      <li class="teaser">
        <span class="teaser-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icon[k]}</svg></span>
        <h3>${t(th, en)}</h3>
        <p>${t(dth, den)}</p>
        <span class="stamp">${t('เร็ว ๆ นี้', 'Soon')}</span>
      </li>`).join('')}
    </ul>
  </div>
</section>

<section class="section about" aria-labelledby="about-h">
  <div class="wrap about-grid">
    <div>
      <p class="eyebrow">${t('เกี่ยวกับงาน', 'About')}</p>
      <h2 id="about-h">${t('จุฬาฯแฟร์ คืออะไร', 'What is ChulaFAIR?')}</h2>
      <div class="prose">${t(s.about_th, s.about_en, { md: true })}</div>
    </div>
    <ol class="fair" aria-label="FAIR concept">
      ${FAIR.map(([l, w1, w2, th, en]) => `
      <li><span class="orb" aria-hidden="true">${l}</span>
        <div><p class="fair-name"><strong>${w1}</strong> ${w2}</p><p class="fair-desc">${t(th, en)}</p></div></li>`).join('')}
    </ol>
  </div>
</section>

<section class="story" aria-label="Storyline">
  ${stars(50, 99, 100)}
  <div class="wrap">
    <blockquote class="story-quote">${t(s.story_th, s.story_en)}</blockquote>
    <p class="story-sign">Beneath the Sky, Beyond the Sphere.</p>
  </div>
</section>
${posts}`;

  return layout(ctx, { body, path: '/', accent: 'pink' });
}

// ---------------------------------------------------------------------------
// Pages, posts, blog
// ---------------------------------------------------------------------------

const dateFmt = (d, lang) => {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok',
    });
  } catch { return ''; }
};

function postCard(p) {
  const cover = safeUrl(p.cover_url);
  const a = ACCENTS[p.accent] || ACCENTS.pink;
  return `
<a class="post-card" href="${pagePath(p)}" style="--accent:${a.a};--accent-2:${a.b}">
  <span class="post-cover"${cover ? ` style="background-image:url('${e(cover)}')"` : ''}>${cover ? '' : '<i></i>'}</span>
  <span class="post-meta">${t(dateFmt(p.published_at || p.updated_at, 'th'), dateFmt(p.published_at || p.updated_at, 'en'))}</span>
  <span class="post-title">${t(p.title_th, p.title_en)}</span>
  ${p.summary_th || p.summary_en ? `<span class="post-summary">${t(p.summary_th, p.summary_en)}</span>` : ''}
</a>`;
}

function pageBand(p, eyebrow) {
  return `
<section class="band">
  <div class="sky"></div>
  ${stars(45, (p.slug || 'x').length * 13 + 5, 70)}
  <div class="horizon" aria-hidden="true"><span></span></div>
  <div class="wrap band-content">
    ${eyebrow ? `<p class="eyebrow light">${eyebrow}</p>` : ''}
    <h1>${t(p.title_th, p.title_en)}</h1>
    ${p.summary_th || p.summary_en ? `<p class="band-sub">${t(p.summary_th, p.summary_en)}</p>` : ''}
  </div>
</section>`;
}

function cta(p) {
  const url = safeUrl(p.cta_url);
  const label = t(p.cta_label_th || 'ไปต่อ', p.cta_label_en || 'Continue');
  if (url) {
    const ext = /^https?:/i.test(url);
    return `<p class="page-cta"><a class="btn btn-primary btn-lg" href="${e(url)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${label} <span aria-hidden="true">↗</span></a></p>`;
  }
  if (p.template === 'survey') {
    return `<p class="page-cta"><span class="btn btn-lg btn-disabled" aria-disabled="true">${t('ลิงก์แบบสำรวจจะเปิดเร็ว ๆ นี้', 'Survey link opens soon')}</span></p>`;
  }
  return '';
}

export function renderPage(ctx, p) {
  const notice = p.notice_th || p.notice_en ? `
<aside class="notice ${p.template === 'survey' ? 'notice-strong' : ''}" role="note">
  <span class="notice-icon" aria-hidden="true">!</span>
  <div>${p.template === 'survey' ? `<p class="notice-head">${t('ไม่ใช่ใบสมัคร', 'Not an application form')}</p>` : ''}<p>${t(p.notice_th, p.notice_en)}</p></div>
</aside>` : '';

  const cover = safeUrl(p.cover_url);
  const isPost = p.kind === 'post';
  const meta = isPost
    ? `<p class="post-date">${t(dateFmt(p.published_at || p.updated_at, 'th'), dateFmt(p.published_at || p.updated_at, 'en'))}</p>` : '';

  const body = `
${pageBand(p, isPost ? t('อัปเดต', 'Update') : '')}
<article class="section page-body">
  <div class="wrap narrow">
    ${meta}
    ${notice}
    ${p.template === 'survey' ? cta(p) : ''}
    ${cover ? `<img class="page-cover" src="${e(cover)}" alt="">` : ''}
    <div class="prose">${t(p.body_th, p.body_en, { md: true })}</div>
    ${p.template === 'survey' ? `${cta(p)}<p class="fine">${t('รายละเอียดการรับสมัครจริงจะประกาศบนเว็บไซต์นี้เร็ว ๆ นี้', 'How to actually apply will be announced on this website soon.')}</p>` : cta(p)}
    ${isPost ? `<p class="back"><a href="/blog">← ${t('อัปเดตทั้งหมด', 'All updates')}</a></p>` : ''}
  </div>
</article>`;

  return layout(ctx, {
    title: p.title_th || p.title_en,
    description: p.summary_th || p.summary_en,
    body,
    path: `${pagePath(p)}`,
    accent: p.accent,
    noindex: p.status !== 'published',
    image: p.cover_url,
  });
}

export function renderBlog(ctx, posts) {
  const list = posts.length
    ? `<div class="post-grid">${posts.map(postCard).join('')}</div>`
    : `<div class="empty"><p class="soon-title small">${t('อัปเดตแรกกำลังจะมา', 'The first update is on its way')}</p><p>${t('รอรายละเอียดเร็ว ๆ นี้', 'Details coming soon')}</p></div>`;
  const body = `
${pageBand({ slug: 'blog', title_th: 'อัปเดต', title_en: 'Updates', summary_th: 'ข่าวสารและเรื่องราวจากทีมจุฬาฯแฟร์', summary_en: 'News and stories from the ChulaFAIR team' })}
<section class="section"><div class="wrap">${list}</div></section>`;
  return layout(ctx, { title: 'อัปเดต / Updates', body, path: '/blog' });
}

export function renderNotFound(ctx) {
  const body = `
${pageBand({ slug: '404', title_th: 'ไม่พบหน้านี้', title_en: 'Page not found', summary_th: 'หน้านี้อาจยังไม่เผยแพร่ หรือถูกย้ายไปแล้ว', summary_en: 'It may not be published yet, or it has moved.' })}
<section class="section"><div class="wrap narrow"><p class="page-cta"><a class="btn btn-primary" href="/">${t('กลับหน้าแรก', 'Back to home')}</a></p></div></section>`;
  return layout(ctx, { title: '404', body, path: '/404', noindex: true });
}
