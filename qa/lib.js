/* Общие помощники для QA-сценариев (Playwright). */
const path = require('path');
const { chromium } = require('playwright');

const URL = 'file://' + path.join(__dirname, '..', 'dist', 'local.html');
const VIEWPORTS = {
  d1440: { width: 1440, height: 900 },
  d1280: { width: 1280, height: 800 },
  m390: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  m360: { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

async function openPage(browser, vpName, opts = {}) {
  const vp = VIEWPORTS[vpName];
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch,
    deviceScaleFactor: vp.deviceScaleFactor || 1, colorScheme: opts.dark ? 'dark' : 'light', permissions: ['clipboard-read', 'clipboard-write'],
  });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push('PAGEERR ' + e.message + (e.stack ? ' | ' + e.stack.split('\n').slice(1, 3).join(' ') : '')));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errs.push('CONSOLE ' + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  if (opts.seed) await p.addInitScript((seed) => { let x = seed >>> 0; Math.random = () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }, opts.seed);
  if (opts.save) await p.addInitScript((s) => { try { localStorage.setItem('bk-ufa-save-v1', s); } catch (e) {} }, opts.save);
  await p.goto(URL);
  return p;
}

/* Проверки вёрстки внутри страницы: выход за экран, обрезанный текст, перекрытые кнопки, мелкие цели, контраст. */
async function layoutCheck(p, label, opts = {}) {
  const res = await p.evaluate((o) => {
    const W = innerWidth, H = innerHeight, out = [];
    const desc = (el) => {
      let s = el.tagName.toLowerCase();
      if (el.id) s += '#' + el.id;
      if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return s + (t ? ` «${t}»` : '');
    };
    const docW = document.documentElement.scrollWidth;
    if (docW > W + 1) out.push(`HSCROLL документа: ${docW} > ${W}`);
    const toasts = document.getElementById('toasts'); if (toasts) toasts.style.display = 'none';
    const modalOpen = document.querySelector('#modal .modal');
    const startOpen = document.querySelector('#start:not([hidden]) .start-in');
    const roots = modalOpen ? [modalOpen] : startOpen ? [startOpen] : [...document.querySelectorAll('#pbody, .hud, .mapwrap')];
    const seen = new Set(), seenC = new Set();
    const parseColor = (c) => {
      if (!c) return null;
      let m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
      m = c.match(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)/);
      if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] == null ? 1 : +m[4]];
      return null;
    };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const blend = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
    const bgOf = (el) => {
      const stack = [];
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const c = parseColor(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } }
      let bg = [255, 255, 255, 1];
      if (stack.length && stack[stack.length - 1][3] >= 1) bg = stack.pop();
      else { const bc = parseColor(getComputedStyle(document.body).backgroundColor); if (bc) bg = bc; }
      while (stack.length) bg = blend(stack.pop(), bg);
      return bg;
    };
    const clipOf = (el) => {
      for (let e = el.parentElement; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return e; }
      return null;
    };
    for (const root of roots) {
      for (const el of root.querySelectorAll('*')) {
        if (seen.has(el)) continue; seen.add(el);
        if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
        const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        // содержимое горизонтально прокручиваемой строки (чипы слоёв карты на телефоне) законно уходит за край — до него докручивают;
        // строка = прокрутка по X при неизменной высоте, чтобы не освобождать от проверки обычные прокручиваемые панели
        const hs = (() => { for (let e = el.parentElement; e; e = e.parentElement) { const ox = getComputedStyle(e).overflowX; if ((ox === 'auto' || ox === 'scroll') && e.scrollWidth > e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1) { const er = e.getBoundingClientRect(); return er.left >= -1.5 && er.right <= W + 1.5; } } return false; })();
        // выход за пределы окна по горизонтали
        if (!hs && (r.right > W + 1.5 || r.left < -1.5)) out.push(`ЗА КРАЕМ ЭКРАНА ${desc(el)} [${Math.round(r.left)}…${Math.round(r.right)}]`);
        // выход за пределы контейнера с обрезкой
        const clip = clipOf(el);
        if (clip && !hs && !el.closest('.map')) { const cr = clip.getBoundingClientRect(); if (r.right > cr.right + 1.5 && cs.position !== 'fixed' && cs.position !== 'absolute') out.push(`ОБРЕЗАН КОНТЕЙНЕРОМ ${desc(el)} (${desc(clip).slice(0, 30)}) на ${Math.round(r.right - cr.right)}px`); }
        // обрезанный текст (ellipsis / overflow hidden)
        if ((cs.textOverflow === 'ellipsis' || cs.overflowX === 'hidden') && el.scrollWidth > el.clientWidth + 1 && el.childElementCount === 0) out.push(`ТЕКСТ ОБРЕЗАН ${desc(el)} (${el.scrollWidth}>${el.clientWidth})`);
        // только видимые элементы в окне
        const inView = r.bottom > 0 && r.top < H && r.right > 0 && r.left < W;
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (hasText) {
          const fs = parseFloat(cs.fontSize);
          if (fs < (o.mobile ? 10.5 : 10)) out.push(`МЕЛКИЙ ШРИФТ ${fs}px ${desc(el)}`);
          const fg = parseColor(cs.color); const op = [...(function* () { for (let e = el; e; e = e.parentElement) yield +getComputedStyle(e).opacity; })()].reduce((a, b) => a * b, 1);
          if (fg && op > 0.9 && !el.closest('button:disabled')) {
            const bg = bgOf(el); const f = blend(fg, bg);
            const L1 = lum(f), L2 = lum(bg); const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
            const need = fs >= 18 || (fs >= 14 && +cs.fontWeight >= 700) ? 3 : 4.5;
            const key = (el.className || el.tagName) + cs.color + bg.slice(0, 3).map(Math.round);
            if (cr < need - 0.01 && !seenC.has(key)) { seenC.add(key); out.push(`КОНТРАСТ ${cr.toFixed(2)} (<${need}) ${desc(el)} цвет ${cs.color} на rgb(${bg.slice(0, 3).map(Math.round)})`); }
          }
        }
        // кнопки: перекрытие и размер цели
        if ((el.tagName === 'BUTTON' || el.matches('[data-act], select, input, label.chefitem')) && inView && !el.disabled) {
          const cx = Math.min(W - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(H - 1, Math.max(0, r.top + r.height / 2));
          // элемент, прокрученный за край своего контейнера (панель справа), не считается перекрытым
          const sc = (() => { for (let e = el.parentElement; e; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight) return e; } return null; })();
          const scr = sc && sc.getBoundingClientRect();
          const inScroll = !scr || (cy >= scr.top && cy <= scr.bottom);
          if (r.top >= 0 && r.bottom <= H && inScroll) {
            const top = document.elementFromPoint(cx, cy);
            if (top && top !== el && !el.contains(top) && !top.contains(el)) out.push(`ПЕРЕКРЫТА ${desc(el)} элементом ${desc(top)}`);
          }
          if (o.mobile && el.tagName === 'BUTTON' && (r.height < 24 || r.width < 24)) out.push(`МАЛЕНЬКАЯ ЦЕЛЬ ${Math.round(r.width)}×${Math.round(r.height)} ${desc(el)}`);
        }
      }
    }
    if (toasts) toasts.style.display = '';
    return out;
  }, { mobile: !!opts.mobile });
  const uniq = [...new Set(res)];
  return uniq.map((x) => `[${label}] ${x}`);
}

