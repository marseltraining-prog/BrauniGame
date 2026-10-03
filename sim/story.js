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
  if (!need) return true;
  if (need.rel) for (const k of Object.keys(need.rel)) if ((R.rel[k] || 0) < need.rel[k]) return false;
  if (need.meter) for (const k of Object.keys(need.meter)) if ((R.m[k] || 0) < need.meter[k]) return false;
  if (need.flag) for (const k of Object.keys(need.flag)) if (R.f[k] !== need.flag[k]) return false;
  return true;
}
function eligible(S, R, sc) {
  const chs = sc.choices || [];
  const ok = [];
  for (let i = 0; i < chs.length; i++) if (needOk(S, R, chs[i].need)) ok.push(i);
  return ok.length ? ok : chs.map((_, i) => i);
}
function chooseIdx(S, R, sc, policy, rng) {
  const list = eligible(S, R, sc);
  if (!list.length) return 0;
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
  const forcedSeen = {};
  let russiaStart = null;
  let rngState = ((seed | 0) ^ 0x2f6b1) >>> 0;
  const rng = () => { rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 4294967296; };
  const opts = {
    level: prof.level, seed, years: yrs,
    onDay: (S) => {
      if (russiaStart == null && S.corp && S.corp.active) russiaStart = S.day;
      if (!CFG.STORY.ON) return;
      const R = ST.state(S); if (!R || !R.pending) return;
      const sc = ST.pendingScene(S); if (!sc) return;
      const day = S.day;
      const chNow = ST.chapter(S, R);
      let idx, forced = false;
      if (forceMap && forceMap[sc.id] != null) { idx = forceMap[sc.id]; forced = true; forcedSeen[sc.id] = true; }
      else idx = chooseIdx(S, R, sc, prof.policy, rng);
      const nCh = (sc.choices || []).length;
      idx = Math.max(0, Math.min(nCh - 1, idx));
      const res = ST.resolve(S, idx);
      const evIds = (S.ev.recent || []).filter((x) => x.day === day).map((x) => x.id);
      if (S.ev.pending && S.ev.pending.day === day && evIds.indexOf(S.ev.pending.id) < 0) evIds.push(S.ev.pending.id);
      const evSame = evIds.length > 0;
      items.push({
        id: sc.id, day, form: sc.form || 'scene', ch: chNow, idx,
        label: res && res.ok ? res.choice.label : '', out: res && res.ok ? (res.out || []).slice() : [],
        forced, eventSameDay: evSame, evIds, chefSameDay: !!S.chef.pending,
        needMet: needOk(S, R, (sc.choices || [])[idx] && sc.choices[idx].need),
      });
    },
  };
  if (prof.reserve != null) opts.reserve = prof.reserve;
  const r = play(opts);
  const notForced = [];
  if (forceMap) for (const id of Object.keys(forceMap)) if (!forcedSeen[id]) notForced.push(id);
  return { prof, seed, r, items, russiaStart, notForced };
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
function allBranches(branchSeeds, yrs) {
  const scenes = ST.scenes();
  const forceable = scenes.filter((sc) => (sc.choices || []).length >= 2);
  const prof = { name: 'good', level: 'good', policy: 'good', label: 'good' };
  const seenAny = {};
  const rows = [];
  let bad = 0;
  console.log(`Достижимость развилок: перебор каждого варианта на ${branchSeeds} сид(ах) × ${yrs} лет (бот good).`);
  console.log(`Развилок с выбором: ${forceable.length} из ${scenes.length} сцен.\n`);
  for (const sc of forceable) {
    for (let i = 0; i < sc.choices.length; i++) {
      const fm = {}; fm[sc.id] = i;
      const seen = {}, ends = [];
      let reachedForce = false;
      for (let s = 1; s <= branchSeeds; s++) {
        const run = runOne(prof, s * 7919, yrs, fm);
        for (const it of run.items) { seen[it.id] = 1; seenAny[it.id] = 1; if (it.id === sc.id && it.idx === i) reachedForce = true; }
        ends.push(run.r.S.storyEnding || (run.r.lost ? 'банкрот' : null));
      }
      const afterDeps = scenes.filter((x) => { const t = x.trigger || {}; return (t.after && t.after.indexOf(sc.id) >= 0) || (t.afterAny && t.afterAny.indexOf(sc.id) >= 0); }).map((x) => x.id);
      // исход этого варианта (флаги) — какие сцены ждут его через need у своих вариантов
      const produced = {};
      for (const f of sc.choices[i].effects || []) {
        if (f.t === 'flag') produced[f.k] = f.v;
        if (f.t === 'perk') { const p = (BK.STORY.perks || {})[f.id]; if (p && p.flag) produced[p.flag.k] = p.flag.v; }
      }
      const needDeps = scenes.filter((x) => x.id !== sc.id && (x.choices || []).some((c) => c.need && c.need.flag && Object.keys(c.need.flag).every((k) => produced[k] === c.need.flag[k]))).map((x) => x.id);
      const deps = afterDeps.concat(needDeps.filter((d) => afterDeps.indexOf(d) < 0));
      const optionEnds = (sc.choices[i].effects || []).some((f) => f.t === 'ending');
      const gameOverEvery = ends.every((e) => e != null);
      const missing = deps.filter((d) => !seen[d]);
      if (missing.length && !optionEnds && !gameOverEvery) bad++;
      rows.push({
        сцена: sc.id, 'выб.': i, вариант: (sc.choices[i].label || '').slice(0, 44),
        зависит: (afterDeps.join(',') || '—') + (needDeps.length ? ' · need: ' + needDeps.join(',') : ''),
        пришли: optionEnds && missing.length ? 'обрыв игры' : (missing.length ? 'нет: ' + missing.join(',') : 'да'),
        итог: optionEnds ? 'обрыв игры (выбор)' : ends.some((e) => e === 'банкрот') ? 'бывает банкрот' : '—',
        достигнут: reachedForce ? 'да' : 'НЕТ',
      });
    }
  }
  console.table(rows);
  const unseen = scenes.filter((s) => !seenAny[s.id]);
  if (unseen.length) {
    console.log('\nСцены, которых не увидел никто:');
    for (const s of unseen) console.log(`  ✗ ${s.id} «${s.title}»`);
  } else console.log(`\nВсе ${scenes.length} сцен увидены хотя бы в одной ветке.`);
  const missed = rows.filter((r) => r.пришли.startsWith('нет'));
  if (missed.length) {
    console.log('Зависимости, которые не сработали:');
    for (const r of missed) console.log(`  ✗ ${r.сцена}:${r['выб.']} → ${r.пришли}`);
  }
  return bad + unseen.length > 0 ? 1 : 0;
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
  if (!BK.STORY || !BK.STORY.lineOfMonth) { console.log('нет BK.STORY.lineOfMonth — реплики не подключены'); return 1; }
  let bad = 0;
  const ok = (c, w, x) => { if (!c) { bad++; console.log('  ✗ ' + w + (x ? ' — ' + x : '')); } else console.log('  ✓ ' + w + (x ? ' — ' + x : '')); };
  console.log(`# Реплики в отчёте месяца (${sd} сид(ов) × ${yrs} лет)`);
  let all = [], months = 0, dupScene = 0, midMonth = 0, gaps = 0, badText = 0, prevText = null;
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
        const html = BK.STORY.lineHtml(S);                       // так же зовёт панель
        const L = BK.STORY.lineOfMonth(S);
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
