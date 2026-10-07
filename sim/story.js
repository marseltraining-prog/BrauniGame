/* =====================================================================
   СЮЖЕТ: проверка ботами (docs/story.md §9.4, этап В4 плана).

   Что делает:
     1. боты со стилями выбора в сценах (good / avg / bad и стилевые профили
        care / risk / pact / cold / random) — сами разрешают сцены через BK.Story.resolve;
     2. счёт сцен за игру: сколько, по каким главам, самый длинный промежуток без сюжета,
        гистограмма «сцен за игровой час» (модель времени CFG.STORY.SIM_MIN_PER_MONTH:
        Уфа 1,3 / Россия 1,5 мин за игровой месяц), пересечения сцен с событиями и окном шефа;
     3. достижимость развилок: --force=id:idx и --all-branches;
     4. баланс: --balance — медиана года победы good с сюжетом и без (±0,5 года по §9.4 п. 6);
     5. самопроверка каркаса и текстов реплик: --check.

   Запуск:
     node sim/story.js                          — good, 6 сидов, 22 года (и краткая справка)
     node sim/story.js good,avg 12 22           — основной прогон из docs/story.md §9.4 п. 2
     node sim/story.js care,risk,pact,cold 8 22 — стилевые профили
     node sim/story.js good 4 22 --force=s25:1 --brief
     node sim/story.js --all-branches 4 22      — перебор вариантов развилок
     node sim/story.js good 6 22 --balance      — сюжет против «без сюжета»
     node sim/story.js --lines 3 22             — реплики в отчёте месяца: выбор, подстановки, лимит
     node sim/story.js --check                  — проверки каркаса и текстов реплик

   Сюжет включён этим файлом (sim/load.js по умолчанию его выключает, чтобы канонические
   прогоны ботов первого акта оставались прежними). ГСЧ сюжета свой (S.story.rng), основной
   поток случайностей не трогается.

   Код выхода 1: есть сцена, которой не увидел никто (или не сработала зависимость ветки
   в --all-branches), либо провалилась --check. Цели темпа §9.4 п. 2 печатаются как ✓/✗,
   но код выхода не меняют: пока в игре только 5 сцен главы 2, цели полного сюжета недостижимы
   (--strict поднимает и их).
   ===================================================================== */
process.env.BK_STORY = process.env.BK_STORY || '1';
if (process.argv.slice(2).some(a => /^--(?:all-branches|allbranches)(=|$)/.test(a))) process.env.BK_THREADS = '1';
if (process.env.BK_STORY) delete require.cache[require.resolve('./load')];
const BK = require('./load');
// реплики не входят в sim/load.js (это данные интерфейса) — подключаем вручную и проверяем
try { delete require.cache[require.resolve('../src/data/story-lines.js')]; require('../src/data/story-lines.js'); } catch (e) { /* реплик нет — не беда */ }
if (!BK.Story) { delete require.cache[require.resolve('../src/story.js')]; require('../src/story.js'); }
const { play } = require('./bot');
const E = BK.Engine, CFG = BK.CFG, ST = BK.Story;

/* ======================= аргументы ======================= */
const argv = process.argv.slice(2);
const flags = {}, pos = [];
for (const a of argv) {
  if (a.startsWith('--')) { const eq = a.indexOf('='); const k = eq < 0 ? a.slice(2) : a.slice(2, eq); flags[k] = eq < 0 ? true : a.slice(eq + 1); }
  else pos.push(a);
}
const LEVELS = ['good', 'avg', 'bad'];
const STYLES = {
  care: { policy: 'care', level: 'good' },
  risk: { policy: 'risk', level: 'good', reserve: 0 },
  pact: { policy: 'pact', level: 'good' },
  cold: { policy: 'cold', level: 'bad' },
  random: { policy: 'random', level: 'avg' },
};
function profileOf(tok) {
  const parts = String(tok).split(':');
  const name = parts[0], lvl = parts[1];
  if (LEVELS.indexOf(name) >= 0) return { name, level: name, policy: name, label: name };
  const s = STYLES[name];
  if (!s) return null;
  return { name, level: lvl || s.level, policy: s.policy, reserve: s.reserve, label: tok };
}
function parseForce(v) {
  const out = {};
  if (!v || v === true) return out;
  for (const part of String(v).split(',')) {
    const kv = part.split(':');
    if (kv[0]) out[kv[0]] = Math.max(0, +(kv[1] || 0));
  }
  return out;
}

const profileToks = (pos[0] || 'good').split(',').map((x) => x.trim()).filter(Boolean);
const profiles = profileToks.map(profileOf);
const badToks = profileToks.filter((t) => !profileOf(t));
const seeds = Math.max(1, +(pos[1] || 6));
const years = Math.max(1, +(pos[2] || 22));
const force = parseForce(flags.force);
const brief = !!flags.brief;
const strict = !!flags.strict;

/* ======================= модель времени ======================= */
// docs/story.md §9.4 п. 2: пролог 0,3; стадия 1 — 0,8; Уфа — 1,3; Россия — 1,5 мин за игровой месяц.
const RATE_DEFAULT = { prologue: 0.3, stage1: 0.8, ufa: 1.3, russia: 1.5 };
const RATE = Object.assign({}, RATE_DEFAULT, (CFG.STORY && CFG.STORY.SIM_MIN_PER_MONTH) || {});
const MONTH = 30.44;
const rateOf = (k) => (RATE[k] != null ? RATE[k] : RATE_DEFAULT[k]);
// Минуты реального времени к игровому дню. Боты играют только Уфу, затем Россию (после открытия S.corp).
function minutesAt(day, russiaStart) {
  const rs = russiaStart == null ? Infinity : russiaStart;
  const u = Math.min(day, rs), r = Math.max(0, day - rs);
  return u / MONTH * rateOf('ufa') + r / MONTH * rateOf('russia');
}

/* ======================= выбор в сцене ======================= */
const peopleW = { gulya: 1.2, family: 1.4, babushka: 1.1, rashid: 1.0, ildar: 0.6, semyon: 0.4 };
const PL = (S) => S.macro.priceLevel;
const REV = (S) => Math.max(S.lastMonthRev || 0, 1e6);
const nOpen = (S) => Math.max(1, (S.stores || []).filter((s) => s.status !== 'opening').length);

