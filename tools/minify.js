// Устарело: сжатие встроено в build.js. Этот файл оставлен для совместимости и просто вызывает `node build.js --min`.
// Результат: dist/khlebnaya-karta.min.html — его и публиковать. terser — из NODE_PATH (Mac: ~/.bk-tools/node_modules) или переменной TERSER.
process.argv.push('--min');
require('../build.js');
