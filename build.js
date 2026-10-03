// Сборка в один HTML: dist/khlebnaya-karta.html (для публикации) и dist/local.html (для локальных тестов).
// `node build.js --min` — дополнительно dist/khlebnaya-karta.min.html (JS сжат terser'ом, CSS без комментариев и пробелов) — его и публиковать.
// terser ищется обычным require (NODE_PATH, например ~/.bk-tools/node_modules) или по пути из переменной TERSER.
const fs = require('fs'), path = require('path');
const R = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const js = ['config.js', 'data/story.js', 'data/scenarios.js', 'data/prolog-v2.js', 'data/scen-legacy.js', 'data/scen-rescue.js', 'data/scen-crisis.js', 'data/scen-moscow.js', 'data/story-war.js', 'data/story-russia.js', 'data/story-bridges.js', 'data/story-lines.js', 'data/world.js', 'data/cities.js', 'data/events.js', 'data/corp-events.js', 'data/strat-events.js', 'engine.js', 'prodstats.js', 'corp.js', 'directors.js', 'corphq.js', 'corpev.js', 'data/achievements.js', 'trainers.js', 'managers.js', 'growth.js', 'rewind.js', 'collateral.js', 'investors.js', 'story.js', 'threads.js', 'strategy.js', 'scenario.js', 'sound.js', 'pwa.js', 'milestones.js', 'thoughts.js', 'prologue.js', 'pixel/px.js', 'pixel/cast.js', 'pixel/stage.js', 'pixel/scenes.js', 'pixel/store.js', 'pixel/live.js', 'stage1.js', 'ui/map.js', 'ui/panels.js', 'ui/delivery.js', 'ui/menu-stats.js', 'ui/extras.js', 'ui/rewind-ui.js', 'ui/tutorial.js', 'ui/trainers-ui.js', 'ui/managers-ui.js', 'ui/growth-ui.js', 'ui/lively-ui.js', 'ui/collateral-ui.js', 'ui/investors-ui.js', 'ui/story-ui.js', 'ui/story-history.js', 'ui/threads-ui.js', 'ui/strategy-ui.js', 'ui/scenario-ui.js', 'ui/russia.js', 'ui/corp-ui.js', 'ui/prologue.js', 'ui/stage1.js', 'ui/app.js', 'data/guests.js'].map((f) => `/* ${f} */\n` + R(f)).join('\n');
const css = R('styles.css') + '\n' + R('ui/extras.css') + '\n' + R('ui/tutorial.css') + '\n' + R('ui/trainers.css') + '\n' + R('ui/managers.css') + '\n' + R('ui/growth.css') + '\n' + R('lively.css') + '\n' + R('ui/collateral.css') + '\n' + R('ui/investors.css') + '\n' + R('ui/story.css') + '\n' + R('ui/threads.css') + '\n' + R('ui/strategy.css') + '\n' + R('ui/scenario.css') + '\n' + R('ui/russia.css') + '\n' + R('ui/menu-stats.css') + '\n' + R('ui/delivery.css') + '\n' + R('ui/rewind.css') + '\n' + R('ui/prologue.css') + '\n' + R('pixel/pixel.css') + '\n' + R('ui/stage1.css') + '\n[hidden]{display:none!important}\n';
// Шрифты грузим НЕ блокируя показ страницы: обычный <link rel="stylesheet"> держит белый экран, пока
// Google Fonts не ответит, — а он бывает медленным или недоступным (у владельца из-за этого был белый экран
// в Safari, а в тестах этого не видели, потому что там шрифты специально блокируются).
// media="print" + onload → браузер рисует игру сразу системным шрифтом, а когда шрифты придут — подменяет.
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&family=Unbounded:wght@500;600;700&display=swap';
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + '<link rel="stylesheet" href="' + FONT_URL + '" media="print" onload="this.media=\'all\'">'
  + '<noscript><link rel="stylesheet" href="' + FONT_URL + '"></noscript>';
