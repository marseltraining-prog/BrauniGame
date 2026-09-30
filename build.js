// Сборка в один HTML: dist/khlebnaya-karta.html (для публикации) и dist/local.html (для локальных тестов).
// `node build.js --min` — дополнительно dist/khlebnaya-karta.min.html (JS сжат terser'ом, CSS без комментариев и пробелов) — его и публиковать.
// terser ищется обычным require (NODE_PATH, например ~/.bk-tools/node_modules) или по пути из переменной TERSER.
const fs = require('fs'), path = require('path');
const R = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const js = ['config.js', 'data/world.js', 'data/cities.js', 'data/events.js', 'data/corp-events.js', 'engine.js', 'prodstats.js', 'corp.js', 'directors.js', 'corphq.js', 'corpev.js', 'data/achievements.js', 'trainers.js', 'ui/map.js', 'ui/panels.js', 'ui/delivery.js', 'ui/menu-stats.js', 'ui/extras.js', 'ui/tutorial.js', 'ui/trainers-ui.js', 'ui/russia.js', 'ui/corp-ui.js', 'ui/app.js'].map((f) => `/* ${f} */\n` + R(f)).join('\n');
const css = R('styles.css') + '\n' + R('ui/extras.css') + '\n' + R('ui/tutorial.css') + '\n' + R('ui/trainers.css') + '\n' + R('ui/russia.css') + '\n' + R('ui/menu-stats.css') + '\n' + R('ui/delivery.css') + '\n[hidden]{display:none!important}\n';
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&family=Unbounded:wght@500;600;700&display=swap">';
const page = (c, j) => `<title>Хлебная карта</title>\n${fonts}\n<style>\n${c}</style>\n<script>\n${j.replace(/<\/script/gi, '<\\/script')}\n</script>\n`;
const content = page(css, js);
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/khlebnaya-karta.html'), content);
const local = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${content.replace('<script>', '</head><body><script>')}</body></html>`;
fs.writeFileSync(path.join(__dirname, 'dist/local.html'), local);
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