function costNum(S, c) {
  if (!c) return 0;
  const pl = PL(S);
  if (typeof c === 'number') return c * pl;
  if (c.perStore) return c.perStore * pl * nOpen(S);
  if (c.revPct) return c.revPct * REV(S);
  return 0;
}
function cashNum(S, f) {
  const pl = PL(S);
  if (f.v != null) return f.v * pl;
  if (f.perStore != null) return f.perStore * pl * nOpen(S);
  if (f.revPct != null) return f.revPct * REV(S);
  return 0;
}
function perkValue(S, id) {
  const rev = REV(S), pl = PL(S);
  switch (id) {
    case 'gulyaCeo': return rev * 0.3 * 0.02 * 12;       // фудкост −2 % в цехе
    case 'familyRecipe': return rev * 0.04 * 0.35 * 3;   // гостей +4 % на 3 месяца
    case 'rashidNotebook': return rev * 0.03 * 0.7 * 12;  // чек +3 % навсегда
    case 'olegPact': return rev * 1.5;                    // «Двор» не встаёт рядом
    default: return 1e6 * pl;
  }
}
// Признаки варианта: экономика (₽), люди (₽), Олег (₽), риск/честность/пакт (₽), флаги счётом.
function features(S, R, sc, i) {
  const pl = PL(S), rev = REV(S);
  const f = { econ: 0, care: 0, oleg: 0, risk: 0, fair: 0, honesty: 0, hide: 0, admit: 0, pact: 0, shares: 0, ending: false, defer: 0 };
  const ch = (sc.choices || [])[i];
  if (!ch) return f;
  f.econ -= costNum(S, ch.cost);
  for (const fx of ch.effects || []) {
    switch (fx.t) {
      case 'cash': f.econ += cashNum(S, fx); break;
      case 'traffic': case 'conv': case 'competitor': f.econ += (fx.m - 1) * rev * 0.35 * ((fx.d || 30) / 30); break;
      case 'check': f.econ += (fx.m - 1) * rev * 0.7 * ((fx.d || 30) / 30); break;
      case 'foodcost': f.econ -= (fx.m - 1) * rev * 0.3 * ((fx.d || 60) / 30); break;
      case 'delivery': case 'rent': case 'salary': f.econ -= (fx.m - 1) * rev * 0.25 * ((fx.d || 36) / 30); break;
      case 'staffQuit': { const n = fx.n || 1; f.econ -= n * (E.hireCost(S, 1) + 80000 * pl); f.care -= n * 1.5e6 * pl; break; }
      case 'staffTrain': f.econ += (fx.n || 1) * 60000 * pl; break;
      case 'loyalty': f.econ += fx.add * (E.allStaff(S) + 1) * 1200 * pl; f.care += fx.add * 0.02e6 * pl; break;
      case 'rel': {
        const w = peopleW[fx.who] != null ? peopleW[fx.who] : 0.5;
        f.care += fx.add * 1.2e6 * pl * w;
        if (fx.who === 'oleg') f.oleg += fx.add * 1.2e6 * pl;
        if (['gulya', 'family', 'babushka', 'rashid'].indexOf(fx.who) >= 0) f.econ += fx.add * 0.25e6 * pl;
        break;
      }
      case 'meter': {
        const v = fx.add * 0.6e6 * pl;
        if (fx.k === 'care') f.care += v;
        else if (fx.k === 'risk') f.risk += v;
        else if (fx.k === 'fair') f.fair += v;
        else if (fx.k === 'honesty') f.honesty += v;
        break;
      }
      case 'flag': {
        if (fx.k === 'mentor' && (fx.v === 'friend' || fx.v === 'partner')) { f.econ += 3e6 * pl; f.care += 1e6 * pl; }
        if (fx.k === 'mentor' && fx.v === 'enemy') f.econ -= 1e6 * pl;
        if (fx.k === 'gulya' && (fx.v === 'manager' || fx.v === 'with' || fx.v === 'share')) f.care += 1.5e6 * pl;
        if (fx.k === 'lenin' && fx.v === 'pact') { f.pact += 1; f.fair += 1; f.econ += 4e6 * pl; }
        if (fx.k === 'lenin' && fx.v === 'no') f.econ -= 1e6 * pl;
        if (fx.k === 'scandal' && fx.v === 'hide') f.hide += 1;
        if (fx.k === 'scandal' && (fx.v === 'admit' || fx.v === 'supplier')) f.admit += 1;
        if (fx.k === 'ufa' && fx.v === 'russia') f.risk += 1;
        if (fx.k === 'ufa' && fx.v === 'sold') f.ending = true;
        break;
      }
      case 'perk': f.econ += perkValue(S, fx.id); break;
      case 'share': f.econ -= (fx.pct || 0) * rev * 12; f.shares += 1; f.risk += 1; break;
      case 'advisor': break;
      case 'rivalMod': {
        const agg = fx.agg || 0;
        f.econ -= agg * rev * 12 * 0.5;
        if (fx.nearK != null && fx.nearK > 1) f.fair -= 1;
        if (agg < 0) f.pact += 0.5;
        break;
      }
      case 'rivalOpenNear': f.econ -= (fx.count || 1) * rev * 0.5; break;
      case 'deferOpen': { const d = fx.days || 3; f.defer += d; f.care += 0.3e6 * pl; f.econ -= d * rev / 30 * 0.4; break; }
      case 'ending': f.ending = true; break;
      default: break;
    }
  }
  return f;
}
function scoreFor(policy, f, pl) {
  if (f.ending) return -1e15; // обрыв партии не нужен никому (кроме «худшего» выбора — см. chooseIdx)
  switch (policy) {
    case 'good': return f.econ + 0.15 * f.care + 0.3 * f.oleg + 0.2 * f.fair + 0.1 * f.honesty;
    case 'care': return 1.0 * f.care + 0.25 * f.econ + 0.2 * f.honesty + 0.1 * f.oleg;
    case 'risk': return 1.4 * f.econ + 1.0 * f.risk + 0.5 * f.shares + 0.4 * f.pact + 0.1 * f.care;
    case 'pact': return 0.4 * f.econ + 2.0 * f.oleg + 1.5 * f.fair + 1.0 * f.pact * 8e6 * pl;
    case 'cold': return 1.2 * f.econ + 1.0 * f.hide * 6e6 * pl - 0.5 * f.care - 0.4 * f.admit * 6e6 * pl + 0.02 * f.honesty;
    case 'bad': return -f.econ - 0.05 * f.care;
    default: return f.econ + 0.15 * f.care;
  }
}
function needOk(S, R, need) {
  return ST.canChoose(S, need);
}

function eligible(S, R, sc) {
  const chs = sc.choices || [];
  const ok = [];
  for (let i = 0; i < chs.length; i++) if (needOk(S, R, chs[i].need)) ok.push(i);
  return ok;
}
function chooseIdx(S, R, sc, policy, rng) {
  const list = eligible(S, R, sc);
  if (!list.length) return null;
  if (policy === 'avg' || policy === 'random') {
    if (policy === 'random') return list[Math.floor(rng() * list.length) % list.length];
    // перекос к первому варианту (геометрический): первому ~57 %, дальше вдвое меньше
    const w = list.map((_, k) => Math.pow(0.5, k));
    const total = w.reduce((a, b) => a + b, 0);
    let x = rng() * total;
    for (let k = 0; k < list.length; k++) { x -= w[k]; if (x <= 0) return list[k]; }
    return list[0];
  }
  if (policy === 'bad') { // худший: если есть обрыв партии — он; иначе минимум экономики (максимум scoreFor('bad'))
    for (const i of list) if (((sc.choices || [])[i].effects || []).some((f) => f.t === 'ending')) return i;
    let bi = list[0], bv = -Infinity;
    for (const i of list) { const v = scoreFor('bad', features(S, R, sc, i), PL(S)); if (v > bv) { bv = v; bi = i; } }
    return bi;
  }
  let best = list[0], bv = -Infinity;
  for (const i of list) { const v = scoreFor(policy, features(S, R, sc, i), PL(S)); if (v > bv) { bv = v; best = i; } }
  return best;
}

/* ======================= один прогон ======================= */
function runOne(prof, seed, yrs, forceMap) {
  const items = [];
  const forcedSeen = {}, blocked = [], effectErrors = [];
  const fixture = prof.fixture ? branchFixture(prof.fixture, seed) : null;
  let russiaStart = null;
  let rngState = ((seed | 0) ^ 0x2f6b1) >>> 0;
  const rng = () => { rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 4294967296; };
  const opts = {
    level: prof.level, seed, years: yrs, initialized: !!(prof.fixture && prof.fixture.stage1),
    stopWhen: prof.target ? () => items.some(it => it.id === prof.target.id && it.idx === prof.target.idx && it.forced && it.resolved && it.needMet) : null,
    onDay: (S) => {
      if (fixture) fixture.step(S);
      if (russiaStart == null && S.corp && S.corp.active) russiaStart = S.day;
      if (!CFG.STORY.ON) return;
      const R = ST.state(S); if (!R || !R.pending) return;
      const sc = ST.pendingScene(S); if (!sc) return;
      const day = S.day;
      const chNow = ST.chapter(S, R);
      let idx, forced = false;
      if (forceMap && forceMap[sc.id] != null) { idx = forceMap[sc.id]; forced = true; }
      else idx = chooseIdx(S, R, sc, prof.policy, rng);
      const nCh = (sc.choices || []).length;
      if (idx == null || idx < 0 || idx >= nCh || !needOk(S, R, sc.choices[idx].need)) {
        blocked.push({ id: sc.id, idx, day, need: idx == null ? null : sc.choices[idx].need || null });
        // Never resolve a forbidden forced option. Continue the fixture along a legal
        // alternative, while recording that the requested option was NOT exercised.
        idx = chooseIdx(S, R, sc, prof.policy, rng); forced = false;
        if (idx == null) return;
      }
      // «доступность» варианта считаем ДО применения эффектов: сквозные линии меняют тот же
      // флаг, которым гейтят свой следующий шаг (lineDamir: served → trusted), и проверка
      // после resolve ругалась бы на честный выбор
      const needMet = needOk(S, R, (sc.choices || [])[idx] && sc.choices[idx].need);
      const triggerFits = fixture ? ST.fits(S, R, ST.scene(sc.id)) : null;
      const origin = R.pending.origin || { kind: 'legacy-unknown' };
      const before = fixture ? branchEffectSnapshot(S) : null;
      if (fixture && prof.target && prof.target.id === sc.id && prof.target.idx === idx && forced && needMet) {
        before.audit = require('./story-effect-audit').snapshot(S);
      }
      const res = ST.resolve(S, idx);
      if (forced && res && res.ok) forcedSeen[sc.id] = true;
      if (fixture) effectErrors.push(...branchEffectCheck(S, sc, idx, before, res));
      const evIds = (S.ev.recent || []).filter((x) => x.day === day).map((x) => x.id);
      if (S.ev.pending && S.ev.pending.day === day && evIds.indexOf(S.ev.pending.id) < 0) evIds.push(S.ev.pending.id);
      const evSame = evIds.length > 0;
      items.push({
        id: sc.id, day, form: sc.form || 'scene', ch: chNow, idx,
        label: res && res.ok ? res.choice.label : '', out: res && res.ok ? (res.out || []).slice() : [],
        forced, eventSameDay: evSame, evIds, chefSameDay: !!S.chef.pending,
        needMet, resolved: !!(res && res.ok), triggerFits, origin, audit: before && before.auditReport || null,
      });
    },
  };
  if (prof.reserve != null) opts.reserve = prof.reserve;
  let r;
  if (fixture) {
    const original = E.newGame; let supplied = false;
    E.newGame = function (o) { if (!supplied) { supplied = true; return fixture.S; } return original.call(this, o); };
    try { r = play(opts); } finally { E.newGame = original; }
  } else r = play(opts);
  const notForced = [];
  if (forceMap) for (const id of Object.keys(forceMap)) if (!forcedSeen[id]) notForced.push(id);
  return { prof, seed, r, items, russiaStart, notForced, blocked, effectErrors, fixture: fixture ? { id: fixture.id, assistance: fixture.assistance, errors: fixture.errors } : null };
}

