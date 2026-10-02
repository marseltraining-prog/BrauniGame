/* =====================================================================
   УСТАНОВКА КАК ПРИЛОЖЕНИЕ (PWA) — этап 5 плана работ (PLAN.md).
   Модуль чисто браузерный: игровой логики нет, состояние игры не трогает
   (ни одной новой переменной в S), поэтому сохранения игроков не меняются.

   Что он делает при запуске (всё в try/catch, по шагам):
     1) рисует иконку приложения кодом — canvas → PNG base64 (а если canvas
        недоступен, то SVG в data-URI), размеры 180×180 и 512×512;
     2) вставляет в <head>: манифест (inline, data:application/manifest+json),
        apple-touch-icon, иконку вкладки, мета-теги «на домашний экран» для iOS
        (apple-mobile-web-app-capable / -title / status-bar-style) и theme-color;
     3) держит theme-color в тон теме игры (data-theme) и системной тёмной теме.

   ПОЧЕМУ НЕТ SERVICE WORKER.
   Игра собирается в один HTML-файл (build.js) и публикуется как Artifact, где
   отдельного файла рядом нет, а регистрация service worker из blob:-URL запрещена
   браузерами (MIME/scope). Поэтому офлайн делается не кэшем, а тем, что кэшировать
   нечего: в файле лежит вся игра целиком, картинок нет (иконки и графика рисуются
   кодом), а единственная внешняя зависимость — шрифты Google (константа `fonts`
   в build.js): они грузятся через media="print" + onload, то есть НЕ блокируют
   показ игры, и без интернета просто остаются системные шрифты. Проверено:
   в src/ нет других сетевых адресов (grep по http:// и https:// — только
   createElementNS('http://www.w3.org/2000/svg')).

   Надёжность: любая ошибка инициализации не должна мешать игре. Каждый шаг
   обёрнут try/catch, ошибки никуда не печатаются (в консоли игры должно быть
   0 ошибок), а BK.PWA.info() рассказывает, что в итоге получилось.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const NAME = 'Хлебная карта';
  const SHORT = 'Хлебная карта';            // подпись под иконкой на iPhone (iOS обрезает длинные)
  const DESC = 'Экономический симулятор сети пекарен: одна точка в Уфе, потом вся Россия.';
  const W = 512;                            // рисуем в сетке 512×512, потом масштабируем под нужный размер
  // Цвета — токены src/styles.css: мучная бумага (--paper) и хлебная корочка (--crust, --crust-2, --crust-soft).
  const LIGHT = { paper: '#e7ebee', paper2: '#dde3e7', crust: '#c46f17', crust2: '#e59a3e', soft: '#f4dfc2', rye: '#6b4a2e' };
  const DARK = { paper: '#0f141c', paper2: '#1a202b', crust: '#e8963d', crust2: '#f2b066', soft: '#3a2a18', rye: '#c89a6a' };

  /* ---------------- иконка: буханка на мучной бумаге ---------------- */
  // Общий рисунок для canvas и SVG: корочка-каравай, три надреза, пунктирный «маршрут» сети.
  const FLOUR = [[64, 86, 13], [448, 64, 9], [96, 470, 10], [430, 452, 14], [268, 44, 7], [36, 268, 8], [478, 236, 10]];
  const CUTS = [[150, 322, 232, 270], [236, 322, 318, 270], [322, 322, 404, 270]];
  // Контур каравая: одна и та же кривая в canvas (loafPath) и в SVG (LOAF_D), надрезы обрезаются по нему.
  const LOAF_D = 'M100 350C100 240 164 178 256 178C348 178 412 240 412 350C412 366 400 374 380 374L132 374C112 374 100 366 100 350Z';
  function loafPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(100, 350);
    ctx.bezierCurveTo(100, 240, 164, 178, 256, 178);
    ctx.bezierCurveTo(348, 178, 412, 240, 412, 350);
    ctx.bezierCurveTo(412, 366, 400, 374, 380, 374);
    ctx.lineTo(132, 374);
    ctx.bezierCurveTo(112, 374, 100, 366, 100, 350);
    ctx.closePath();
  }

  function paint(ctx, size, dark) {
    const c = dark ? DARK : LIGHT;
    const k = size / W;
    ctx.save();
    ctx.scale(k, k);
    ctx.fillStyle = c.paper;
    ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = c.paper2;
    for (let i = 0; i < FLOUR.length; i++) { ctx.beginPath(); ctx.arc(FLOUR[i][0], FLOUR[i][1], FLOUR[i][2], 0, Math.PI * 2); ctx.fill(); }
    loafPath(ctx);
    ctx.fillStyle = c.crust;
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = c.crust2;
    ctx.stroke();
    ctx.save();
    loafPath(ctx);
    ctx.clip();                                  // надрезы не вылезают за корочку
    ctx.lineCap = 'round';
    ctx.lineWidth = 26;
    ctx.strokeStyle = c.soft;
    for (let i = 0; i < CUTS.length; i++) {
      ctx.beginPath();
      ctx.moveTo(CUTS[i][0], CUTS[i][1]);
      ctx.lineTo(CUTS[i][2], CUTS[i][3]);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 12;
    ctx.strokeStyle = c.rye;
    ctx.setLineDash([30, 26]);
    ctx.beginPath();
    ctx.moveTo(132, 428);
    ctx.lineTo(380, 428);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = c.rye;
    ctx.beginPath(); ctx.arc(132, 428, 16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(380, 428, 16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function svgText(size, dark) {
    const c = dark ? DARK : LIGHT;
    let s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 512 512">'
      + '<rect width="512" height="512" fill="' + c.paper + '"/>';
    for (let i = 0; i < FLOUR.length; i++) s += '<circle cx="' + FLOUR[i][0] + '" cy="' + FLOUR[i][1] + '" r="' + FLOUR[i][2] + '" fill="' + c.paper2 + '"/>';
    s += '<path d="' + LOAF_D + '" fill="' + c.crust + '" stroke="' + c.crust2 + '" stroke-width="10"/>'
      + '<clipPath id="bkPwaLoaf"><path d="' + LOAF_D + '"/></clipPath><g clip-path="url(#bkPwaLoaf)">';
    for (let i = 0; i < CUTS.length; i++) s += '<path d="M' + CUTS[i][0] + ' ' + CUTS[i][1] + 'L' + CUTS[i][2] + ' ' + CUTS[i][3] + '" stroke="' + c.soft + '" stroke-width="26" stroke-linecap="round"/>';
    s += '</g>';
    s += '<path d="M132 428H380" stroke="' + c.rye + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="30 26" opacity="0.55"/>'
      + '<circle cx="132" cy="428" r="16" fill="' + c.rye + '" opacity="0.75"/><circle cx="380" cy="428" r="16" fill="' + c.rye + '" opacity="0.75"/></svg>';
    return s;
  }

  function svgUri(size, dark) { return 'data:image/svg+xml,' + encodeURIComponent(svgText(size, dark)); }

  // PNG через canvas (синхронно). Не вышло — вернём null, возьмём SVG.
  function pngUri(size, dark) {
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return null;
    paint(ctx, size, dark);
    const url = cv.toDataURL('image/png');
    if (typeof url !== 'string' || url.indexOf('data:image/png') !== 0 || url.length < 256 || url.indexOf('data:image/png,') === 0) return null;
    return url;
  }

  /* ---------------- вставка тегов в <head> ---------------- */
  let headCache = null;
  function headNode() {
    if (headCache) return headCache;              // один и тот же <head>, даже если его пришлось создать самим
    let h = document.head;
    if (!h) {
      const list = document.getElementsByTagName('head');
      h = list && list[0];
    }
    if (!h) {
      h = document.createElement('head');
      if (document.documentElement) document.documentElement.insertBefore(h, document.documentElement.firstChild);
    }
    headCache = h;
    return h;
  }
  function put(tag, attrs) {
    const el = document.createElement(tag);
    for (const k in attrs) { if (attrs[k] != null) el.setAttribute(k, String(attrs[k])); }
    el.setAttribute('data-bk-pwa', '1');
    headNode().appendChild(el);
    return el;
  }

  function manifestHref(icons, theme, paper) {
    let loc = './';
    try { loc = String(location.href).split('#')[0] || './'; } catch (e) { /* без location — относительный запуск */ }
    const m = {
      name: NAME,
      short_name: SHORT,
      description: DESC,
      lang: 'ru',
      dir: 'ltr',
      start_url: loc,
      display: 'standalone',
      orientation: 'any',
      scope: loc,
      background_color: paper,
      theme_color: theme,
      categories: ['games', 'simulation'],
      prefer_related_applications: false,
      icons: icons
    };
    return 'data:application/manifest+json;charset=utf-8,' + encodeURIComponent(JSON.stringify(m));
  }

  /* ---------------- цвет строки состояния под тему игры ---------------- */
  let themeMeta = null;
  function isDark() {
    try {
      const t = document.documentElement.getAttribute('data-theme');
      if (t === 'dark') return true;
      if (t === 'light') return false;
      return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) { return false; }
  }
  function paintThemeColor() {
    try { if (themeMeta) themeMeta.setAttribute('content', isDark() ? DARK.crust : LIGHT.crust); } catch (e) {}
  }
  function watchTheme() {
    try {
      if (globalThis.MutationObserver && document.documentElement) {
        new MutationObserver(paintThemeColor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      }
      if (globalThis.matchMedia) {
        const mq = globalThis.matchMedia('(prefers-color-scheme: dark)');
        if (mq.addEventListener) mq.addEventListener('change', paintThemeColor);
        else if (mq.addListener) mq.addListener(paintThemeColor);
      }
    } catch (e) { /* без наблюдения цвет останется светлым — игра работает */ }
  }

  /* ---------------- инициализация по шагам ---------------- */
  const info = { ok: false, failed: [], tags: [], icon: null, manifest: false };
  function step(name, fn) {
    try { return fn(); } catch (e) { info.failed.push(name); return null; }
  }

  function buildOnce() {
    if (!globalThis.document || !document.createElement) return;
    // 1) иконки: PNG (canvas) — основной вариант, SVG — запасной
    const png512 = step('png512', () => pngUri(512, false));
    const png180 = step('png180', () => pngUri(180, false));
    const svg512 = step('svg512', () => svgUri(512, false));
    const big = png512 || svg512;
    const small = png180 || svg512;
    info.icon = png512 && png180 ? 'png' : (big ? 'svg' : null);

    // 2) иконка на домашний экран (iPhone) и во вкладку
    if (small) {
      step('apple-touch-icon', () => {
        put('link', { rel: 'apple-touch-icon', sizes: png180 ? '180x180' : '512x512', href: small });
        info.tags.push('apple-touch-icon');
      });
    }
    if (big) {
      step('icon', () => {
        put('link', { rel: 'icon', type: png512 ? 'image/png' : 'image/svg+xml', href: big });
        info.tags.push('icon');
      });
    }

    // 3) манифест приложения — прямо в <head>, без отдельного файла
    if (big) {
      step('manifest', () => {
        const icons = png512
          ? [{ src: png512, sizes: '512x512', type: 'image/png', purpose: 'any' }]
          : [{ src: svg512, sizes: '512x512', type: 'image/svg+xml', purpose: 'any' }];
        if (png180) icons.push({ src: png180, sizes: '180x180', type: 'image/png', purpose: 'any' });
        if (png512 && svg512) icons.push({ src: svg512, sizes: '512x512', type: 'image/svg+xml', purpose: 'any' });
        put('link', { rel: 'manifest', href: manifestHref(icons, LIGHT.crust, LIGHT.paper) });
        info.manifest = true;
        info.tags.push('manifest');
      });
    }

    // 4) «на домашний экран» на iOS и прочие мета-теги
    step('meta', () => {
      put('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
      put('meta', { name: 'mobile-web-app-capable', content: 'yes' });
      put('meta', { name: 'apple-mobile-web-app-title', content: NAME });
      put('meta', { name: 'application-name', content: NAME });
      // status-bar-style: 'default' — системная строка остаётся светлой/тёмной сама и не накрывает интерфейс
      put('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });
      themeMeta = put('meta', { name: 'theme-color', content: LIGHT.crust });
      info.tags.push('meta');
    });
    paintThemeColor();
    watchTheme();
    info.ok = info.tags.length > 0;
  }

  BK.PWA = {
    // Иконка кодом: PNG из canvas, а если его нет — вектор в data-URI.
    icon: function (size, dark) {
      const s = size || 512;
      return step('icon-call', () => pngUri(s, !!dark)) || step('icon-call', () => svgUri(s, !!dark));
    },
    iconSvg: function (size, dark) { return svgUri(size || 512, !!dark); },
    info: function () { return { ok: info.ok, failed: info.failed.slice(), tags: info.tags.slice(), icon: info.icon, manifest: info.manifest }; }
  };

  // Сборка — целиком под защитой: даже неожиданная ошибка не должна всплыть наружу.
  function build() { try { buildOnce(); } catch (e) { info.failed.push('build'); } }

  // Запуск: сразу, если <head> уже есть; иначе — как только документ будет готов.
  function ready() {
    try {
      if (document.head || document.readyState !== 'loading') { build(); return; }
      document.addEventListener('DOMContentLoaded', build);
    } catch (e) { try { build(); } catch (e2) { /* игра всё равно работает */ } }
  }
  ready();
})();
