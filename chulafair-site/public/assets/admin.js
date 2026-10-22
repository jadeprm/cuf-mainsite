/* chulafair.com — admin panel (CUFTM Admin / Co-Admin only). Plain JS, no build. */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var state = { editor: null, dirty: false };

  // ------------------------------------------------------------- helpers
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function api(action, body, extra) {
    var opts = { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: {} };
    if (body) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch('/api/admin?do=' + action + (extra || ''), opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.status === 401 && data.error === 'SIGNED_OUT') { state.editor = null; route(); }
        data._status = r.status;
        return data;
      });
    });
  }
  var toastTimer;
  function toast(msg, kind) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast ' + (kind || '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
  }
  function when(d) {
    if (!d) return '';
    try {
      return new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
    } catch (_) { return ''; }
  }
  var ERR = {
    BAD_CREDENTIALS: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (ใช้บัญชีเดียวกับ CUFTM)',
    NOT_ADMIN: 'บัญชีนี้ไม่ได้เป็น Admin หรือ Co-Admin ใน CUFTM จึงแก้ไขเว็บไซต์ไม่ได้ — ติดต่อ Admin เพื่อขอสิทธิ์',
    NO_PASSWORD_YET: 'บัญชีนี้ยังไม่ได้ตั้งรหัสผ่าน — ตั้งครั้งแรกที่ task.chulafair.com ก่อน',
    RESET_PENDING: 'บัญชีนี้อยู่ระหว่างรีเซ็ตรหัสผ่าน — ตั้งรหัสใหม่ที่ task.chulafair.com ก่อน',
    TOO_MANY_ATTEMPTS: 'ลองผิดหลายครั้งเกินไป รอประมาณ 15 นาทีแล้วลองใหม่',
    MISSING: 'กรอกชื่อผู้ใช้และรหัสผ่าน',
    NO_DATABASE: 'เว็บไซต์ยังไม่ได้เชื่อมฐานข้อมูล (ดูคู่มือ README)',
    NO_CUFTM_USERS: 'ไม่พบตารางผู้ใช้ของ CUFTM — ต้องเชื่อมฐานข้อมูลเดียวกับ CUFTM',
    TITLE_REQUIRED: 'ใส่ชื่อหน้าอย่างน้อยหนึ่งภาษา',
    SLUG_REQUIRED: 'ใส่ลิงก์ (slug) ของหน้า',
    SLUG_RESERVED: 'ลิงก์นี้ระบบใช้อยู่แล้ว เลือกชื่ออื่น',
    SLUG_TAKEN: 'ลิงก์นี้มีหน้าอื่นใช้แล้ว',
    BAD_URL: 'ลิงก์ต้องขึ้นต้นด้วย https:// (หรือ / สำหรับหน้าในเว็บนี้)',
    BAD_ORIGIN: 'คำขอถูกปฏิเสธ ลองรีเฟรชหน้า',
    NOT_FOUND: 'ไม่พบหน้านี้ (อาจถูกลบไปแล้ว)',
  };
  function errText(d) { return ERR[d.error] || ('เกิดข้อผิดพลาด' + (d.error ? ' (' + d.error + ')' : '')); }

  var ACCENTS = [['pink', 'ชมพู', '#fe5ea0'], ['gold', 'ทอง', '#fdb92e'], ['lavender', 'ลาเวนเดอร์', '#d6adfb'],
    ['sky', 'ฟ้า', '#c1ecff'], ['teal', 'มิ้นต์', '#41ead4'], ['purple', 'ม่วง', '#5e37a8']];

  function pathOf(p) { return (p.kind === 'post' ? '/blog/' : '/p/') + encodeURIComponent(p.slug); }

  window.addEventListener('beforeunload', function (e) {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // --------------------------------------------------------------- shell
  function setShell() {
    var signed = !!state.editor;
    document.getElementById('bar-nav').hidden = !signed;
    document.getElementById('bar-user').hidden = !signed;
    if (signed) {
      document.getElementById('who').innerHTML = esc(state.editor.name) +
        ' <span class="badge">' + (state.editor.access === 'admin' ? 'Admin' : 'Co-Admin') + '</span>';
    }
    var hash = location.hash || '#/';
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      var on = (a.dataset.nav === 'settings') ? hash.indexOf('#/settings') === 0 : hash.indexOf('#/settings') !== 0;
      a.classList.toggle('on', on);
    });
  }

  document.getElementById('logout').addEventListener('click', function () {
    api('logout', {}).then(function () { state.editor = null; location.hash = '#/'; route(); });
  });

  var lastHash = location.hash;
  window.addEventListener('hashchange', function () {
    if (state.dirty && !confirm('มีการแก้ไขที่ยังไม่ได้บันทึก — ออกจากหน้านี้เลยหรือไม่?')) {
      history.replaceState(null, '', lastHash || '#/');
      return;
    }
    state.dirty = false;
    lastHash = location.hash;
    route();
  });

  function route() {
    setShell();
    if (!state.editor) return renderLogin();
    var h = location.hash.replace(/^#/, '') || '/';
    var m;
    if (h === '/settings') return renderSettings();
    if ((m = h.match(/^\/new\/(page|post)$/))) return renderEditor(null, m[1]);
    if ((m = h.match(/^\/edit\/([\w-]+)$/))) return renderEditor(m[1]);
    return renderList();
  }

  // --------------------------------------------------------------- login
  function renderLogin() {
    app.innerHTML =
      '<section class="login">' +
      '<div class="login-sky" aria-hidden="true"><i></i></div>' +
      '<form class="card login-card" id="login-form">' +
      '<h1>เข้าสู่ระบบจัดการเว็บไซต์</h1>' +
      '<p class="muted">ใช้ชื่อผู้ใช้และรหัสผ่านเดียวกับ <a href="https://task.chulafair.com" target="_blank" rel="noopener">CUFTM</a> — เฉพาะ Admin และ Co-Admin</p>' +
      '<label>ชื่อผู้ใช้ CUFTM<input name="username" autocomplete="username" required autofocus></label>' +
      '<label>รหัสผ่าน<input name="password" type="password" autocomplete="current-password" required></label>' +
      '<p class="error" id="login-error" hidden></p>' +
      '<button class="btn primary wide" type="submit">เข้าสู่ระบบ</button>' +
      '</form></section>';
    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, btn = f.querySelector('button');
      btn.disabled = true;
      api('login', { username: f.username.value, password: f.password.value }).then(function (d) {
        btn.disabled = false;
        if (d.editor) { state.editor = d.editor; route(); return; }
        var el = document.getElementById('login-error');
        el.textContent = errText(d); el.hidden = false;
      });
    });
  }

  // ---------------------------------------------------------------- list
  var listFilter = 'all';
  function renderList() {
    app.innerHTML = '<p class="loading">กำลังโหลด…</p>';
    api('list').then(function (d) {
      if (!d.pages) { app.innerHTML = '<p class="error">' + esc(errText(d)) + '</p>'; return; }
      var pages = d.pages;
      var counts = {
        all: pages.length,
        page: pages.filter(function (p) { return p.kind === 'page'; }).length,
        post: pages.filter(function (p) { return p.kind === 'post'; }).length,
        draft: pages.filter(function (p) { return p.status === 'draft'; }).length,
      };
      var shown = pages.filter(function (p) {
        if (listFilter === 'all') return true;
        if (listFilter === 'draft') return p.status === 'draft';
        return p.kind === listFilter;
      });
      var tabs = [['all', 'ทั้งหมด'], ['page', 'หน้า'], ['post', 'บล็อก'], ['draft', 'ฉบับร่าง']].map(function (t) {
        return '<button type="button" class="tab' + (listFilter === t[0] ? ' on' : '') + '" data-filter="' + t[0] + '">' +
          t[1] + ' <span class="count">' + counts[t[0]] + '</span></button>';
      }).join('');
      var rows = shown.map(function (p) {
        var acc = ACCENTS.filter(function (a) { return a[0] === p.accent; })[0] || ACCENTS[0];
        return '<a class="row" href="#/edit/' + esc(p.id) + '">' +
          '<span class="dot" style="background:' + acc[2] + '"></span>' +
          '<span class="row-main"><strong>' + esc(p.title_th || p.title_en) + '</strong>' +
          (p.title_en && p.title_th ? '<span class="muted"> · ' + esc(p.title_en) + '</span>' : '') +
          '<span class="row-path">' + esc(pathOf(p)) + (p.template === 'survey' ? ' · แบบสำรวจ' : '') + (p.in_nav ? ' · อยู่ในเมนู' : '') + '</span></span>' +
          '<span class="kind">' + (p.kind === 'post' ? 'บล็อก' : 'หน้า') + '</span>' +
          '<span class="status ' + p.status + '">' + (p.status === 'published' ? 'เผยแพร่แล้ว' : 'ฉบับร่าง') + '</span>' +
          '<span class="row-when">' + esc(when(p.updated_at)) + (p.updated_by_name ? '<br><span class="muted">' + esc(p.updated_by_name) + '</span>' : '') + '</span>' +
          '</a>';
      }).join('');
      app.innerHTML =
        '<section class="page">' +
        '<div class="page-head"><div><h1>หน้า &amp; บล็อก</h1>' +
        '<p class="muted">สร้างหน้าใหม่สำหรับออกแบบ/ประกาศ หรือเขียนบล็อกสื่อสารกับผู้ชม — ทุกอย่างเริ่มเป็น <b>ฉบับร่าง</b> จนกว่าจะกดเผยแพร่</p></div>' +
        '<div class="actions"><a class="btn" href="#/new/page">+ หน้าใหม่</a><a class="btn primary" href="#/new/post">+ เขียนบล็อก</a></div></div>' +
        '<div class="tabs">' + tabs + '</div>' +
        '<div class="card list">' + (rows || '<p class="empty">ยังไม่มีรายการในหมวดนี้</p>') + '</div>' +
        '</section>';
      app.querySelectorAll('[data-filter]').forEach(function (b) {
        b.addEventListener('click', function () { listFilter = b.dataset.filter; renderList(); });
      });
    });
  }

  // -------------------------------------------------------------- editor
  var BLANK = {
    kind: 'page', slug: '', status: 'draft', template: 'standard', accent: 'pink',
    title_th: '', title_en: '', summary_th: '', summary_en: '', body_th: '', body_en: '',
    notice_th: '', notice_en: '', cta_label_th: '', cta_label_en: '', cta_url: '', cover_url: '',
    in_nav: false, nav_order: 100,
  };

  function field(name, label, value, opts) {
    opts = opts || {};
    var input = opts.area
      ? '<textarea name="' + name + '" rows="' + (opts.rows || 3) + '"' + (opts.mono ? ' class="mono"' : '') + ' placeholder="' + esc(opts.ph || '') + '">' + esc(value) + '</textarea>'
      : '<input name="' + name + '" value="' + esc(value) + '" placeholder="' + esc(opts.ph || '') + '"' + (opts.type ? ' type="' + opts.type + '"' : '') + '>';
    return '<label class="field">' + label + (opts.hint ? '<span class="hint">' + opts.hint + '</span>' : '') + input + '</label>';
  }

  function langPane(lang, p) {
    var th = lang === 'th';
    var s = '_' + lang;
    return '<div class="lang-pane" data-pane="' + lang + '"' + (th ? '' : ' hidden') + '>' +
      field('title' + s, th ? 'ชื่อหน้า' : 'Title', p['title' + s], { ph: th ? 'เช่น ประกาศรับสมัครร้านค้า' : 'e.g. Shop applications' }) +
      field('summary' + s, th ? 'คำโปรย (แสดงใต้ชื่อ และในการ์ด)' : 'Summary', p['summary' + s], { area: true, rows: 2 }) +
      field('notice' + s, th ? 'กล่องประกาศสำคัญ (เว้นว่างถ้าไม่ใช้)' : 'Notice box (optional)', p['notice' + s], { area: true, rows: 2 }) +
      field('body' + s, th ? 'เนื้อหา' : 'Body', p['body' + s], { area: true, rows: 16, mono: true, hint: th ? 'ใช้ Markdown — ดูวิธีเขียนด้านล่าง' : (th ? '' : 'Leave empty to show the Thai text') }) +
      field('cta_label' + s, th ? 'ข้อความบนปุ่ม' : 'Button label', p['cta_label' + s], { ph: th ? 'เช่น ไปที่แบบสำรวจ' : 'e.g. Go to the survey' }) +
      '</div>';
  }

  function renderEditor(id, kind) {
    app.innerHTML = '<p class="loading">กำลังโหลด…</p>';
    var load = id ? api('get', null, '&id=' + encodeURIComponent(id)) : Promise.resolve({ page: Object.assign({}, BLANK, { kind: kind }), revisions: [] });
    load.then(function (d) {
      if (!d.page) { app.innerHTML = '<p class="error">' + esc(errText(d)) + '</p>'; return; }
      var p = d.page, isNew = !id, isPost = p.kind === 'post';
      var base = p.updated_at || null;

      var accentOpts = ACCENTS.map(function (a) {
        return '<label class="swatch" title="' + a[1] + '"><input type="radio" name="accent" value="' + a[0] + '"' + (p.accent === a[0] ? ' checked' : '') + '><span style="background:' + a[2] + '"></span></label>';
      }).join('');

      var revs = (d.revisions || []).map(function (r) {
        return '<li><span>' + esc(when(r.saved_at)) + ' · ' + esc(r.saved_by_name || '') + ' <span class="muted">(' + (r.status === 'published' ? 'เผยแพร่' : 'ร่าง') + ')</span></span>' +
          '<button type="button" class="link" data-restore="' + r.id + '">ย้อนกลับไปฉบับนี้</button></li>';
      }).join('');

      app.innerHTML =
        '<section class="page editor">' +
        '<div class="page-head"><div><a class="back" href="#/">← กลับ</a>' +
        '<h1>' + (isNew ? (isPost ? 'เขียนบล็อกใหม่' : 'สร้างหน้าใหม่') : esc(p.title_th || p.title_en)) + '</h1>' +
        (isNew ? '' : '<p class="muted"><span class="status ' + p.status + '">' + (p.status === 'published' ? 'เผยแพร่แล้ว' : 'ฉบับร่าง — ยังไม่เผยแพร่') + '</span> แก้ล่าสุด ' + esc(when(p.updated_at)) + (p.updated_by_name ? ' โดย ' + esc(p.updated_by_name) : '') + '</p>') +
        '</div><div class="actions">' +
        '<button type="button" class="btn" id="toggle-preview">ดูตัวอย่าง</button>' +
        (isNew ? '' : '<a class="btn" href="' + esc(pathOf(p)) + '" target="_blank" rel="noopener">เปิดหน้าจริง ↗</a>') +
        '</div></div>' +
        '<form id="editor" class="editor-grid" autocomplete="off">' +
        '<div class="card main-col">' +
        '<div class="lang-tabs" role="tablist"><button type="button" class="on" data-lang="th">ไทย</button><button type="button" data-lang="en">English</button></div>' +
        langPane('th', p) + langPane('en', p) +
        '<details class="md-help"><summary>วิธีเขียนเนื้อหา (Markdown)</summary><pre>## หัวข้อใหญ่\n### หัวข้อรอง\n**ตัวหนา**  *ตัวเอียง*\n[ข้อความลิงก์](https://…)\n![คำอธิบายรูป](https://ลิงก์รูป.jpg)\n- รายการแบบจุด\n1. รายการแบบตัวเลข\n&gt; ข้อความอ้างอิง\n---   (เส้นคั่น)\n[[ปุ่ม: ข้อความบนปุ่ม | https://…]]</pre>' +
        '<p class="muted">รูปภาพ: อัปโหลดไว้ที่อื่นก่อน (เช่น Canva → แชร์ลิงก์รูป, หรือโฟลเดอร์ Google Drive ที่เปิดสาธารณะ) แล้ววางลิงก์รูปที่ลงท้าย .jpg / .png</p></details>' +
        '</div>' +
        '<aside class="side-col">' +
        '<div class="card">' +
        '<h2>เผยแพร่</h2>' +
        '<div class="publish-btns">' +
        '<button type="submit" class="btn" data-status="draft">' + (p.status === 'published' ? 'ยกเลิกเผยแพร่ (กลับเป็นร่าง)' : 'บันทึกฉบับร่าง') + '</button>' +
        '<button type="submit" class="btn primary" data-status="published">' + (p.status === 'published' ? 'บันทึก & อัปเดตหน้าเว็บ' : 'เผยแพร่') + '</button>' +
        '</div><p class="hint">หน้าเว็บจริงอัปเดตภายในราว 1 นาทีหลังบันทึก</p>' +
        '</div>' +
        '<div class="card">' +
        '<h2>ตั้งค่าหน้า</h2>' +
        '<label class="field">ประเภท<select name="kind"><option value="page"' + (!isPost ? ' selected' : '') + '>หน้า (page)</option><option value="post"' + (isPost ? ' selected' : '') + '>บล็อก (post)</option></select></label>' +
        '<label class="field">ลิงก์ของหน้า<span class="hint" id="slug-path">' + esc(pathOf(p)) + '</span><input name="slug" value="' + esc(p.slug) + '" placeholder="เช่น shop-interest"></label>' +
        '<label class="field">รูปแบบหน้า<select name="template"><option value="standard"' + (p.template !== 'survey' ? ' selected' : '') + '>มาตรฐาน</option><option value="survey"' + (p.template === 'survey' ? ' selected' : '') + '>แบบสำรวจ (ย้ำว่าไม่ใช่ใบสมัคร)</option></select></label>' +
        '<div class="field">สีประจำหน้า (จาก CI)<div class="swatches">' + accentOpts + '</div></div>' +
        field('cover_url', 'รูปปก (ลิงก์รูป)', p.cover_url, { ph: 'https://…' }) +
        field('cta_url', 'ลิงก์ของปุ่ม', p.cta_url, { ph: 'https://forms.gle/…', hint: 'เช่น ลิงก์ Google Form — เว้นว่างถ้ายังไม่มี' }) +
        '<div class="nav-opts"' + (isPost ? ' hidden' : '') + '><label class="check"><input type="checkbox" name="in_nav"' + (p.in_nav ? ' checked' : '') + '> แสดงในเมนูด้านบน</label>' +
        field('nav_order', 'ลำดับในเมนู (น้อยมาก่อน)', p.nav_order, { type: 'number' }) + '</div>' +
        '</div>' +
        (isNew ? '' :
          '<div class="card"><h2>ประวัติการแก้ไข</h2>' + (revs ? '<ul class="revs">' + revs + '</ul>' : '<p class="muted">ยังไม่มี — ทุกครั้งที่บันทึก ฉบับก่อนหน้าจะถูกเก็บไว้ที่นี่</p>') + '</div>' +
          '<div class="card danger"><button type="button" class="btn danger-btn" id="delete">ลบหน้านี้</button></div>') +
        '</aside>' +
        '</form>' +
        '<div class="preview" id="preview" hidden><div class="preview-bar"><span>ตัวอย่าง (ยังไม่บันทึก)</span>' +
        '<span><button type="button" class="link" data-plang="th">ไทย</button> · <button type="button" class="link" data-plang="en">EN</button> · <button type="button" class="link" data-pw="390">มือถือ</button> · <button type="button" class="link" data-pw="">เต็ม</button> · <button type="button" class="link" id="close-preview">ปิด ✕</button></span></div>' +
        '<iframe id="preview-frame" title="ตัวอย่างหน้า"></iframe></div>' +
        '</section>';

      var form = document.getElementById('editor');

      function collect() {
        var data = {};
        Object.keys(BLANK).forEach(function (k) {
          var el = form.elements[k];
          if (!el) return;
          if (k === 'in_nav') data[k] = el.checked;
          else if (k === 'accent') data[k] = (form.querySelector('input[name=accent]:checked') || {}).value || 'pink';
          else data[k] = el.value;
        });
        return data;
      }

      // Language tabs
      form.querySelectorAll('.lang-tabs button').forEach(function (b) {
        b.addEventListener('click', function () {
          form.querySelectorAll('.lang-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
          form.querySelectorAll('.lang-pane').forEach(function (pane) { pane.hidden = pane.dataset.pane !== b.dataset.lang; });
          previewLang = b.dataset.lang;
          schedulePreview();
        });
      });

      // Kind changes the URL shape and whether "in menu" applies.
      function refreshMeta() {
        var data = collect();
        document.getElementById('slug-path').textContent = pathOf({ kind: data.kind, slug: data.slug || '…' });
        form.querySelector('.nav-opts').hidden = data.kind === 'post';
      }
      form.addEventListener('input', function () { state.dirty = true; refreshMeta(); schedulePreview(); });
      form.addEventListener('change', function () { state.dirty = true; refreshMeta(); schedulePreview(); });

      // Suggest a slug from the English (or Thai) title for new pages.
      var slugTouched = !isNew;
      form.elements.slug.addEventListener('input', function () { slugTouched = true; });
      ['title_en', 'title_th'].forEach(function (n) {
        form.elements[n].addEventListener('input', function () {
          if (slugTouched) return;
          var src = form.elements.title_en.value || form.elements.title_th.value;
          form.elements.slug.value = src.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9฀-๿-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
          refreshMeta();
        });
      });

      // Live preview
      var previewEl = document.getElementById('preview');
      var frame = document.getElementById('preview-frame');
      var previewLang = 'th', previewTimer = null;
      function schedulePreview() {
        if (previewEl.hidden) return;
        clearTimeout(previewTimer);
        previewTimer = setTimeout(updatePreview, 500);
      }
      function updatePreview() {
        api('preview', collect()).then(function (r) {
          if (!r.html) return;
          var html = r.html.replace('data-lang="th"', 'data-lang="' + previewLang + '"')
            .replace("localStorage.getItem('cf_lang')||'th'", "'" + previewLang + "'");
          var y = frame.contentWindow ? frame.contentWindow.scrollY : 0;
          frame.srcdoc = html;
          frame.onload = function () { try { frame.contentWindow.scrollTo(0, y); } catch (_) {} };
        });
      }
      document.getElementById('toggle-preview').addEventListener('click', function () {
        previewEl.hidden = !previewEl.hidden;
        document.body.classList.toggle('with-preview', !previewEl.hidden);
        if (!previewEl.hidden) updatePreview();
      });
      document.getElementById('close-preview').addEventListener('click', function () {
        previewEl.hidden = true; document.body.classList.remove('with-preview');
      });
      previewEl.querySelectorAll('[data-plang]').forEach(function (b) {
        b.addEventListener('click', function () { previewLang = b.dataset.plang; updatePreview(); });
      });
      previewEl.querySelectorAll('[data-pw]').forEach(function (b) {
        b.addEventListener('click', function () { frame.style.maxWidth = b.dataset.pw ? b.dataset.pw + 'px' : ''; });
      });

      // Save / publish
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var status = (e.submitter && e.submitter.dataset.status) || p.status;
        if (status === 'published' && p.status !== 'published' &&
            !confirm('เผยแพร่หน้านี้ให้ทุกคนเห็นบน chulafair.com ใช่ไหม?')) return;
        var body = collect();
        body.status = status;
        if (!isNew) { body.id = p.id; body.base = base; }
        form.querySelectorAll('button[type=submit]').forEach(function (b) { b.disabled = true; });
        api('save', body).then(function (r) {
          form.querySelectorAll('button[type=submit]').forEach(function (b) { b.disabled = false; });
          if (r.page) {
            state.dirty = false;
            toast(status === 'published' ? 'เผยแพร่แล้ว ✓' : 'บันทึกฉบับร่างแล้ว ✓', 'ok');
            if (isNew) { lastHash = '#/edit/' + r.page.id; location.hash = lastHash; }
            else renderEditor(r.page.id);
            return;
          }
          if (r.error === 'CONFLICT') {
            alert('มีคนแก้หน้านี้ไปแล้ว (' + (r.by || '') + ', ' + when(r.at) + ')\nคัดลอกข้อความของคุณเก็บไว้ แล้วรีเฟรชเพื่อโหลดฉบับล่าสุด');
            return;
          }
          toast(errText(r), 'bad');
        });
      });

      var del = document.getElementById('delete');
      if (del) del.addEventListener('click', function () {
        if (!confirm('ลบ "' + (p.title_th || p.title_en) + '" ถาวร? (ฉบับสุดท้ายยังเก็บไว้ในประวัติฐานข้อมูล)')) return;
        api('delete', { id: p.id }).then(function (r) {
          if (r.ok) { state.dirty = false; toast('ลบแล้ว', 'ok'); location.hash = '#/'; }
          else toast(errText(r), 'bad');
        });
      });

      app.querySelectorAll('[data-restore]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('ย้อนหน้านี้กลับไปเป็นฉบับนั้น? (ฉบับปัจจุบันจะถูกเก็บในประวัติด้วย)')) return;
          api('restore', { revision: Number(b.dataset.restore) }).then(function (r) {
            if (r.page) { state.dirty = false; toast('ย้อนกลับแล้ว ✓', 'ok'); renderEditor(r.page.id); }
            else toast(errText(r), 'bad');
          });
        });
      });
    });
  }

  // ------------------------------------------------------------ settings
  function renderSettings() {
    app.innerHTML = '<p class="loading">กำลังโหลด…</p>';
    api('settings').then(function (d) {
      if (!d.definitions) { app.innerHTML = '<p class="error">' + esc(errText(d)) + '</p>'; return; }
      var groups = Object.keys(d.groups).map(function (g) {
        var items = d.definitions.filter(function (s) { return s.group === g; }).map(function (s) {
          var v = d.values[s.key];
          var long = s.multiline || String(v || '').length > 70;
          var input = long
            ? '<textarea name="' + s.key + '" rows="' + (s.multiline ? 4 : 2) + '">' + esc(v) + '</textarea>'
            : '<input name="' + s.key + '" value="' + esc(v) + '">';
          var reset = v !== s.default ? '<button type="button" class="link small" data-reset="' + s.key + '">คืนค่าเดิม</button>' : '';
          return '<label class="field">' + esc(s.label) + reset + input + '</label>';
        }).join('');
        return '<div class="card"><h2>' + esc(d.groups[g]) + '</h2>' + items + '</div>';
      }).join('');
      app.innerHTML =
        '<section class="page narrow">' +
        '<div class="page-head"><div><h1>ข้อความหน้าแรก</h1><p class="muted">แก้ข้อความบนหน้าแรกของ chulafair.com — ช่องที่เว้นว่างจะถูกซ่อน</p></div>' +
        '<div class="actions"><a class="btn" href="/" target="_blank" rel="noopener">ดูหน้าแรก ↗</a></div></div>' +
        '<form id="settings-form">' + groups +
        '<div class="sticky-save"><button class="btn primary" type="submit">บันทึกการเปลี่ยนแปลง</button></div></form></section>';
      var form = document.getElementById('settings-form');
      form.addEventListener('input', function () { state.dirty = true; });
      form.querySelectorAll('[data-reset]').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.preventDefault();
          var def = d.definitions.filter(function (s) { return s.key === b.dataset.reset; })[0];
          form.elements[def.key].value = def.default;
          state.dirty = true;
        });
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var values = {};
        d.definitions.forEach(function (s) { values[s.key] = form.elements[s.key].value; });
        api('settings', { values: values }).then(function (r) {
          if (r.values) { state.dirty = false; toast('บันทึกแล้ว ✓ หน้าแรกจะอัปเดตในราว 1 นาที', 'ok'); renderSettings(); }
          else toast(errText(r) + (r.field ? ' — ' + r.field : ''), 'bad');
        });
      });
    });
  }

  // ---------------------------------------------------------------- boot
  api('me').then(function (d) {
    if (d._status >= 500) { app.innerHTML = '<p class="error">' + esc(errText(d)) + '</p>'; return; }
    state.editor = d.editor || null;
    route();
  });
})();
