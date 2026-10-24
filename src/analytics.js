/* Статистика публичной версии на GitHub Pages: Яндекс Метрика, счётчик 113767534.
   Работает ТОЛЬКО на marseltraining-prog.github.io: локальный файл и тесты не делают сетевых запросов.
   Если счётчик не загрузился (офлайн, блокировщик), игра работает как обычно. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const ID = 113767534, HOST = 'marseltraining-prog.github.io';
  const on = typeof location !== 'undefined' && location.hostname === HOST;
  if (!on) { BK.Analytics = { on: false, goal: () => false }; return; }
  // очередь-заглушка, пока грузится tag.js
  window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
  window.ym.l = 1 * new Date();
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (let j = 0; j < document.scripts.length; j++) if (document.scripts[j].src === r) return;
    k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + ID, 'ym');
  try {
    ym(ID, 'init', { ssr: true, webvisor: false, clickmap: true, ecommerce: 'dataLayer', referrer: document.referrer, url: location.href, accurateTrackBounce: true, trackLinks: true });
  } catch (e) {}
  const seen = new Set();
  function goal(name) {
    if (!name || seen.has(name)) return false;   // одна цель за сессию: не накручиваем сами себя
    seen.add(name);
    try { ym(ID, 'reachGoal', name); return true; } catch (e) { return false; }
  }
  // плашка про cookie: показываем один раз, не мешает игре
  function notice() {
    try { if (localStorage.getItem('bk-metrica-ok') === '1') return; } catch (e) {}
    const d = document.createElement('div');
    d.id = 'bk-cookie';
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9998;max-width:640px;margin:0 auto;background:#fffaf2;color:#3d342b;border:1px solid #e2d6c4;border-radius:14px;padding:12px 14px;font:13px/1.45 "Golos Text",system-ui,sans-serif;box-shadow:0 8px 24px rgba(60,40,20,.18);display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    d.innerHTML = '<span style="flex:1;min-width:220px">Игра использует cookie и Яндекс Метрику — только чтобы считать заходы и дохождения. Без рекламы и без личных данных.</span><button type="button" style="border:0;border-radius:10px;padding:8px 14px;background:#b5653c;color:#fff;font:inherit;font-weight:600">Понятно</button>';
    d.querySelector('button').addEventListener('click', () => { try { localStorage.setItem('bk-metrica-ok', '1'); } catch (e) {} d.remove(); });
    document.body.appendChild(d);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', notice); else setTimeout(notice, 800);
  BK.Analytics = { on: true, goal };
})();