/* ======================= статистика прогона ======================= */
const median = (a) => { const b = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const sum = (a) => a.reduce((x, y) => x + y, 0);
function statsOf(run) {
  const rs = run.russiaStart;
  const items = run.items.slice().sort((a, b) => a.day - b.day);
  const min = (d) => minutesAt(d, rs);
  const byCh = {};
  for (const it of items) byCh[it.ch] = (byCh[it.ch] || 0) + 1;
  const posts = items.filter((x) => x.form === 'post').length;
  const pauses = items.filter((x) => x.form !== 'post').length;
  const between = [];
  for (let i = 1; i < items.length; i++) between.push(min(items[i].day) - min(items[i - 1].day));
  if (process.env.BK_GAPS && between.length) { // BK_GAPS=1 — где самая длинная пауза между сценами
    const i = between.indexOf(Math.max.apply(null, between)), y = (d) => (d / 365).toFixed(1);
    console.log(`  пауза ${between[i].toFixed(1)} мин: ${items[i].id} (год ${y(items[i].day)}, ${items[i].ch}) → ${items[i + 1].id} (год ${y(items[i + 1].day)})`);
  }
  const head = items.length ? min(items[0].day) : min(run.r.S.day);
  const tail = items.length ? min(run.r.S.day) - min(items[items.length - 1].day) : min(run.r.S.day);
  // 1-й акт (Уфа): до открытия России (S.corp). Боты пролог и стадию 1 не играют.
  const firstAct = items.filter((x) => rs == null || x.day < rs);
  const faMinutes = rs == null ? min(run.r.S.day) : min(rs);
  const faRate = faMinutes > 0 ? firstAct.length / (faMinutes / 60) : 0;
  const hours = {};
  for (const it of items) { const h = Math.floor(min(it.day) / 60); hours[h] = (hours[h] || 0) + 1; }
  const ending = run.r.S.storyEnding || null;
  return {
    run, items, byCh, posts, pauses,
    scenes: items.length,
    maxGap: between.length ? Math.max.apply(null, between) : null,
    medGap: between.length ? median(between) : null,
    head, tail, between,
    faScenes: firstAct.length, faMinutes, faRate,
    hours,
    evSame: items.filter((x) => x.eventSameDay).length,
    evList: items.filter((x) => x.eventSameDay).map((x) => ({ id: x.id, day: x.day, ev: (x.evIds || []).join('/') })),
    chefSame: items.filter((x) => x.chefSameDay).length,
    ending, lostYear: run.r.lost && !ending ? +(run.r.S.day / 365).toFixed(1) : null,
    wonYear: run.r.won ? run.r.won.year : null,
    stores: run.r.S.stores.filter((s) => s.status !== 'opening').length,
  };
}

/* ======================= вывод ======================= */
function fmtMin(v) { return v == null ? '—' : v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace('.', ','); }
function bars(n, max) { const w = max ? Math.max(1, Math.round(n / max * 24)) : 0; return '█'.repeat(w); }
function usage() {
  console.log([
    'Проверка сюжета ботами (docs/story.md §9.4).',
    '',
    'node sim/story.js [профили] [сидов] [лет] [ключи]',
    '  профили: good, avg, bad и стилевые care, risk, pact, cold, random (через запятую; care:avg — свой уровень игры)',
    '  пример: node sim/story.js good,avg 12 22',
    '',
    'Ключи:',
    '  --force=id:idx[,id:idx]  зафиксировать выбор в сцене (idx с нуля)',
    '  --all-branches[=N]       перебрать все варианты развилок на N сидах (по умолчанию 4)',
    '  --balance                сравнить год победы good с сюжетом и без (±0,5 года)',
    '  --check                  проверки каркаса, ГСЧ и текстов реплик',
    '  --brief                  короткий вывод без таблиц по сидам',
    '  --strict                 код выхода 1 и при невыполненных целях темпа',
    '',
  ].join('\n'));
}
function chaptersStr(byCh) {
  const keys = Object.keys(byCh);
  if (!keys.length) return '—';
  return keys.map((k) => `${ST.chapterName ? ST.chapterName(k) : k}: ${byCh[k]}`).join(' · ');
}
function choicesStr(items) {
  const m = {};
  for (const it of items) { const k = `${it.id}:${it.idx}`; m[k] = (m[k] || 0) + 1; }
  const keys = Object.keys(m).sort();
  return keys.length ? keys.slice(0, 12).map((k) => `${k}×${m[k]}`).join(' · ') + (keys.length > 12 ? ' …' : '') : '—';
}
function aggregate(sts) {
  const scenes = sts.map((s) => s.scenes);
  const gaps = sts.map((s) => s.maxGap).filter((x) => x != null);
  const rate = sts.map((s) => s.faRate);
  return {
    n: sts.length,
    scenesTotal: sum(scenes),
    scenesMed: median(scenes),
    scenesMin: scenes.length ? Math.min.apply(null, scenes) : null,
    scenesMax: scenes.length ? Math.max.apply(null, scenes) : null,
    gapMed: median(gaps), gapMax: gaps.length ? Math.max.apply(null, gaps) : null,
    tailMax: sts.length ? Math.max.apply(null, sts.map((s) => s.tail)) : null,
    rateMed: median(rate),
    evSame: sum(sts.map((s) => s.evSame)),
    chefSame: sum(sts.map((s) => s.chefSame)),
  };
}
function targets(profile, agg) {
  const out = [];
  if (profile.name === 'good') out.push({ n: 'сцен за партию 38–46 (§9.4 п. 2)', pass: agg.scenesMed != null && agg.scenesMed >= 38 && agg.scenesMed <= 46, v: agg.scenesMed });
  if (profile.name === 'avg') out.push({ n: 'сцен за партию ≥ 30 (§9.4 п. 2)', pass: agg.scenesMed != null && agg.scenesMed >= 30, v: agg.scenesMed });
  out.push({ n: 'в 1-м акте 3–6 сцен в час', pass: agg.rateMed != null && agg.rateMed >= 3 && agg.rateMed <= 6, v: agg.rateMed });
  out.push({ n: 'нет промежутка между сценами > 25 мин', pass: agg.gapMax == null || agg.gapMax <= 25, v: agg.gapMax });
  out.push({ n: 'ни одной сцены в один день с событием', pass: agg.evSame === 0, v: agg.evSame });
  return out;
}

/* ======================= основной отчёт ======================= */
function report() {
  const scenesAll = ST.scenes();
  console.log(`Сюжет включён для ботов (BK_STORY=1). Профили: ${profiles.map((p) => p.label).join(', ')}; сидов ${seeds}, лет ${years}.`);
  console.log(`Сцен в данных: ${scenesAll.length}${scenesAll.length ? ' (' + scenesAll.map((s) => s.id).join(', ') + ')' : ''}`);
  if (flags.scenario && flags.scenario !== 'ufa') console.log(`Сценарии (--scenario=${flags.scenario}) пока не реализованы: S.story.scenario всегда «ufa» (docs/story.md §9.4 п. 5).`);
  if (scenesAll.length < 38) console.log(`Внимание: в игре пока ${scenesAll.length} сцен главы 2 — цели темпа §9.4 п. 2 (good 38–46) достижимы только на полном сюжете; числа ниже промежуточные.`);
  if (Object.keys(force).length) console.log('Зафиксированы выборы: ' + Object.keys(force).map((k) => `${k}:${force[k]}`).join(', '));
  console.log('');

  const allSeen = {};
  let anyTargetFail = false;
  for (const prof of profiles) {
    const sts = [], rows = [];
    for (let s = 1; s <= seeds; s++) {
      const seed = s * 7919;
      const run = runOne(prof, seed, years, Object.keys(force).length ? force : null);
      const st = statsOf(run); sts.push(st);
      for (const it of st.items) allSeen[it.id] = (allSeen[it.id] || 0) + 1;
      rows.push({
        сид: s, 'играет как': prof.level,
        сцен: st.scenes, 'по главам': chaptersStr(st.byCh),
        постов: st.posts,
        '1-я сцена, мин': fmtMin(st.head),
        'пауза медиана, мин': fmtMin(st.medGap),
        'пауза макс, мин': fmtMin(st.maxGap),
        'хвост, мин': fmtMin(st.tail),
        '1-й акт, сцен/час': st.faRate ? st.faRate.toFixed(1).replace('.', ',') : '—',
        'с событием': st.evSame, 'с шефом': st.chefSame,
        'год победы': st.wonYear,
        итог: st.ending ? 'концовка:' + st.ending : st.lostYear ? 'банкрот ' + st.lostYear : '—',
      });
      if (run.notForced.length) console.log(`  ! сид ${s}: не дошли зафиксированные сцены: ${run.notForced.join(', ')}`);
    }
    if (!brief) console.table(rows);
    const agg = aggregate(sts);
    console.log(`### ${prof.label} (играет как ${prof.level}, стиль выбора «${prof.policy}»)`);
    console.log(`  сцен за партию: медиана ${agg.scenesMed} (${agg.scenesMin}–${agg.scenesMax}), всего за ${agg.n} сид(ов) ${agg.scenesTotal}`);
    console.log(`  промежуток между сценами: медиана ${fmtMin(agg.gapMed)} мин, максимум ${fmtMin(agg.gapMax)} мин; хвост после последней сцены: ${fmtMin(agg.tailMax)} мин`);
    console.log(`  1-й акт (Уфа): ${agg.rateMed == null ? '—' : agg.rateMed.toFixed(1).replace('.', ',')} сцен в час`);
    console.log(`  сцена в один день с событием: ${agg.evSame}; с окном шефа: ${agg.chefSame}`);
    console.log(`  сделанные выборы: ${choicesStr(sts.flatMap((x) => x.items))}`);
    const hours = {};
    let maxHour = 0;
    for (const st of sts) for (const k of Object.keys(st.hours)) { hours[k] = (hours[k] || 0) + st.hours[k]; maxHour = Math.max(maxHour, +k); }
    const vals = Object.keys(hours).map(Number).sort((a, b) => a - b);
    if (vals.length) {
      const mx = Math.max.apply(null, vals.map((k) => hours[k]));
      console.log('  сцен за игровой час (суммарно по сидам):');
      for (const k of vals) console.log(`    час ${k + 1}: ${bars(hours[k], mx)} ${hours[k]}`);
    }
    const tg = targets(prof, agg);
    for (const t of tg) { if (!t.pass) anyTargetFail = true; console.log(`  ${t.pass ? '✓' : '✗'} ${t.n}: ${t.v == null ? '—' : (typeof t.v === 'number' ? String(Math.round(t.v * 10) / 10).replace('.', ',') : t.v)}`); }
    const overlaps = sts.reduce((a, st) => a.concat(st.evList), []);
    if (overlaps.length) {
      console.log('  сцены в один день с событием (§6: сцену надо отложить на 3–7 дней):');
      for (const o of overlaps.slice(0, 6)) console.log(`    ✗ ${o.id} — ${E.fmtDate(o.day)}, событие: ${o.ev}`);
      if (overlaps.length > 6) console.log(`    … ещё ${overlaps.length - 6}`);
    }
    const chefOver = sts.flatMap((st) => st.items.filter((x) => x.chefSameDay).map((x) => ({ id: x.id, day: x.day })));
    if (chefOver.length) {
      console.log('  сцены в день окна шефа (§6: тоже откладывать): ' + chefOver.slice(0, 4).map((o) => `${o.id} (${E.fmtDate(o.day)})`).join(', ') + (chefOver.length > 4 ? ` … ещё ${chefOver.length - 4}` : ''));
    }
    console.log('');
  }

  const unseen = scenesAll.filter((s) => !allSeen[s.id]);
  if (unseen.length) {
    console.log('Сцены, которых не увидел никто:');
    for (const s of unseen) console.log(`  ✗ ${s.id} «${s.title}» (${s.ch || '?'})`);
    console.log('Код выхода 1.');
  } else {
    console.log(`Все ${scenesAll.length} сцен данных увидены хотя бы одним ботом.`);
  }
  return unseen.length > 0 || (strict && anyTargetFail);
}

/* ======================= --all-branches ======================= */
// Coverage fixtures are deliberately assisted; their wealth/revenue corrections
// never enter --balance or ordinary runOne. Routes use real choices, not f.ufa writes.
const BRANCH_PROFILES = [
  { id: 'warm-russia', route: 'russia', character: 'warm', policy: 'care', walk: { s37: 0, ko1: 0, ko2: 0, kd1: 0, kd2: 0, kd3: 0, kf3: 0, kf4: 0 } },
  { id: 'cold-russia', route: 'russia', character: 'cold', policy: 'cold', walk: { s37: 0, ko1: 1, ko2: 2, kd1: 2, kd2: 2, kd3: 1, kf3: 1, kf4: 2 } },
  { id: 'warm-deep', route: 'deep', character: 'warm', policy: 'care', walk: { s37: 1, ko1: 0, ko2: 0 } },
  { id: 'cold-deep', route: 'deep', character: 'cold', policy: 'cold', walk: { s37: 1, ko1: 1, ko2: 2 } },
  ...['legacy', 'rescue', 'crisis', 'moscow', 'coffee'].map(scenario => ({ id: scenario, scenario, character: scenario === 'rescue' ? 'warm' : null, route: 'russia', policy: 'good', walk: { s37: 0 } })),
];
function branchFixture(profile, seed) {
  const S = profile.character
    ? prologueState(seed, Object.assign({}, profile.character === 'warm' ? WARM_PICKS : COLD_PICKS, profile.guestPicks || {}))
    : E.newGame({ seed, city: profile.scenario === 'moscow' ? 'moscow' : 'ufa' });
  const assistance = [], errors = [];
  const floor = profile.cashFloor == null ? 2e9 : profile.cashFloor;
  if (!BK.Threads) errors.push({ kind: 'Threads-module-not-loaded' });
  function cashFloor(state) {
    if (state.cash < floor) {
      const add = floor - state.cash; state.cash += add;
      let ledger = assistance.find(x => x.kind === 'cash-fixture');
      if (!ledger) { ledger = { kind: 'cash-fixture', firstDay: state.day, lastDay: state.day, count: 0, total: 0 }; assistance.push(ledger); }
      ledger.lastDay = state.day; ledger.count++; ledger.total += add;
    }
  }
  if (profile.scenario) {
    // Select before the bot builds its first point; defer scenario network setup
    // until Engine's real Scenario.day detects the play phase. This is a coverage
    // fixture, not a faithful scenario starting-balance benchmark.
    BK.Scenario.set(S, profile.scenario, { defer: true });
    BK.Scenario.applyStart(S);
  }
  cashFloor(S);
  if (profile.stage1) {
    const prepared = require('./story-stage1-fixture').prepareStage1(BK, S, { hire: profile.stage1, cashFloor: 2e9, assistance });
    errors.push(...prepared.errors.map(detail => ({ kind: 'stage1-fixture-failed', detail })));
  }
  let entered = false;
  return { id: profile.id, S, assistance, errors, step(state) {
    cashFloor(state);
    const R = ST.state(state); if (!R || state.lost) return;
    if (profile.route !== 'russia' || R.f.ufa !== 'russia' || entered) return;
    const threshold = CFG.CORP.UNLOCK_REVENUE;
    if (state.cumRevenue < threshold) {
      assistance.push({ day: state.day, kind: 'corp-unlock-revenue-fixture', add: threshold - state.cumRevenue });
      state.cumRevenue = threshold;
    }
    BK.Corp.ensure(state);
    const result = E.enterCity(state, 'kazan');
    if (!result || !result.ok || !state.corp || state.corp.active !== 'kazan' || !state.corp.cities.kazan) {
      errors.push({ day: state.day, kind: 'second-act-entry-failed', result }); entered = true; return;
    }
    entered = true;
    assistance.push({ day: state.day, kind: 'real-enterCity', city: 'kazan', cost: result.cost });
    const offer = state.prodOffers.slice().sort((a, b) => E.prodOpenCost(state, a).total - E.prodOpenCost(state, b).total)[0];
    if (!offer || !E.chooseProduction(state, offer.id).ok) errors.push({ day: state.day, kind: 'second-act-production-failed' });
    const shop = state.offers[0];
    if (!shop || !E.rentStore(state, shop.id).ok) errors.push({ day: state.day, kind: 'second-act-first-store-failed' });
  } };
}
function branchEffectSnapshot(S) {
  const R = ST.state(S);
  return { pending: R.pending && R.pending.id, seen: Object.assign({}, R.seen), flags: Object.assign({}, R.f), threads: BK.Threads ? BK.Threads.list(S).map(t => t.id) : [] };
}
function branchEffectCheck(S, sc, idx, before, result) {
  const out = [], R = ST.state(S), fail = detail => out.push({ id: sc.id, idx, day: S.day, detail });
  if (!result || !result.ok || R.pending || R.seen[sc.id] !== S.day) fail('resolve did not close and record the real scene');
  // Check final flag values after all effects, named perks, created threads and
  // legal terminal outcomes. Economic magnitude/expired modifier checks require
  // dedicated integration tests; do not label these checks as full effect coverage.
  const expected = {};
  for (const fx of sc.choices[idx].effects || []) {
    if (fx.t === 'flag') expected[fx.k] = fx.v;
    if (fx.t === 'perk') {
      if (!R.perks.includes(fx.id)) fail('missing perk ' + fx.id);
      const p = BK.STORY.perks[fx.id]; if (p && p.flag) expected[p.flag.k] = p.flag.v;
    }
    if (fx.t === 'thread' && fx.rec && fx.rec.id && BK.Threads && !BK.Threads.byId(S, fx.rec.id)) fail('missing thread ' + fx.rec.id);
    if (fx.t === 'ending' && (R.ending !== fx.id || S.storyEnding !== fx.id || !S.lost)) fail('invalid terminal outcome ' + fx.id);
  }
  for (const [k, v] of Object.entries(expected)) if (R.f[k] !== v) fail('effect flag mismatch ' + k);
  if (!before || before.pending !== sc.id) fail('choice did not originate from the real pending scene');
  if (before && before.audit) {
    const report = require('./story-effect-audit').check(BK, S, sc, idx, before.audit, result);
    before.auditReport = report;
    out.push(...report.errors.map(detail => ({ id: sc.id, idx, day: S.day, detail })));
    if (result && result.ok && flags.snapshots) {
      const fs = require('fs'), path = require('path');
      const dir = path.join(__dirname, '..', 'tmp', 'story-branches', 'states'); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, sc.id + '-' + idx + '-' + S.seed + '.json'), before.audit.json);
    }
  }
  return out;
}
function branchProfilesFor(sc, idx) {
  if (/^b4r\d$/.test(sc.id)) return [{ id: 'patient-russia', route: 'russia', character: 'warm', level: 'avg', policy: 'care', cashFloor: 1e6, walk: { s37: 0, ko1: 0, ko2: 0, kd1: 0, kd2: 0, kd3: 0, kf3: 0, kf4: 0 } }];
  if (['b4i', 'b4j', 'b4k'].includes(sc.id)) return [{ id: 'patient-deep', route: 'deep', character: 'warm', level: 'avg', policy: 'care', cashFloor: 1e6, walk: { s37: 1, ko1: 0, ko2: 0 } }];
  const scenario = /^ls/.test(sc.id) ? 'legacy' : /^sr/.test(sc.id) ? 'rescue' : /^mos/.test(sc.id) ? 'moscow' : /^kc/.test(sc.id) ? 'crisis' : /^cf/.test(sc.id) ? 'coffee' : null;
  const walks = {
    ls7: { ls1: 0, ls6: 0 }, ls8: { ls1: 0, ls6: 1 },
    'kc3:2': { kc2: 0 }, kc6a: { kc4: 0 }, kc6c: { kc4: 2 },
    'sr3:2': { sr1: 0 }, 'sr5:2': { sr1: 0, sr3: 2 }, 'sr6:2': { sr2: 1 },
    'mos6:3': { mos1: 1 }, mosBank: { mos1: 1 },
    cf7a: { cf1: 0 }, cf7b: { cf1: 1 }, cf8: { cf1: 0 },
    s31b: { s25: 2, s31: 0 }, s32b: { s32: 1 },
    'kb2:1': { kb1: 2 }, 'kg2:0': { kg1: 0 }, 'kg2:1': { kg1: 2 },
    'ke2:1': { ke1: 0 }, 'ke2:0': { ke1: 1 },
    'sf1:2': { ko1: 0, ko2: 0 }, 'sf2:0': { ko1: 1, ko2: 2, sf1: 3 },
    's31:3': { s25: 2 },
  };
  return BRANCH_PROFILES.filter(p => {
    if (scenario) return p.scenario === scenario;
    if (p.scenario) return false;
    if (sc.ch === 'deep' && p.route !== 'deep') return false;
    if (['s41','s42','s43','s44','s45','s46','s47'].includes(sc.id) && p.route !== 'russia') return false;
    if (sc.id === 's37' && idx < 2 && p.walk.s37 !== idx) return false;
    return true;
  }).map(p => Object.assign({}, p, {
    id: ['s31','s35','s36b','s41'].includes(sc.id) ? p.id + '-warm-stage1' : p.id,
    seedOffset: sc.id === 's35' ? 5 : 0,
    character: ['s31','s35','s36b','s41'].includes(sc.id) ? 'warm' : p.character,
    stage1: sc.id === 's35' ? 'lara' : ['s31','s36b','s41'].includes(sc.id) ? 'aidar' : null,
    walk: Object.assign({}, p.walk, walks[sc.id + ':' + idx] || walks[sc.id] || {}),
    guestPicks: /^sg[1256]$/.test(sc.id) ? { g_rad1: 0, g_petr1: 0, g_petr2: 1, g_ali1: 1, g_zoya1: 0 } : null,
  }));
}