// Если игра не запустилась (ошибка в скрипте), вместо белого экрана показываем причину текстом.
// Это важно для Safari: раньше владелец видел просто пустую страницу и не мог сказать, что случилось.
const GUARD = `<script>(function(){
  function show(text){ try{ var d=document.getElementById('bk-fail'); if(!d){ d=document.createElement('div'); d.id='bk-fail';
    d.style.cssText='position:fixed;inset:0;z-index:99999;background:#fff;color:#a3301c;font:14px/1.6 ui-monospace,Menlo,monospace;padding:20px;white-space:pre-wrap;overflow:auto';
    (document.body||document.documentElement).appendChild(d); }
    d.textContent='Игра не запустилась. Покажите это сообщение разработчику:\\n\\n'+text; }catch(e){} }
  window.addEventListener('error', function(e){
    var t = e && e.target;
    if (t && t !== window && t.tagName && t.tagName !== 'SCRIPT') return; // не загрузились шрифты или картинка — это не ошибка игры
    show((e && (e.message || (e.error && e.error.message)) || 'неизвестная ошибка') + '\\n' + (e && e.filename ? e.filename : '') + (e && e.lineno ? ':' + e.lineno : ''));
  }, true);
  window.addEventListener('unhandledrejection', function(e){ show('обещание отклонено: ' + (e.reason && e.reason.message || e.reason)); });
  setTimeout(function(){ try{ if(!document.querySelector('#app *') && !document.querySelector('#start')) show('скрипт не создал интерфейс за 10 секунд (возможно, он очень медленный или заблокирован)'); }catch(e){} }, 10000);
})();</script>`;
// дата сборки — чтобы владелец мог убедиться, что открыл свежую версию
const BUILD_DATE = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const page = (c, j) => `${GUARD.replace('</script>', 'window.__BK_BUILD=' + JSON.stringify(BUILD_DATE) + ';</script>')}<title>Хлебная карта</title>\n${fonts}\n<style>\n${c}</style>\n<script>\n${j.replace(/<\/script/gi, '<\\/script')}\n</script>\n`;
const content = page(css, js);
// Проверка синтаксиса всех встроенных скриптов: сборка не должна выпускать файл с ошибкой
// (однажды опечатка в защитном скрипте ломала его, и ошибка всплыла только в тестах).
function checkScripts(html, where) {
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m, n = 0, bad = 0;
  while ((m = re.exec(html))) {
    n++;
    try { new Function(m[1]); } catch (e) { bad++; console.error('ОШИБКА СИНТАКСИСА в скрипте №' + n + ' (' + where + '): ' + e.message); }
  }
  if (bad) { console.error('Сборка содержит ' + bad + ' скрипт(ов) с ошибкой синтаксиса — публиковать нельзя.'); process.exitCode = 1; }
  return n;
}
// Версия и дата сборки — в README (владелец просил, чтобы версия была и в описании на GitHub).
function stampReadme() {
  try {
    const f = path.join(__dirname, 'README.md');
    const src = fs.readFileSync(path.join(__dirname, 'src', 'config.js'), 'utf8');
    const num = (src.match(/VERSION\s*=\s*\{[^}]*num:\s*'([^']+)'/) || [])[1] || '?';
    const name = (src.match(/VERSION\s*=\s*\{[^}]*name:\s*'([^']+)'/) || [])[1] || '';
    let md = fs.readFileSync(f, 'utf8');
    md = md.replace(/^\*\*Версия .*<!-- bk:version -->$/m, `**Версия ${num}${name ? ' (' + name + ')' : ''} · сборка ${BUILD_DATE}** <!-- bk:version -->`);
    fs.writeFileSync(f, md);
  } catch (e) { console.warn('README не обновлён: ' + e.message); }
}
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/khlebnaya-karta.html'), content);
const local = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${content.replace('<script>', '</head><body><script>')}</body></html>`;
fs.writeFileSync(path.join(__dirname, 'dist/local.html'), local);
stampReadme();
checkScripts(content, 'khlebnaya-karta.html');
console.log('built', (content.length / 1024).toFixed(0) + ' KB');

if (process.argv.includes('--min')) {
  let terser = null;
  for (const id of [process.env.TERSER, 'terser'].filter(Boolean)) {
    try { terser = require(id); break; } catch (e) { /* пробуем дальше */ }
  }
  if (!terser) {
    console.error('Сжатая версия НЕ собрана: terser не найден.\n' +
      '  Mac: export NODE_PATH=~/.bk-tools/node_modules и повторить node build.js --min\n' +
      '  или: (cd /tmp && npm i --no-save terser) && TERSER=/tmp/node_modules/terser node build.js --min\n' +
      'Обычные файлы dist/khlebnaya-karta.html и dist/local.html собраны.');
    process.exitCode = 1;
  } else {
    // CSS: без комментариев и лишних пробелов. Пробел перед «:» не трогаем — «.a :hover» и «.a:hover» разные селекторы.
    const minCss = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').replace(/:\s+/g, ':').trim();
    terser.minify(js, { ecma: 2019, mangle: true, format: { comments: false } }).then((r) => {
      const out = page(minCss + '\n', r.code);
      fs.writeFileSync(path.join(__dirname, 'dist/khlebnaya-karta.min.html'), out);
      console.log('min', (out.length / 1024).toFixed(0) + ' KB -> dist/khlebnaya-karta.min.html');
    }).catch((e) => { console.error('Ошибка сжатия:', e && e.message || e); process.exitCode = 1; });
  }
}
