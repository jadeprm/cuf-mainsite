// chulafair.com — language toggle, header on scroll, mobile menu.
(function () {
  var root = document.documentElement;

  function setLang(lang) {
    root.setAttribute('data-lang', lang);
    root.lang = lang;
    try { localStorage.setItem('cf_lang', lang); } catch (_) {}
    document.querySelectorAll('[data-set-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang));
    });
    // Keep ?lang= in sync so a shared link opens in the same language.
    try {
      var url = new URL(location.href);
      if (url.searchParams.has('lang')) {
        url.searchParams.set('lang', lang);
        history.replaceState(null, '', url);
      }
    } catch (_) {}
  }

  document.querySelectorAll('[data-set-lang]').forEach(function (b) {
    b.addEventListener('click', function () { setLang(b.getAttribute('data-set-lang')); });
  });
  setLang(root.getAttribute('data-lang') || 'th');

  var header = document.querySelector('.site-header');
  function onScroll() { if (header) header.classList.toggle('scrolled', window.scrollY > 40); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var nav = document.querySelector('.site-nav');
  if (nav && nav.children.length) {
    var btn = document.createElement('button');
    btn.className = 'menu-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'เมนู / Menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
    var tools = document.querySelector('.header-tools');
    tools.insertBefore(btn, tools.firstChild);
  }
})();
