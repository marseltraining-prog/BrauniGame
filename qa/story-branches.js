/* Real pending scenes captured by sim/story.js --all-branches.
   Requires a complete, reviewed coverage manifest; never fabricates scene flags.
   Run sequentially after the CLI coverage: NODE_PATH=... node qa/story-branches.js
   BR=webkit selects WebKit. Each invocation covers both genders/themes/viewports. */
const fs = require('fs'), path = require('path');
const { chromium, webkit } = require('playwright');
const { openPage, layoutCheck } = require('./lib');
const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'docs/story-branches-coverage.json');
const out = process.argv[2] || path.join(__dirname, 'shots/story-branches');
const issues = []; let checks = 0;
function ok(v, label) { checks++; if (!v) issues.push(label); }
function readManifest() {
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const targets = m.successfulTargets || m.targets;
  if (m.complete !== true || !Array.isArray(targets) || !targets.length) throw new Error('Complete successfulTargets/targets manifest required');
  const byScene = new Map();
  for (const t of targets) {
    if (!t.scene || !Number.isInteger(t.choice) || !Number.isInteger(t.actualSeed) || !t.stateFile) throw new Error('Invalid manifest target ' + JSON.stringify(t));
    const file = path.resolve(root, t.stateFile), state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!state.story || !state.story.pending || state.story.pending.id !== t.scene || state.seed !== t.actualSeed) throw new Error('Snapshot does not match target: ' + file);
    if (!byScene.has(t.scene)) byScene.set(t.scene, { ...t, state });
  }
  return { manifest: m, targets, representatives: [...byScene.values()] };
}
const thorough = new Set(['sf1', 'sf1b', 'sf2', 's31', 's41', 's44', 'kd2', 'kd3', 'kf3', 'kf4', 'mosBank', 'mos6', 'sr3', 'kc4']);
async function loaded(p, state, gender, dark) {
  return p.evaluate(({ state, gender, dark }) => {
    BK.App.setSpeed(0); BK.App.closeModal();
    // Native slot load restores map/corporate context and UI caches as in Continue.
    localStorage.setItem(BK.Slots.key(), JSON.stringify(state));
    BK.App.ACT.continue(); BK.App.setSpeed(0);
    BK.App.ACT.theme({ arg: dark ? 'dark' : 'light' });
    const S = BK.App.state;
    BK.Story.heroSet(S, { name: 'Александра-Екатерина Оченьдлиннаяфамилия', g: gender });
    BK.App.save();
    const sc = BK.Story.pendingScene(S);
    return { id: sc && sc.id, day: S.day, choices: sc && sc.choices.length, form: sc && sc.form,
      allowed: sc && sc.choices.map(c => BK.Story.canChoose(S, c.need)), hero: BK.Story.heroOf(S) };
  }, { state, gender, dark });
}
async function reloadNative(p) {
  await p.reload();
  await p.click('[data-act=continue]');
  await p.evaluate(() => { BK.App.setSpeed(0); BK.App.closeModal(); });
}
async function advanceToChoices(p, count) {
  for (let n = 0; n < 80; n++) {
    if (await p.locator('#modal [data-act=storyPick]').count() === count) return;
    const next = p.locator('#modal [data-act=storyNext]');
    if (!await next.count()) throw new Error('Scene has neither expected choices nor Next');
    await next.click();
  }
  throw new Error('Scene exceeds 80 dialogue lines');
}
async function inspect(p, label, meta, target) {
  const r = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#modal [data-act=storyPick]')];
    return { text: document.querySelector('#modal').innerText, overflow: document.documentElement.scrollWidth > innerWidth + 1,
      rows: rows.map(b => {
        const chips = [...b.querySelectorAll('[data-strength]')], rect = b.getBoundingClientRect();
        return { idx: +b.dataset.arg, disabled: b.disabled, why: !!b.querySelector('.cwhy,.st-need'),
          width: rect.width, within: rect.left >= -1 && rect.right <= innerWidth + 1,
          desc: !!b.querySelector('.cd,.st-desc'), valid: chips.every(c => /^[0-3]$/.test(c.dataset.strength) && !c.matches('.up,.dn,.good,.bad')),
          sorted: chips.every((c, i) => !i || +chips[i - 1].dataset.strength >= +c.dataset.strength),
          chipText: chips.map(c => c.textContent + ' ' + c.title).join(' ') };
      }) };
  });
  ok(r.rows.length === meta.choices, label + ': all choices displayed');
  ok(!r.overflow && r.rows.every(b => b.within && b.width >= 130), label + ': choices fit screen');
  ok(!/\{[^}]+\}|undefined|NaN|Infinity|\[object Object\]/.test(r.text), label + ': text substitutions');
  ok(r.rows.every(b => b.disabled === !meta.allowed[b.idx]), label + ': UI and core eligibility agree');
  ok(r.rows.every(b => !b.disabled || b.why), label + ': disabled choices explain why');
  ok(r.rows.every(b => b.valid && b.sorted && !b.desc && !/[▲▼]|(?:^|\s)[+−-]\s*\d|лучше|хуже/i.test(b.chipText)), label + ': unsigned neutral effects');
  ok(meta.allowed[target.choice] === true, label + ': representative is legal');
}
async function resolution(p, target, meta, label, reload) {
  const pre = await p.evaluate(() => {
    const S = BK.App.state;
    return { day: S.day, seen: BK.Story.state(S).seen, log: BK.Story.state(S).log.length };
  });
  if (meta.form === 'moment') {
    const button = p.locator('[data-act=momNext]');
    await button.waitFor({ state: 'visible' });
    await p.waitForFunction(() => !!document.querySelector('.mom-ready'));
    await button.click();
    await p.waitForFunction(id => BK.Story.state(BK.App.state).seen[id] != null, target.scene);
    ok(target.choice === 0, label + ': Moment implicit choice zero');
  } else {
    const button = p.locator(`#modal [data-act=storyPick][data-arg="${target.choice}"]`);
    await button.click({ trial: true }); await button.click();
    if (await p.locator('#modal .modal-h h2').count() && /Закончить историю/.test(await p.locator('#modal .modal-h h2').innerText())) {
      await p.locator(`#modal [data-act=storyPick][data-arg="${target.choice}"]`).click();
    }
  }
  const after = await p.evaluate(({ scene, choice }) => {
    const S = BK.App.state, R = BK.Story.state(S), sc = BK.Story.scene(scene);
    const serial = JSON.stringify(S), duplicate = BK.Story.resolve(S, choice);
    const same = serial === JSON.stringify(S);
    BK.App.save();
    return { day: S.day, seen: R.seen[scene], pending: R.pending && R.pending.id,
      duplicate: duplicate.ok, same, ending: S.storyEnding || null,
      expectedEnding: (sc.choices[choice].effects || []).find(f => f.t === 'ending')?.id || null,
      lost: S.lost, hero: BK.Story.heroOf(S), cash: S.cash, flags: R.f, perks: R.perks, queue: R.queue };
  }, { scene: target.scene, choice: target.choice });
  ok(after.seen === pre.day && after.day === pre.day && after.pending !== target.scene, label + ': resolved real pending exactly once');
  ok(!after.duplicate && after.same, label + ': duplicate resolution is pure rejection');
  ok(!after.expectedEnding || (after.ending === after.expectedEnding && after.lost), label + ': terminal choice');
  if (reload) {
    await reloadNative(p);
    const restored = await p.evaluate(id => {
      const S = BK.App.state, R = BK.Story.state(S);
      return { seen: R.seen[id], day: S.day, cash: S.cash, ending: S.storyEnding || null, hero: BK.Story.heroOf(S), flags: R.f, perks: R.perks, queue: R.queue };
    }, target.scene);
    ok(['seen','day','cash','ending','hero','flags','perks','queue'].every(k => JSON.stringify(restored[k]) === JSON.stringify(after[k])), label + ': resolved effects survive native reload');
  }
}
(async () => {
  const coverage = readManifest(), type = process.env.BR === 'webkit' ? webkit : chromium;
  fs.mkdirSync(out, { recursive: true });
  const browser = await type.launch();
  try {
    for (const vp of ['d1440','m360']) for (const dark of [false,true]) for (const gender of ['m','f']) {
      const config = `${type.name()}-${vp}-${dark ? 'dark' : 'light'}-${gender}`;
      console.log(config);
      const p = await openPage(browser, vp, { dark, seed: 7919 });
      await p.emulateMedia({ reducedMotion: 'reduce' });
      const catalog = await p.evaluate(() => BK.Story.scenes().map(s => ({ id: s.id, n: s.choices.length })));
      const keys = new Set(coverage.targets.map(t => t.scene + ':' + t.choice));
      ok(catalog.length === 123 && coverage.representatives.length === catalog.length, config + ': all 123 scenes have actual snapshots');
      ok(catalog.every(s => coverage.representatives.some(t => t.scene === s.id) && Array.from({ length: s.n }, (_, i) => keys.has(s.id + ':' + i)).every(Boolean)), config + ': manifest covers every catalog choice');
      for (const target of coverage.representatives) {
        const label = config + '/' + target.scene;
        const meta = await loaded(p, target.state, gender, dark);
        ok(meta.id === target.scene && meta.day === target.state.day, label + ': original legal pending loaded');
        const nativeReload = vp === 'd1440' && !dark && gender === 'm';
        if (nativeReload) {
          await reloadNative(p);
          const retained = await p.evaluate(() => ({ pending: BK.Story.state(BK.App.state).pending, hero: BK.Story.heroOf(BK.App.state), day: BK.App.state.day }));
          ok(retained.pending && retained.pending.id === target.scene && retained.day === meta.day && JSON.stringify(retained.hero) === JSON.stringify(meta.hero), label + ': pending/hero survive native reload');
        }
        await p.evaluate(() => BK.App.ACT.story());
        if (meta.form !== 'moment') {
          await advanceToChoices(p, meta.choices); await inspect(p, label, meta, target);
          if (thorough.has(target.scene)) {
            issues.push(...await layoutCheck(p, label, { mobile: vp === 'm360', root: '#modal .modal' })); checks++;
            if (gender === 'f') await p.locator('#modal .modal').screenshot({ path: path.join(out, config + '-' + target.scene + '.png') });
          }
        } else {
          ok(meta.choices === 1 && meta.allowed[0], label + ': Moment has one legal real choice');
        }
        await resolution(p, target, meta, label, nativeReload);
      }
      issues.push(...p.errs.map(e => config + ': ' + e));
      await p.context().close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, type.name() + '-checks.json'), JSON.stringify({ checks, issues, scenes: coverage.representatives.length,
    coverageManifest: manifestPath, limitations: ['Browser clicks one legally reached representative choice per scene; CLI verifies effects of every choice.', 'Full layout/contrast audit targets long and branch-sensitive windows; every scene receives geometry/eligibility/neutrality checks.', 'Moment animation uses the supported reduced-motion mode.'] }, null, 2));
  console.log(`${checks} checks, ${issues.length} issues`);
  if (issues.length) console.error(issues.join('\n'));
  process.exitCode = issues.length ? 1 : 0;
})().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
