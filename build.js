// Сборка в один HTML: dist/khlebnaya-karta.html (для публикации) и dist/local.html (для локальных тестов).
// `node build.js --min` — сжатый фрагмент и полный dist/khlebnaya-karta-<версия>.html для скачивания.
// terser ищется обычным require (NODE_PATH, например ~/.bk-tools/node_modules) или по пути из переменной TERSER.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const R = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const js = ['config.js', 'data/story.js', 'data/story-cast.js', 'data/scenarios.js', 'data/prolog-v2.js', 'data/scen-legacy.js', 'data/scen-rescue.js', 'data/scen-crisis.js', 'data/scen-moscow.js', 'data/story-war.js', 'data/story-russia.js', 'data/story-bridges.js', 'data/story-lines.js', 'data/world.js', 'data/cities.js', 'data/events.js', 'data/events-life.js', 'data/corp-events.js', 'data/strat-events.js', 'engine.js', 'prodstats.js', 'corp.js', 'directors.js', 'corphq.js', 'corpev.js', 'data/achievements.js', 'trainers.js', 'managers.js', 'growth.js', 'rewind.js', 'collateral.js', 'investors.js', 'story.js', 'threads.js', 'strategy.js', 'scenario.js', 'start-city.js', 'sound.js', 'pwa.js', 'milestones.js', 'thoughts.js', 'prologue.js', 'pixel/px.js', 'pixel/cast.js', 'pixel/stage.js', 'pixel/scenes.js', 'pixel/store.js', 'pixel/coffee.js', 'pixel/live.js', 'stage1.js', 'ui/choice-impact.js', 'ui/map.js', 'ui/panels.js', 'ui/delivery.js', 'ui/menu-stats.js', 'ui/extras.js', 'ui/rewind-ui.js', 'ui/tutorial.js', 'ui/trainers-ui.js', 'ui/managers-ui.js', 'ui/growth-ui.js', 'ui/lively-ui.js', 'ui/collateral-ui.js', 'ui/investors-ui.js', 'ui/story-ui.js', 'ui/story-history.js', 'ui/threads-ui.js', 'ui/strategy-ui.js', 'ui/scenario-ui.js', 'ui/russia.js', 'ui/corp-ui.js', 'ui/prologue.js', 'ui/stage1.js', 'data/city-arms.js', 'ui/app.js', 'data/guests.js', 'ui/moment.js', 'data/cities-big.js', 'data/city-kazan.js', 'data/city-ekb.js', 'data/city-nsk.js', 'data/city-samara.js', 'data/city-chelyabinsk.js'].map((f) => `/* ${f} */\n` + R(f)).join('\n');
const css = R('styles.css') + '\n' + R('ui/extras.css') + '\n' + R('ui/tutorial.css') + '\n' + R('ui/trainers.css') + '\n' + R('ui/managers.css') + '\n' + R('ui/growth.css') + '\n' + R('lively.css') + '\n' + R('ui/collateral.css') + '\n' + R('ui/investors.css') + '\n' + R('ui/story.css') + '\n' + R('ui/threads.css') + '\n' + R('ui/moment.css') + '\n' + R('ui/strategy.css') + '\n' + R('ui/scenario.css') + '\n' + R('ui/russia.css') + '\n' + R('ui/menu-stats.css') + '\n' + R('ui/delivery.css') + '\n' + R('ui/rewind.css') + '\n' + R('ui/prologue.css') + '\n' + R('pixel/pixel.css') + '\n' + R('ui/stage1.css') + '\n[hidden]{display:none!important}\n';
// Шрифты лежат внутри игры (src/fonts/*.woff2 → base64 в @font-face): интернет не нужен совсем, и белого
// экрана из-за медленного Google Fonts (как было у владельца в Safari) больше не бывает. font-display: swap —
// пока шрифт разбирается, текст уже виден системным. Описание шрифтов и подмножеств — src/fonts/fonts.css.
const fonts = '<style>' + R('fonts/fonts.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\(([\w-]+\.woff2)\)/g, (m, f) =>
  'url(data:font/woff2;base64,' + fs.readFileSync(path.join(__dirname, 'src', 'fonts', f)).toString('base64') + ')').replace(/\n+/g, '\n').trim() + '</style>';
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
// Дата сборки должна зависеть только от входов: SOURCE_DATE_EPOCH имеет приоритет,
// иначе используем timestamp текущего Git-коммита. Это делает повторные сборки
// одного состояния побайтно одинаковыми и не требует менять README.
function buildEpoch() {
  const sourceEpoch = Number(process.env.SOURCE_DATE_EPOCH);
  if (Number.isFinite(sourceEpoch) && sourceEpoch >= 0 && String(process.env.SOURCE_DATE_EPOCH || '').trim()) return sourceEpoch;
  try {
    const commitEpoch = Number(execFileSync('git', ['log', '-1', '--format=%ct'], {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim());
    if (Number.isFinite(commitEpoch) && commitEpoch >= 0) return commitEpoch;
  } catch (_) { /* архив без .git: дата останется неизвестной, но стабильной */ }
  return null;
}
function formatBuildDate(epoch) {
  if (epoch == null) return 'не указана';
  const d = new Date(epoch * 1000), p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}
const BUILD_DATE = formatBuildDate(buildEpoch());
// Единственная версия в config.js; README получает ту же дату, что и игра.
const version = R('config.js').match(/BK\.CFG\.VERSION\s*=\s*\{\s*num:\s*'([^']+)',\s*name:\s*'([^']+)'/);
const readmePath = path.join(__dirname, 'README.md');
if (version && fs.existsSync(readmePath)) {
  const readme = fs.readFileSync(readmePath, 'utf8');
  const next = readme.replace(/^.*<!-- bk:version -->.*$/m, `**Версия ${version[1]} (${version[2]}) · сборка ${BUILD_DATE}** <!-- bk:version -->`);
  if (next !== readme) fs.writeFileSync(readmePath, next);
}
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
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/khlebnaya-karta.html'), content);
const local = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${content.replace('<script>', '</head><body><script>')}</body></html>`;
fs.writeFileSync(path.join(__dirname, 'dist/local.html'), local);
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
      // Для скачивания с GitHub нужен полный документ с viewport, а не фрагмент Artifact.
      const standalone = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n' + out + '\n</body></html>';
      const assetName = `khlebnaya-karta-${version ? version[1] : 'beta'}.html`;
      checkScripts(standalone, assetName);
      fs.writeFileSync(path.join(__dirname, 'dist', assetName), standalone);
      console.log('min', (out.length / 1024).toFixed(0) + ' KB -> dist/khlebnaya-karta.min.html');
    }).catch((e) => { console.error('Ошибка сжатия:', e && e.message || e); process.exitCode = 1; });
  }
}
