/* Обновляет описание репозитория на GitHub: версия + дата сборки.
   Запуск: node tools/gh-desc.js   (нужны сохранённые учётные данные git для github.com)
   Зачем: владелец просил, чтобы версия была не только в игре, но и в описании на GitHub. */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const cfg = fs.readFileSync(path.join(root, 'src', 'config.js'), 'utf8');
const num = (cfg.match(/VERSION\s*=\s*\{[^}]*num:\s*'([^']+)'/) || [])[1] || '?';
const name = (cfg.match(/VERSION\s*=\s*\{[^}]*name:\s*'([^']+)'/) || [])[1] || '';
const date = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
const desc = `Браузерный экономический симулятор сети пекарен: от бариста до федеральной сети. Версия ${num}${name ? ' (' + name + ')' : ''}, сборка ${date}.`;

const url = execFileSync('git', ['-C', root, 'config', '--get', 'remote.origin.url'], { encoding: 'utf8' }).trim();
const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
if (!m) { console.error('Не понял адрес репозитория: ' + url); process.exit(1); }
const [owner, repo] = [m[1], m[2]];

// учётные данные берём у git (связка ключей), сам токен нигде не печатаем
let cred = '';
try {
  cred = execFileSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
} catch (e) { console.error('Нет сохранённых учётных данных git для github.com — обновите описание вручную.'); process.exit(1); }
const token = (cred.match(/^password=(.*)$/m) || [])[1];
if (!token) { console.error('Токен не найден в учётных данных git.'); process.exit(1); }

fetch(`https://api.github.com/repos/${owner}/${repo}`, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'bk-tools' },
  body: JSON.stringify({ description: desc }),
}).then(async (r) => {
  if (!r.ok) { console.error('GitHub ответил ' + r.status + ': ' + (await r.text()).slice(0, 200)); process.exit(1); }
  console.log('Описание на GitHub обновлено: ' + desc);
}).catch((e) => { console.error('Не удалось: ' + e.message); process.exit(1); });
