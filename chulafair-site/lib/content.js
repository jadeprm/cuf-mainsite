/**
 * Everything the public site says that an admin can change without touching
 * code. Each key here has a default; a row in `site_settings` overrides it —
 * including an empty value, which is how an admin hides a line on purpose.
 *
 * `group` and `label` drive the Settings screen in /admin, so adding a setting
 * here is all it takes to make it editable.
 */
export const SETTINGS = [
  // — Hero —
  { key: 'hero_tagline', group: 'hero', label: 'สโลแกน (ทั้งสองภาษา)', default: 'D(R)AWN to the Zenith' },
  { key: 'hero_sub_th', group: 'hero', label: 'ข้อความใต้สโลแกน (ไทย)', default: 'ใต้ฟ้าเดียวกัน แต่ความฝันนั้น… เหนือขอบฟ้า' },
  { key: 'hero_sub_en', group: 'hero', label: 'ข้อความใต้สโลแกน (EN)', default: 'Beneath the Sky, Beyond the Sphere.' },
  { key: 'date_line_th', group: 'hero', label: 'บรรทัดวันที่/สถานที่ (ไทย) — เว้นว่างเพื่อซ่อน', default: 'กุมภาพันธ์ 2570 · จุฬาลงกรณ์มหาวิทยาลัย' },
  { key: 'date_line_en', group: 'hero', label: 'บรรทัดวันที่/สถานที่ (EN)', default: 'February 2027 · Chulalongkorn University' },

  // — Coming soon —
  { key: 'soon_title_th', group: 'soon', label: 'หัวข้อ "เร็ว ๆ นี้" (ไทย)', default: 'รอรายละเอียด เร็ว ๆ นี้' },
  { key: 'soon_title_en', group: 'soon', label: 'หัวข้อ "เร็ว ๆ นี้" (EN)', default: 'Full details, coming soon' },
  { key: 'soon_body_th', group: 'soon', label: 'คำอธิบาย (ไทย)', default: 'วันงาน นิทรรศการ เวทีเสวนา คอนเสิร์ต และร้านค้า กำลังจะประกาศที่นี่เป็นที่แรก ติดตามไว้ แล้วเส้นขอบฟ้าจะพาเราไปสักที่' },
  { key: 'soon_body_en', group: 'soon', label: 'คำอธิบาย (EN)', default: 'Dates, exhibitions, talks, concerts and shops will be announced here first. Stay close — the horizon is about to be drawn.' },

  // — About —
  { key: 'about_th', group: 'about', label: 'เกี่ยวกับงาน (ไทย)', multiline: true, default: 'จุฬาฯแฟร์ คือพื้นที่แห่งแรงบันดาลใจ ที่เปิดให้ชาวจุฬาฯ ได้แสดงความสามารถและตัวตนผ่านวิชาการ ศิลปะ วัฒนธรรม และนวัตกรรม และชวนทุกคน รวมถึงบุคคลภายนอก มารู้จักจุฬาฯ ในมุมใหม่ ภายใต้แนวคิด FAIR for All — รายได้จากงานนำไปเป็นทุนการศึกษาสำหรับนิสิตจุฬาฯ เพื่อส่งต่อไฟแห่งแรงบันดาลใจต่อไป' },
  { key: 'about_en', group: 'about', label: 'เกี่ยวกับงาน (EN)', multiline: true, default: 'ChulaFAIR is a space for inspiration — where the Chulalongkorn community shows who they are through academia, art, culture and innovation, and where everyone, from inside the university or out, can meet Chula from a new angle. Under the idea of FAIR for All, the fair’s income becomes scholarships for Chula students, passing the spark forward.' },
  { key: 'story_th', group: 'about', label: 'Storyline (ไทย)', multiline: true, default: 'ถ้าเรารักอะไรสักอย่าง…\nมันจะพาเราไปสักที่' },
  { key: 'story_en', group: 'about', label: 'Storyline (EN)', multiline: true, default: 'If we love something enough…\nit will take us somewhere.' },

  // — Contact & links —
  { key: 'contact_email', group: 'contact', label: 'อีเมลติดต่อ — เว้นว่างเพื่อซ่อน', default: 'pd@chulafair.com' },
  { key: 'instagram_url', group: 'contact', label: 'Instagram URL', default: '' },
  { key: 'facebook_url', group: 'contact', label: 'Facebook URL', default: '' },
  { key: 'tiktok_url', group: 'contact', label: 'TikTok URL', default: '' },
  { key: 'line_url', group: 'contact', label: 'LINE Official URL', default: '' },
  { key: 'staff_url', group: 'contact', label: 'ลิงก์ปุ่ม Staff (มุมขวาบน)', default: 'https://task.chulafair.com' },
];

export const SETTING_GROUPS = {
  hero: 'หน้าแรก — ส่วนหัว',
  soon: 'หน้าแรก — "รอรายละเอียดเร็ว ๆ นี้"',
  about: 'หน้าแรก — เกี่ยวกับงาน',
  contact: 'ติดต่อ & ลิงก์',
};

const KNOWN = new Set(SETTINGS.map((s) => s.key));
export const isSettingKey = (key) => KNOWN.has(key);

export async function loadSettings(sql) {
  const out = Object.fromEntries(SETTINGS.map((s) => [s.key, s.default]));
  if (!sql) return out;
  const rows = await sql`SELECT key, value FROM site_settings WHERE left(key, 1) <> '_'`;
  for (const r of rows) if (KNOWN.has(r.key)) out[r.key] = r.value;
  return out;
}

/** CI colour names an editor can pick per page, mapped to the brand palette. */
export const ACCENTS = {
  pink: { th: 'ชมพู', a: '#fe5ea0', b: '#ffa3e0' },
  gold: { th: 'ทอง', a: '#fdb92e', b: '#fe5ea0' },
  lavender: { th: 'ลาเวนเดอร์', a: '#d6adfb', b: '#5e37a8' },
  sky: { th: 'ฟ้า', a: '#c1ecff', b: '#41ead4' },
  teal: { th: 'มิ้นต์', a: '#41ead4', b: '#b5fff5' },
  purple: { th: 'ม่วง', a: '#5e37a8', b: '#fe5ea0' },
};

export const PAGE_FIELDS = [
  'kind', 'slug', 'status', 'template',
  'title_th', 'title_en', 'summary_th', 'summary_en', 'body_th', 'body_en',
  'notice_th', 'notice_en', 'cta_label_th', 'cta_label_en', 'cta_url',
  'cover_url', 'accent', 'in_nav', 'nav_order',
];

/** Paths the router already owns, so no page may take them. */
export const RESERVED_SLUGS = new Set(['admin', 'api', 'assets', 'fonts', 'blog', 'p', 'staff', 'login']);

export function normaliseSlug(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9฀-๿-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export const pagePath = (p) => (p.kind === 'post' ? `/blog/${encodeURIComponent(p.slug)}` : `/p/${encodeURIComponent(p.slug)}`);
