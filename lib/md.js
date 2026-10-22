/**
 * A small, safe Markdown renderer for page and blog bodies.
 *
 * Editors are trusted committee members, but the output is still public, so
 * raw HTML is never passed through: everything is escaped first and only the
 * constructs below are turned back into markup.
 *
 *   ## Heading / ### Smaller heading
 *   **bold**  *italic*  [link text](https://…)  ![image description](https://…)
 *   - bullet list   1. numbered list   > quote   ---  (divider)
 *   [[button: Label | https://…]]   — a big call-to-action button
 */

export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** http(s), mailto, tel, or a path on this site. Anything else is dropped. */
export function safeUrl(raw) {
  const url = String(raw ?? '').trim().replace(/&amp;/g, '&');
  if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return url;
  if (/^\/(?!\/)/.test(url)) return url;
  if (/^#[\w-]*$/.test(url)) return url;
  return '';
}

function inline(text) {
  let out = text; // already escaped
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
    const u = safeUrl(url);
    return u ? `<img src="${escapeHtml(u)}" alt="${alt}" loading="lazy">` : '';
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const u = safeUrl(url);
    if (!u) return label;
    const external = /^https?:/i.test(u);
    return `<a href="${escapeHtml(u)}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return out;
}

export function renderMarkdown(source) {
  const lines = escapeHtml(String(source ?? '').replace(/\r\n?/g, '\n')).split('\n');
  const html = [];
  let para = [];
  let list = null; // { tag, items }
  let quote = [];

  const flushPara = () => {
    if (para.length) html.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) html.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`);
    quote = [];
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    let m;
    if (!line.trim()) { flushAll(); continue; }

    if ((m = line.match(/^\[\[\s*(?:button|ปุ่ม)\s*:\s*(.+?)\s*\|\s*(\S+?)\s*\]\]$/i))) {
      flushAll();
      const u = safeUrl(m[2]);
      if (u) {
        const external = /^https?:/i.test(u);
        html.push(`<p class="md-cta"><a class="btn btn-primary" href="${escapeHtml(u)}"${external ? ' target="_blank" rel="noopener"' : ''}>${inline(m[1])}</a></p>`);
      }
      continue;
    }
    if ((m = line.match(/^(#{2,4})\s+(.*)$/))) {
      flushAll();
      const level = m[1].length;
      html.push(`<h${level}>${inline(m[2])}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushAll(); html.push('<hr>'); continue; }
    if ((m = line.match(/^&gt;\s?(.*)$/))) { flushPara(); flushList(); quote.push(m[1]); continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      flushPara(); flushQuote();
      if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara(); flushQuote();
      if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    flushList(); flushQuote();
    para.push(line.trim());
  }
  flushAll();
  return html.join('\n');
}