function allBranches(branchSeeds, yrs) {
  const scenes = ST.scenes();
  const selected = flags.targets ? new Set(String(flags.targets).split(',')) : null;
  const forceable = scenes.filter(sc => (sc.choices || []).length >= 1 && (!selected || selected.has(sc.id)));
  const seenAny = {}, rows = [], unresolved = [], errors = [];
  console.log(`Independent coverage fixtures: ${branchSeeds} seeds x ${yrs} years. ASSISTED; NOT BALANCE.`);
  console.log('Each target gets a fresh state. Russia is a real Corp/enterCity transition after s37; deep is a separate run.');
  for (const sc of forceable) for (let idx = 0; idx < sc.choices.length; idx++) {
    const cases = branchProfilesFor(sc, idx); let passed = false;
    attempts: for (const profile of cases) for (let seed = 1; seed <= branchSeeds; seed++) {
      const fm = Object.assign({}, profile.walk, { [sc.id]: idx });
      const prof = { name: profile.id, label: profile.id, level: profile.level || 'good', policy: profile.policy, fixture: profile, target: { id: sc.id, idx } };
      const actualSeed = (seed + (profile.seedOffset || 0)) * 7919;
      const run = runOne(prof, actualSeed, yrs, fm);
      for (const it of run.items) if (it.resolved && it.needMet) seenAny[it.id] = 1;
      const target = run.items.find(it => it.id === sc.id && it.idx === idx && it.forced && it.resolved && it.needMet);
      const blocked = run.blocked.some(x => x.id === sc.id && x.idx === idx);
      const fixtureErrors = run.fixture.errors || [];
      const status = fixtureErrors.length ? 'fixture-failed' : run.effectErrors.length ? 'effect-failed'
        : target ? ((sc.choices[idx].effects || []).some(f => f.t === 'ending') ? 'legal-ending' : 'choice-executed')
        : blocked ? 'need-blocked' : run.r.S.storyEnding ? 'earlier-legal-ending' : run.r.lost ? 'bankrupt-before-target' : 'not-reached';
      if (target && !fixtureErrors.length && !run.effectErrors.length) passed = true;
      errors.push(...fixtureErrors.map(x => ({ profile: profile.id, ...x })), ...run.effectErrors.map(x => ({ profile: profile.id, ...x })));
      rows.push({ scene: sc.id, choice: idx, fixture: profile.id, seed, actualSeed, status, assistance: run.fixture.assistance,
        end: run.r.S.storyEnding || null, observed: run.items.map(x => ({ id: x.id, idx: x.idx, forced: x.forced, resolved: x.resolved, needMet: x.needMet, triggerFits: x.triggerFits, origin: x.origin, day: x.day })), blocked: run.blocked, audit: target && target.audit || null });
      console.log(`PROBE ${sc.id}:${idx} ${profile.id} ${status} day=${run.r.S.day}`);
      if (passed) break attempts;
    }
    // Being behind incompatible gates is explanatory, not proof that the target
    // is covered. No passed fixture for a target remains a red diagnostic.
    if (!passed) unresolved.push({ id: sc.id, idx, attempted: cases.map(x => x.id) });
  }
  const unseen = scenes.filter(sc => !seenAny[sc.id]).map(sc => sc.id);
  console.table(rows.map(({ scene, choice, fixture, seed, status, end, assistance }) => ({ scene, choice, fixture, seed, status, end, assisted: assistance.length })));
  console.log(JSON.stringify({ kind: 'story-branch-coverage-assisted', balance: false, rows, unresolved, unseen, errors,
    limitations: ['fixtures are assisted, not balance', 'no global all-afterDeps claim: alternative scene gates are mutually exclusive', 'not full economic effect/time/load coverage', 'scenario initialization is a deferred coverage fixture', 'profiles do not yet construct every rare premise'] }, null, 2));

  if (!selected && !unresolved.length && !unseen.length && !errors.length && flags.snapshots) {
    const fs = require('fs'), path = require('path');
    const successfulTargets = [];
    for (const sc of scenes) for (let choice=0;choice<sc.choices.length;choice++) {
      const row=rows.find(r=>r.scene===sc.id && r.choice===choice && ['choice-executed','legal-ending'].includes(r.status));
      if (!row) throw new Error('Missing successful target '+sc.id+':'+choice);
      successfulTargets.push({scene:sc.id,choice,fixture:row.fixture,actualSeed:row.actualSeed,
        stateFile:'tmp/story-branches/states/'+sc.id+'-'+choice+'-'+row.actualSeed+'.json',
        checks:row.audit && row.audit.checks || 0, declaredChecks:row.audit && row.audit.declaredChecks || {},
        unsupported:row.audit && row.audit.unsupported || []});
    }
    const manifest={complete:true,version:CFG.VERSION.num,balance:false,scenes:scenes.length,
      successfulTargets,attempts:rows.length,checks:rows.reduce((n,r)=>n+(r.audit && r.audit.checks || 0),0),
      limitations:['independent legal choice reachability; not every combination of preceding choices',
        'assisted financial fixtures are not a balance benchmark','core effects use durable replay plus existing Engine tests']};
    fs.writeFileSync(path.join(__dirname,'..','docs','story-branches-coverage.json'),JSON.stringify(manifest,null,2)+'\n');
  }
  if (unresolved.length || unseen.length || errors.length) console.log('Код выхода 1. Непройденные варианты и сцены перечислены в отчёте.');
  return unresolved.length || unseen.length || errors.length ? 1 : 0;
}

