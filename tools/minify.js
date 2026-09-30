// Сжатая сборка для публикации (в Safari несжатая ~820 КБ давала белый экран).
// Использование: node build.js && (cd /tmp && npm i --no-save terser) && TERSER=/tmp/node_modules/terser node tools/minify.js
// Результат: dist/khlebnaya-karta.min.html — его и публиковать.
const fs = require('fs'), path = require('path');
const { minify } = require(process.env.TERSER || 'terser');
(async () => {
  const src = path.join(__dirname, '..', 'dist', 'khlebnaya-karta.html');
  const h = fs.readFileSync(src, 'utf8');
  const s0 = h.indexOf('<script>'), s1 = h.lastIndexOf('</script>');
  const r = await minify(h.slice(s0 + 8, s1), { ecma: 2019, mangle: true, format: { comments: false } });
  const c0 = h.indexOf('<style>'), c1 = h.indexOf('</style>');
  const css = h.slice(c0 + 7, c1).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};:,>])\s*/g, '$1');
  const out = h.slice(0, c0 + 7) + css + h.slice(c1, s0 + 8) + r.code.replace(/<\/script/gi, '<\\/script') + h.slice(s1);
  fs.writeFileSync(src.replace('.html', '.min.html'), out);
  console.log((h.length / 1024 | 0) + ' КБ -> ' + (out.length / 1024 | 0) + ' КБ');
})();
