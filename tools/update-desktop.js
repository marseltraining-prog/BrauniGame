/* После публикации релиза: node tools/update-desktop.js.
   Обновляет прежний HTML на рабочем столе, сохраняя имя файла и его атрибуты. */
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'src/config.js'), 'utf8');
const version = config.match(/VERSION\s*=\s*\{[^}]*num:\s*'([^']+)'/)[1];
const source = path.join(root, 'dist', `khlebnaya-karta-${version}.html`);
const target = path.join(os.homedir(), 'Desktop', 'Хлебная карта.html');
if (!fs.existsSync(source)) throw Error('Нет полного HTML релиза: сначала node build.js --min');
const data = fs.readFileSync(source), html = data.toString('utf8');
if (!/^<!doctype html>/i.test(html) || !html.includes(`num:"${version}"`)) throw Error('HTML не соответствует текущей версии');
if (fs.existsSync(target) && !fs.lstatSync(target).isFile()) throw Error('Ожидался обычный HTML на рабочем столе: ' + target);
fs.writeFileSync(target, data);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (sha(fs.readFileSync(target)) !== sha(data)) throw Error('Копия на рабочем столе не совпадает с релизом');
console.log(`Рабочий стол обновлён: ${target} · ${version} · SHA256 ${sha(data)}`);