/* ======================= --balance ======================= */
function balance(yrs, sd) {
  const prof = { name: 'good', level: 'good', policy: 'good', label: 'good' };
  const rows = [];
  for (let s = 1; s <= sd; s++) {
    const seed = s * 7919;
    const a = runOne(prof, seed, yrs, Object.keys(force).length ? force : null); // с сюжетом
    const off = CFG.STORY.ON;
    CFG.STORY.ON = false;
    const b = play({ level: 'good', seed, years: yrs });    // без сюжета
    CFG.STORY.ON = off;
    rows.push({
      сид: s,
      'с сюжетом': a.r.won ? a.r.won.year : null,
      'сюжет: банкрот': a.r.lost && !a.r.S.storyEnding ? +(a.r.S.day / 365).toFixed(1) : null,
      сцен: a.items.length,
      'без сюжета': b.won ? b.won.year : null,
      'без: банкрот': b.lost ? +(b.S.day / 365).toFixed(1) : null,
      'разница, лет': a.r.won && b.won ? +(a.r.won.year - b.won.year).toFixed(1) : null,
    });
  }
  console.table(rows);
  const wa = rows.map((r) => r['с сюжетом']).filter((x) => x != null);
  const wb = rows.map((r) => r['без сюжета']).filter((x) => x != null);
  const ma = median(wa), mb = median(wb);
  const diff = ma != null && mb != null ? +(ma - mb).toFixed(1) : null;
  console.log(`\ngood ${sd} сид(ов) × ${yrs} лет: с сюжетом медиана ${ma} (побед ${wa.length}/${sd}), без сюжета ${mb} (побед ${wb.length}/${sd}); разница ${diff == null ? '—' : (diff > 0 ? '+' : '') + diff} года.`);
  console.log('Эталон без сюжета: node sim/bot.js good 3 18 --summary → wins 3/3, median win year 14.9.');
  const ok = diff != null && Math.abs(diff) <= 0.5;
  console.log(ok ? '✓ расхождение в пределах ±0,5 года (§9.4 п. 6).' : '✗ расхождение больше ±0,5 года.');
  console.log('Промежуточно: в игре только сцены главы 2 — цифра уточнится на полном сюжете.');
  return ok ? 0 : 1;
}

