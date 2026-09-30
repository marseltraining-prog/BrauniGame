// Сборка в один HTML: dist/khlebnaya-karta.html (для публикации) и dist/local.html (для локальных тестов)
const fs = require('fs'), path = require('path');
const R = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const js = ['config.js', 'data/world.js', 'data/cities.js', 'data/events.js', 'data/corp-events.js', 'engine.js', 'corp.js', 'directors.js', 'data/achievements.js', 'ui/map.js', 'ui/panels.js', 'ui/extras.js', 'ui/russia.js', 'ui/corp-ui.js', 'ui/app.js'].map((f) => `/* ${f} */\n` + R(f)).join('\n');
const css = R('styles.css') + '\n' + R('ui/extras.css') + '\n' + R('ui/russia.css') + '\n[hidden]{display:none!important}\n';
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&family=Unbounded:wght@500;600;700&display=swap">';
const content = `<title>Хлебная карта</title>\n${fonts}\n<style>\n${css}</style>\n<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n`;
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/khlebnaya-karta.html'), content);
const local = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${content.replace('<script>', '</head><body><script>')}</body></html>`;
fs.writeFileSync(path.join(__dirname, 'dist/local.html'), local);
console.log('built', (content.length / 1024).toFixed(0) + ' KB');
