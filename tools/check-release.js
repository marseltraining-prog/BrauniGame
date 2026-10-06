/* Последовательные проверки релиза. Браузеры нельзя запускать параллельно.
   NODE_PATH=~/.bk-tools/node_modules node tools/check-release.js
   --retry-failed повторяет упавшие проверки и сохраняет историю попыток.
   Отчёт: docs/releases/<версия>-checks.json; полные логи — tmp/release-checks/. */
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const root = path.join(__dirname, '..');
const version = require('../sim/load').CFG.VERSION.num;
const commands = [
  ['sim/perm.js'], ['qa/perm.js'], ['qa/perm.js', '@webkit'],
  ['sim/chelyabinsk.js'], ['qa/chelyabinsk.js'], ['qa/chelyabinsk.js', '@webkit'],
  ['sim/real-ufa.js'], ['qa/real-ufa.js'], ['qa/city-portraits.js'],
  ['sim/perf-big.js', '--make', 'tmp/big1000.json', '1000'], ['qa/bigsave.js', 'tmp/big1000.json'],
  ['sim/samara.js'], ['qa/samara.js'], ['qa/samara.js', '@webkit'],
  ['sim/story.js', '--all-branches', '1', '22', '--snapshots'],
  ['sim/story-choice-guard.js'], ['sim/defer-open.js'], ['sim/story-queue.js'],
  ['qa/story-branches.js'], ['qa/story-branches.js', '@webkit'],
  ['sim/story-depth.js'], ['qa/story-depth.js'], ['qa/story-depth.js', '@webkit'],
  ['qa/start-preview.js'], ['qa/start-preview.js', '@webkit'],
  ['sim/nsk.js'], ['qa/nsk.js'], ['qa/nsk.js', '@webkit'],
  ['sim/ekb.js'], ['qa/ekb.js'], ['qa/ekb.js', '@webkit'],
  ['sim/kazan.js'], ['qa/kazan.js'], ['qa/kazan.js', '@webkit'], ['sim/city-coefficients.js'],
  ['qa/start-city.js'], ['qa/start-city.js', '@webkit'],
  ['sim/start-city.js'], ['sim/start-city-corp.js'], ['sim/pro2-hooks.js'],
  ['qa/smoke.js', 'qa/shots'], ['qa/full.js'], ['qa/extras.js'], ['qa/menu.js'],
  ['qa/russia.js'], ['qa/tutorial.js'], ['qa/growth.js'], ['qa/managers.js'],
  ['qa/rewind.js'], ['qa/trainers.js'], ['qa/delivery.js'], ['qa/pixel.js'],
  ['qa/lively.js'], ['qa/collateral.js'], ['qa/investors.js'], ['qa/story.js'],
  ['qa/strategy.js'], ['qa/music.js'], ['qa/s4-sound.js'], ['qa/prologue.js'],
  ['qa/stage1.js'], ['qa/scen-ui.js'], ['qa/map-cache.js'], ['qa/render-purity.js'],
  ['qa/minified.js', 'webkit', 'min'], ['qa/minified.js', 'chromium', 'min'],
  ['qa/minified.js', 'webkit', 'min', `dist/khlebnaya-karta-${version}.html`],
  ['qa/minified.js', 'chromium', 'min', `dist/khlebnaya-karta-${version}.html`],
  ['sim/newbie.js', '8', '2'], ['sim/bot.js', 'good', '3', '18', '--summary'],
  ['sim/bot.js', 'avg', '2', '25', '--summary'], ['sim/bot.js', 'bad', '2', '5', '--summary'],
  ['sim/scencity.js', '20', '3'], ['sim/corp.js', '2', '16'], ['sim/corp-calib.js', '3'],
  ['sim/miles.js', 'good', '8', '20'], ['sim/collateral.js'], ['sim/collateral.js', 'good', '6', '22'],
  ['sim/investors.js'], ['sim/investors.js', 'good', '6', '22'],
  ['sim/story.js', 'good,avg', '12', '22', '@diagnostic'], ['sim/story.js', '--check'],
  ['sim/strat.js', '--seeds=8', '--years=22'], ['sim/prodstats.js'],
];
const logdir = path.join(root, 'tmp', 'release-checks', version);
const report = path.join(root, 'docs', 'releases', version + '-checks.json');
fs.mkdirSync(logdir, { recursive: true }); fs.mkdirSync(path.dirname(report), { recursive: true });
const retry = process.argv.includes('--retry-failed');
const forced = (process.argv.find(x => x.startsWith('--force=')) || '').slice(8).split(',').filter(Boolean);
const results = retry && fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, 'utf8')).results : [];
for (const cmd of commands) {
  const webkit = cmd.includes('@webkit'), diagnostic = cmd.includes('@diagnostic'), args = cmd.filter(x => !x.startsWith('@'));
  const label = `${webkit ? 'BR=webkit ' : ''}node ${args.join(' ')}`;
  const previous = results.find(x => x.command === label);
  if (retry && previous && (previous.exit === 0 || previous.blocking === false) && !forced.includes(args[0])) continue;
  console.log('RUN ' + label);
  const start = Date.now();
  const run = spawnSync(process.execPath, args, { cwd: root, env: { ...process.env, BR: webkit ? 'webkit' : 'chromium' }, encoding: 'utf8', timeout: +(process.env.BK_CHECK_TIMEOUT || 720000), // BK_CHECK_TIMEOUT=1800000 — медленная машина (облако)
    maxBuffer: 8 * 1024 * 1024 });
  const output = (run.stdout || '') + (run.stderr || '') + (run.error ? '\n' + run.error.message : '');
  const logfile = `${String(commands.indexOf(cmd) + 1).padStart(2, '0')}-${path.basename(args[0], '.js')}${retry ? '-retry' + ((previous && previous.attempts ? previous.attempts.length : 0) + 1) : ''}.log`;
  fs.writeFileSync(path.join(logdir, logfile), output);
  const warning = diagnostic && run.status === 1 && output.trim().endsWith('Код выхода 1.');
  const result = { command: label, exit: run.status, blocking: run.status !== 0 && !warning, diagnostic, warning, seconds: Math.round((Date.now() - start) / 1000), log: path.relative(root, path.join(logdir, logfile)), lastLines: output.trim().split('\n').slice(-8) };
  if (previous) {
    result.attempts = [...(previous.attempts || []), { exit: previous.exit, seconds: previous.seconds, log: previous.log, lastLines: previous.lastLines }];
    results[results.indexOf(previous)] = result;
  } else results.push(result);
  fs.writeFileSync(report, JSON.stringify({ version, complete: results.length === commands.length, results }, null, 2) + '\n');
  console.log(`${run.status === 0 ? 'PASS' : warning ? 'WARN' : 'FAIL'} ${label} (${result.seconds}s)`);
  if (run.status !== 0) console.log(result.lastLines.join('\n'));
}
const failed = results.filter(x => x.exit !== 0 && x.blocking !== false);
const warnings = results.filter(x => x.warning);
console.log(`RELEASE ${version}: ${results.filter(x => x.exit === 0).length}/${results.length} passed, ${warnings.length} diagnostic warnings, ${failed.length} blocking failures; ${path.relative(root, report)}`);
process.exitCode = failed.length ? 1 : 0;