/* ======================= --lines: реплики в отчёте месяца =======================
   Проверка BK.STORY.lineOfMonth/lineHtml (docs/story.md §6): реплика выбирается по самой острой
   проблеме месяца, подстановки настоящие, лимит «не чаще раза в месяц» соблюдён, героя из свежей
   сцены реплика не повторяет, при выключенном сюжете и без S.story — молчит вовсе. */
function lines(yrs, sd) {
  if (!BK.STORY || !BK.STORY.recordLineOfMonth || !BK.STORY.lineOfMonth) { console.log('нет API реплик месяца — реплики не подключены'); return 1; }
  let bad = 0;
  const ok = (c, w, x) => { if (!c) { bad++; console.log('  ✗ ' + w + (x ? ' — ' + x : '')); } else console.log('  ✓ ' + w + (x ? ' — ' + x : '')); };
  console.log(`# Реплики в отчёте месяца (${sd} сид(ов) × ${yrs} лет)`);
  let all = [], months = 0, dupScene = 0, midMonth = 0, gaps = 0, badText = 0, renderMutations = 0, prevText = null;
  for (let s = 0; s < sd; s++) {
    const seed = 1000 + s * 7919;
    let cur = null, prevDay = null;
    prevText = null;
    play({
      level: 'good', seed, years: yrs,
      onDay: (S) => {
        const t = E.dateOf(S.day);
        if (t.d !== 1 || !S.history.length) return;
        months++;
        const beforeRender = JSON.stringify(S);
        const html = BK.STORY.lineHtml(S);                       // так же зовёт панель
        const L = BK.STORY.lineOfMonth(S);
        BK.STORY.lineHtml(S); BK.STORY.lineOfMonth(S);           // повторные рендеры не меняют state/RNG/history
        if (beforeRender !== JSON.stringify(S)) renderMutations++;
        if (!L) return;
        all.push(L);
        if (L.cur === cur && prevText && L.text !== prevText) midMonth++;      // в одном месяце текст не меняется
        cur = L.cur;
        if (prevDay != null && S.day - prevDay < 25) gaps++;                  // не чаще раза в месяц
        if (html.indexOf('st-line') < 0 || /[{}]/.test(L.text) || /undefined|NaN|№№|…/.test(L.text)) badText++;
        const sc = (S.story.log || []).filter((x) => x.title).slice(-1)[0];
        if (sc && S.day - sc.day <= 45) {
          const s0 = (BK.STORY.scenes || []).find((x) => x.id === sc.id);
          if (s0 && (s0.who || []).indexOf(L.hero) >= 0) dupScene++;
        }
        prevText = L.text; prevDay = S.day;
      },
    });
  }
  const uniq = new Set(all.map((x) => x.text));
  const hero = {}, sit = {};
  for (const x of all) { hero[x.hero] = (hero[x.hero] || 0) + 1; sit[x.sit] = (sit[x.sit] || 0) + 1; }
  ok(all.length >= months * 0.9, 'реплика приходит почти каждый месяц', `${all.length} из ${months} отчётов`);
  ok(badText === 0, 'в тексте нет неподставленных {n}/{sum} и служебных заглушек');
  ok(gaps === 0, 'лимит «не чаще раза в месяц» соблюдён');
  ok(midMonth === 0, 'внутри месяца текст не меняется (перерисовка панели не подменяет реплику)');
  ok(renderMutations === 0, 'lineOfMonth/lineHtml не меняют state, RNG и history', String(renderMutations));
  ok(dupScene === 0, 'реплика не повторяет героя из свежей сцены (блок «История»)', String(dupScene));
  ok(new Set(Object.keys(hero)).size >= 4, 'говорят все четыре героя схемы §6', Object.keys(hero).join(', '));
  ok(uniq.size >= all.length * 0.15, 'реплики не зациклились', `${uniq.size} разных из ${all.length} (${Math.round(uniq.size / Math.max(1, all.length) * 100)} %)`);
  console.log('  герои: ' + JSON.stringify(hero));
  console.log('  ситуации: ' + JSON.stringify(sit));
  const sample = [], pref = ['gulya.quits', 'gulya.overwork', 'gulya.salelow', 'elvira.debt', 'elvira.crisis', 'rashid.waste', 'rashid.quality', 'semyon.rating', 'oleg.rival', 'oleg.respect'];
  for (const k of pref) { const x = all.find((y) => y.hero + '.' + y.sit === k); if (x) sample.push(x); }
  if (sample.length) { console.log('  примеры:'); for (const x of sample.slice(0, 8)) console.log(`    ${x.hero}.${x.sit}/${x.tone}: ${x.text}`); }
  const keep = CFG.STORY.ON;
  CFG.STORY.ON = false;
  ok(BK.STORY.lineHtml({ day: 300, story: { v: 1, rel: {} }, history: [{ m: 1, y: 2028, rev: 1, profit: 1, pnl: {} }] }) === '', 'при CFG.STORY.ON === false — пусто');
  CFG.STORY.ON = keep;
  ok(BK.STORY.lineHtml(null) === '' && BK.STORY.lineHtml({ day: 1 }) === '', 'без S.story и без истории — пусто');
  console.log(bad ? `  ПРОБЛЕМ: ${bad}` : '  Всё в порядке.');
  return bad ? 1 : 0;
}