/* Продвинуть игру на n дней (движок напрямую), останавливаясь на событиях/шефе и ПЕРЕД 1-м числом:
   месячный расчёт проходит через настоящий игровой цикл (realTicks), чтобы сработали уведомления, сохранение и модалки. */
async function tickDays(p, n) {
  return p.evaluate((n) => {
    const S = BK.App.state; BK.App.setSpeed(0);
    let d = 0, edge = false;
    while (d < n) {
      if (BK.Engine.dateOf(S.day + 1).d === 1) { edge = true; break; }
      if (!BK.Engine.tick(S)) break; d++;
      if (S.ev.pending || S.chef.pending) break;
    }
    return { d, edge, day: S.day, ev: !!S.ev.pending, chef: !!S.chef.pending, phase: S.phase };
  }, n);
}
/* k настоящих тиков через игровой цикл (скорость ×10). */
async function realTicks(p, k = 1) {
  const d0 = await p.evaluate(() => BK.App.state.day);
  await p.evaluate(() => BK.App.setSpeed(10));
  await p.waitForFunction(([d0, k]) => BK.App.state.day >= d0 + k || BK.App.ui.modal || BK.App.state.phase !== 'play' || BK.App.state.ev.pending || BK.App.state.chef.pending, [d0, k], { timeout: 5000 }).catch(() => {});
  await p.evaluate(() => BK.App.setSpeed(0));
  await p.waitForTimeout(60);
  return (await p.evaluate(() => BK.App.state.day)) - d0;
}
async function flush(p) {
  const pending = await p.evaluate(() => BK.App.state.notify.length > 0 && BK.App.state.phase === 'play' && !BK.App.state.ev.pending && !BK.App.state.chef.pending && !BK.App.ui.modal);
  if (pending) await realTicks(p, 1);
  await p.waitForTimeout(40);
}

module.exports = { chromium, URL, VIEWPORTS, openPage, layoutCheck, tickDays, realTicks, flush };