/* ======================= --through: сквозные линии от пролога до финала =======================
   Обычный прогон показывает сцены, но НЕ показывает главного: боты пролог не играют, поэтому
   линии из пролога у них не проверяются. Здесь пролог проигрывается по-настоящему (дилеммы
   выбираются принудительно), переносится в основную игру (BK.Prologue.applyCarry), а дальше
   идёт обычная партия. Проверяем четыре вещи:
     1. нити пролога доехали до BK.Threads и их видно в «Требует внимания» (и цену — «50 вместо 21»);
     2. промежуточные сцены линий пришли (kd/kb/kg/kf/ke/ko) и флаги линий поменялись;
     3. характер партии считает, кто рядом (f.mateKind: помощница или самодур);
     4. финал отличается у двух характеров: тёплый пролог → «Вас помнят»/«Две корки»,
        холодный → «Всё по бумагам»/«Пустой зал».
   Запуск: node sim/story.js --through [лет]
*/
const WARM_PICKS = { d_colleague: 0, d_regular: 0, d_mama_money: 0, d_holiday: 1, d_loose_money: 1, d_dough: 1, d_landlord: 1, d_semyon: 0, d_receipt: 1 };
const COLD_PICKS = { d_colleague: 1, d_regular: 1, d_mama_money: 2, d_holiday: 0, d_loose_money: 0, d_dough: 0, d_landlord: 0, d_semyon: 2, d_receipt: 0 };

// пролог: проигрываем выбранные дилеммы и переносим результат в основную игру
function prologueState(seed, picks) {
  const PR = BK.Prologue, F = BK.PrologV2;
  const S0 = { seed };
  const P = PR.start(S0);
  if (F && !P.v2) F.init(S0);
  for (const id of Object.keys(picks)) {
    if (PR.CARDS && PR.CARDS[id]) {
      P.cards.unshift({ id, v: {} }); PR.card(S0); PR.choose(S0, picks[id]); continue;
    }
    if (!F || !F.DILEMMAS[id]) continue;
    P.cards.unshift({ id: id, v: {}, v2: 1 });     // карточка идёт первой: PR.card() читает P.cards[0]
    if (P.v2) P.v2.seen[id] = P.m;
    PR.card(S0);
    PR.choose(S0, picks[id]);
  }
  const g = PR.goal(P);
  P.box = g.full;                        // цель закрыта копилкой — так же, как играет бот пролога
  PR.finish(P);
  const S = E.newGame({ seed });
  S.prologue = P;
  PR.applyCarry(S);
  return S;
}
// партия на готовом состоянии: play() создаёт S сам, поэтому подменяем E.newGame на один вызов
function playState(S, years, onDay) {
  const orig = E.newGame;
  E.newGame = function () { return S; };
  try { return play({ level: 'good', seed: S.seed, years, onDay }); }
  finally { E.newGame = orig; }
}

function through(yrs) {
  let bad = 0;
  const ok = (c, w, x) => { if (!c) { bad++; console.log('  \u2717 ' + w + (x ? ' \u2014 ' + x : '')); } else console.log('  \u2713 ' + w + (x ? ' \u2014 ' + x : '')); };
  try { require('../src/threads.js'); } catch (e) { console.log('  (BK.Threads не подключён: ' + e.message + ')'); }
  const T = BK.Threads;
  console.log(`# Сквозные линии: пролог \u2192 главы 2\u20134 \u2192 финал (${yrs} лет)`);
  console.log(`Нити в прогоне: BK.Threads ${T ? 'подключён' : 'НЕ подключён'}. Дилемм пролога: ${BK.PrologV2 ? BK.PrologV2.DIL_IDS.length : 0}.\n`);
  // варианты: тёплый и холодный пролог; в линиях — либо стиль партии, либо прямое прохождение
  // линии до полюса (choice[id] — индекс, применяется только если вариант доступен)
  const VARS = [
    { kind: 'warm', label: 'Тёплый пролог (держал слово, помогал), играет «care»', picks: WARM_PICKS, policy: 'care', walk: { kd1: 0, kd2: 0, kd3: 0, kb1: 0, kb2: 0, kf3: 0, kf4: 0 } },
    { kind: 'cold', label: 'Холодный пролог (по головам, на любые деньги), играет «cold»', picks: COLD_PICKS, policy: 'cold', walk: { kd1: 2, kd2: 2, kd3: 1, kb1: 3, kb2: 1, kf3: 1, kf4: 2 } },
  ];
  const runs = {};
  for (const V of VARS) {
    const seed = V.kind === 'warm' ? 7919 : 7919 * 3;
    const S = prologueState(seed, V.picks);
    const R = ST.state(S);
    ST.wire(S, R);                                     // то же, что делает первый день игры
    const carried = T ? T.list(S) : [];                // нити, доехавшие из пролога
    // что игрок видит заранее: «Требует внимания» (нити + строки линий) до первой сцены
    const att0 = ST.attItems(S).concat(T ? T.attItems(S) : []).map((x) => x.t);
    // цену нити проверяем на копии: зажигаем срок и смотрим срок открытия точки
    let openDays = null;
    if (T && carried.length) {
      const S2 = JSON.parse(JSON.stringify(Object.assign({}, S, { cache: null }))); S2.cache = null;
      const t0 = T.list(S2).filter((t) => !t.done && t.effect && t.effect.openK).sort((a, b) => a.due - b.due)[0];
      if (t0) { S2.day = t0.due; T.fire(S2); T.refresh(S2); openDays = T.openDays(S2, 'ufa'); }
    }
    const items = [];
    let rs = (S.seed | 0) ^ 0x77aa11;
    const rng = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
    const onDay = (St) => {
      if (!CFG.STORY.ON) return;
      const RR = ST.state(St); if (!RR || !RR.pending) return;
      const sc = ST.pendingScene(St); if (!sc) return;
      let idx = null;
      if (V.walk && V.walk[sc.id] != null && eligible(St, RR, sc).indexOf(V.walk[sc.id]) >= 0) idx = V.walk[sc.id];
      if (idx == null) idx = chooseIdx(St, RR, sc, V.policy, rng);
      ST.resolve(St, idx);
      items.push({ id: sc.id, day: St.day, idx: idx, label: (sc.choices[idx] || {}).label || '' });
    };
    const r = playState(S, yrs, onDay);
    const SS = r.S;
    const lineIds = items.filter((x) => /^k[dbfgeo]/.test(x.id) || x.id === 'sf1b').map((x) => x.id);
    runs[V.kind] = { V, S: SS, r, R, items, carried, att0, openDays, lineIds };
    console.log(`## ${V.label}`);
    console.log(`   пролог дал: ${carried.length ? carried.map((t) => `${t.who} (${t.kind}${t.effect && t.effect.openK ? ', ×' + t.effect.openK : ''})`).join('; ') : 'нитей нет'}`);
    console.log(`   флаги линий: ${['lineDamir', 'lineInsp', 'lineDebt', 'lineKin', 'linePaper', 'lineOleg', 'lineLand'].map((k) => `${k}=${R.f[k] || '—'}`).join(' ')}`);
    console.log(`   счёт линий: за людей ${R.f.lineWarm | 0}, по бумагам ${R.f.lineCold | 0}; книга=${R.f.book || '—'}; рядом=${R.f.mateKind || '—'}`);
    if (openDays != null) console.log(`   срок открытия точки после самой ранней нити: ${openDays} дн. (база ${T.base()})`);
    console.log(`   видно заранее: ${att0.length ? att0.join(' \u00b7 ') : '—'}`);
    console.log(`   сцены линий (${lineIds.length}): ${lineIds.join(', ') || '—'}`);
    console.log(`   итог: ${SS.storyEnding ? 'концовка ' + SS.storyEnding : r.lost ? 'банкрот' : r.won ? 'победа ' + r.won.year : 'без финала'} (всего сцен ${items.length}, точек ${SS.stores.filter((x) => x.status !== 'opening').length})`);
    console.log('');
  }
  console.log('# Итог проверки');
  const w = runs.warm, c = runs.cold;
  ok(!!w && !!c, 'обе партии прошли пролог и основную игру');
  if (!w || !c) return bad;
  const dam = (r) => (r.carried.find((t) => /Дамир/.test(t.who)) || {});
  ok(dam(w).kind === 'favor', 'пролог «заменил» → нить Дамира добрая', dam(w).text || '—');
  ok(dam(c).kind === 'grudge', 'пролог «не заменил» → нить Дамира злая', dam(c).text || '—');
  ok(/Дамир/.test(w.att0.join(' ')), 'строку про Дамира видно заранее в «Требует внимания»', w.att0.join(' · '));
  const gri = (r) => (r.carried.find((t) => /Гриша/.test(t.who)) || {});
  ok(gri(w).kind === 'favor' && w.openDays != null && w.openDays < T.base(), 'накормили завсегдатая → точки открываются быстрее', `${w.openDays} вместо ${T.base()}`);
  ok(gri(c).kind === 'grudge' && (c.openDays === 50 || (gri(c).effect && gri(c).effect.openK === 2.4)), 'обидели завсегдатая → точка открывается 50 дней вместо 21', `${c.openDays} дней`);
  ok(w.R.f.lineDamir === 'boss', 'несколько встреч доводят Дамира до управляющего («важный человек»)', String(w.R.f.lineDamir));
  ok(c.R.f.lineDamir === 'thief', 'или до воришки, который подставлял перед Рашидом', String(c.R.f.lineDamir));
  ok(w.lineIds.length >= 12 && c.lineIds.length >= 12, 'сцены линий доходят до главы 4 в обеих партиях', `${w.lineIds.length} и ${c.lineIds.length}`);
  ok(w.R.f.mateKind === 'helper' && w.R.f.mateWork === 'yes', 'честная партия: рядом помощница-экономист (и команда может её не принять)', `${w.R.f.mateKind}/${w.R.f.mateWork}`);
  ok(c.R.f.mateKind === 'tyrant' && c.R.f.mateWork === 'tyrant', 'партия по головам: рядом самодур с деньгами', `${c.R.f.mateKind}/${c.R.f.mateWork}`);
  const pole = w.lineIds.indexOf('kd3') >= 0 && c.lineIds.indexOf('kd3') >= 0;
  ok(pole, 'третья встреча линии Дамира (kd3) приходит в обеих партиях');
  ok(w.S.storyEnding !== c.S.storyEnding, 'сквозные линии меняют финал', `${w.S.storyEnding || '—'} против ${c.S.storyEnding || '—'}`);
  const sf2 = ST.scenes().find((x) => x.id === 'sf2');
  const hasEnd = (book, id) => !!(sf2 && sf2.choices.some((ch) => ch.need && ch.need.flag && ch.need.flag.book === book && (ch.effects || []).some((f) => f.t === 'ending' && f.id === id)));
  ok(!!(BK.STORY.endings.remembered && BK.STORY.endings.ledger), 'новые концовки линий есть в данных');
  ok(hasEnd('warm', 'remembered'), 'счёт линий открывает концовку «Вас помнят»', `книга тёплой партии: ${w.R.f.book}`);
  ok(hasEnd('cold', 'ledger'), 'и концовку «Всё по бумагам»', `книга холодной партии: ${c.R.f.book}`);
  ok((w.R.f.lineWarm | 0) > (c.R.f.lineWarm | 0) && (c.R.f.lineCold | 0) > (w.R.f.lineCold | 0), 'счёт линий различает характеры партий',
    `за людей ${w.R.f.lineWarm | 0}/${c.R.f.lineWarm | 0}, по бумагам ${w.R.f.lineCold | 0}/${c.R.f.lineCold | 0}`);
  console.log(bad ? `  ПРОБЛЕМ: ${bad}` : '  Всё в порядке.');
  return bad;
}

/* ======================= --check ======================= */
function check() {
  let bad = 0;
  const ok = (c, w, x) => { if (!c) { bad++; console.log('  ✗ ' + w + (x ? ' — ' + x : '')); } else console.log('  ✓ ' + w + (x ? ' — ' + x : '')); };
  console.log('# Каркас и данные');
  ok(!!ST, 'BK.Story загружен');
  const scenes = ST.scenes();
  ok(scenes.length > 0, `сцены есть (${scenes.length})`);
  ok(new Set(scenes.map((s) => s.id)).size === scenes.length, 'id сцен уникальны');
  const noChoices = scenes.filter((s) => !(s.choices || []).length);
  ok(noChoices.length === 0, 'у каждой сцены есть варианты', noChoices.map((s) => s.id).join(','));
  const badFx = [];
  for (const s of scenes) for (const c of s.choices || []) for (const f of c.effects || []) if (!f.t) badFx.push(s.id);
  ok(badFx.length === 0, 'у всех эффектов есть тип', badFx.join(','));

  console.log('\n# Реплики героев (src/data/story-lines.js)');
  const CK = BK.STORY;
  if (CK.lines && CK.linesCheck) {
    const probs = CK.linesCheck();
    ok(probs.length === 0, 'тексты реплик заполнены и подстановки верные', probs.slice(0, 3).join('; '));
    const want = ['gulya', 'oleg', 'semyon', 'elvira'];
    ok(want.every((h) => CK.lines[h]), 'есть все четыре героя схемы §9.2', Object.keys(CK.lines).join(', '));
    ok(CK.lines.gulya.quits && CK.lines.gulya.quits.warm && CK.lines.gulya.quits.cold, 'gulya.quits: warm и cold');
    ok(!!CK.lines.gulya.growth && !!CK.lines.gulya.money, 'gulya: growth и money');
    const l1 = CK.lineFor('gulya', 'quits', { rel: 30, n: 4, sum: 180000 });
    const l2 = CK.lineFor('gulya', 'quits', { rel: -40, n: 4, sum: 180000 });
    ok(l1.indexOf('№4') >= 0 && l1.indexOf('180') >= 0, 'подстановки {n} и {sum} работают', l1);
    ok(l1 !== l2, 'тон меняет реплику (тёплый ≠ холодный)');
  } else ok(false, 'BK.STORY.lines подключены');

  console.log('\n# Состояние, сохранения, ГСЧ (docs/story.md §9.3)');
  const off = CFG.STORY.ON;
  CFG.STORY.ON = false;
  const r0 = play({ level: 'good', seed: 7919, years: 1 });
  ok(!r0.S.story, 'выключенный сюжет не создаёт S.story и не тратит случайности');
  CFG.STORY.ON = off;

  const run = runOne({ name: 'good', level: 'good', policy: 'good' }, 7919, 22);
  ok(run.items.length > 0, `сцены показываются и разрешаются (${run.items.length})`);
  const seenN = run.r.S.story ? Object.keys(run.r.S.story.seen).length : 0;
  ok(seenN === run.items.length, 'каждая разрешённая сцена записана в S.story.seen', `${seenN} из ${run.items.length}`);
  ok(run.r.S.story.log.length >= run.items.length, 'записи летописи есть');
  const missedNeed = run.items.filter((x) => !x.needMet);
  ok(missedNeed.length === 0, 'бот выбирает только доступные варианты', missedNeed.map((x) => x.id).join(','));

  let starts = 0, last = null;
  play({
    level: 'good', seed: 7919, years: 6,
    onDay: (S) => { const R = ST.state(S); if (R && R.pending && R.pending.id !== last) { last = R.pending.id; starts++; } },
  });
  ok(starts === 1, 'неразрешённая сцена висит и блокирует следующие', `стартов ${starts}`);

  ok(!run.r.S.story.pending, 'после прогона очередь сцен пуста');
  ok(ST.resolve(run.r.S, 0).ok === false, 'resolve без сцены — отказ');

  const fr = runOne({ name: 'good', level: 'good', policy: 'good' }, 7919, 22, { s25: 1 });
  const s25 = fr.items.find((x) => x.id === 's25');
  ok(!!s25, 'сцена s25 достигнута');
  ok(s25 && s25.idx === 1, 'зафиксированный выбор применён', s25 ? `idx ${s25.idx}` : '—');
  ok(fr.r.S.story.f.lenin === 'no', 'последствие выбора записано во флаги (lenin = no)');

  console.log('\n# Итог');
  console.log(bad ? `ПРОБЛЕМ: ${bad}` : 'Всё в порядке.');
  return bad;
}

/* ======================= запуск ======================= */
const isNum = (v) => v != null && /^\d+$/.test(String(v));
const numOr = (v, d) => (isNum(v) ? +v : d);
module.exports = { runOne, prologueState, branchFixture, branchProfilesFor, WARM_PICKS, COLD_PICKS };
if (require.main === module) {
if (flags.check) {
  process.exitCode = check() ? 1 : 0;
} else if (flags.help) {
  usage();
} else if (flags.allbranches || flags['all-branches'] != null) {
  const fv = flags['all-branches'] !== true ? flags['all-branches'] : (flags.allbranches !== true ? flags.allbranches : null);
  const bs = fv != null ? +fv : (isNum(pos[0]) ? +pos[0] : numOr(pos[1], 4));
  const yrs = fv != null ? numOr(pos[0], 22) : (isNum(pos[0]) ? numOr(pos[1], 22) : numOr(pos[2], 22));
  process.exitCode = allBranches(bs, yrs) ? 1 : 0;
} else if (flags.lines) {
  const sd = isNum(pos[0]) ? +pos[0] : numOr(pos[1], 3);
  const yrs = isNum(pos[0]) ? numOr(pos[1], 22) : numOr(pos[2], 22);
  process.exitCode = lines(yrs, sd) ? 1 : 0;
} else if (flags.through) {
  const yrs = isNum(pos[0]) ? +pos[0] : numOr(pos[1], 20);
  process.exitCode = through(yrs) ? 1 : 0;
} else if (flags.balance) {
  const sd = isNum(pos[0]) ? +pos[0] : numOr(pos[1], 6);
  const yrs = isNum(pos[0]) ? numOr(pos[1], 22) : numOr(pos[2], 22);
  process.exitCode = balance(yrs, sd) ? 1 : 0;
} else if (badToks.length) {
  console.error('Неизвестный профиль: ' + badToks.join(', '));
  console.error('Профили: good, avg, bad, care, risk, pact, cold, random (можно care:avg).');
  process.exitCode = 2;
} else {
  if (!pos.length) usage();
  process.exitCode = report() ? 1 : 0;
}

}
