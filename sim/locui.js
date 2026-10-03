/* =====================================================================
   МЕСТНЫЙ СЛОЙ ВНЕ СЮЖЕТА (PLAN.md, «Осталось по работам 04.10.2026») — проверка.

   Что проверяет (ровно то, что доделывалось):
     1. сеть-соперник в интерфейсе — вкладка «Рынок» (BK.Engine.rivalSummary(S).name, то же,
        что печатает BK.Panels.rivalBlock) и сама константа CFG.RIVAL_NAME: в Уфе «Хлебный двор»,
        в Москве «Столичный хлеб», в Казани «Тандыр», в Новосибирске «Хлеб Сибири»;
     2. события e141 (ценовая война) и e142 (переманивание) — заголовок и текст приходят
        из движка (BK.Engine.tick → S.ev.pending) уже местными;
     3. пролог — фраза наставника (сцена П1 из BK.Prologue.card): имя наставника, пекарня
        и улица города партии (в Уфе — Рашид Хайруллин, «Калач», улица Пушкина);
     4. итоги игры — книга Семёна (BK.StoryHistory.book): строка с подписью канала
        («Уфа жуёт» → «Москва жуёт»), имя летописца и упоминания города;
     5. уфимские названия в этих текстах в не-уфимской партии не остаются (код выхода 1).

   Запуск:  node sim/locui.js                 — все 19 городов, отчёт и вердикт
            node sim/locui.js ufa moscow kazan — только перечисленные города
            node sim/locui.js --ref           — эталонный дамп Уфы (для сверки «побайтно прежняя»:
                                                 node sim/locui.js --ref > /tmp/a; … ; diff /tmp/a /tmp/b)
   ===================================================================== */
const BK = require('./load');
const E = BK.Engine;
const C = BK.CFG;
C.STORY.ON = false;              // сюжет не нужен: проверяем вкладку «Рынок», события, пролог, итоги
require('../src/ui/story-history.js'); // книга Семёна и эпилоги — чистая логика без DOM (HAS_DOM-гварды внутри)

const SEED = 20261004;
// уфимские названия, которых в чужом городе быть не должно (по формам, слово целиком)
const UFA_WORDS = ['Уфа', 'Уфы', 'Уфе', 'Уфу', 'Уфой', 'Уф', 'Калач', 'Калача', 'Калаче', 'Калачу', 'Калачом',
  'Хлебный двор', 'Хлебного двора', 'Хлебному двору', 'Хлебным двором', 'Двор', 'Двора', 'Дворе',
  'Семь рек', 'Семи рек', 'Семью реками', 'Семи реках', 'Пушкина', 'Рашид', 'Рашида', 'Рашиду', 'Рашиде',
  'Гуля', 'Гули', 'Гуле', 'Гулю', 'Олег', 'Олега', 'Эльвира', 'Эльвиры', 'Эльвире', 'Эльвиру',
  'Семён Аркадьевич', 'Черниковка', 'Черниковки', 'Сипайлово', 'Проспект Октября', 'эчпочмак'];
const reUfa = new RegExp('(^|[^0-9A-Za-zА-Яа-яЁё])(' + UFA_WORDS.join('|') + ')(?![0-9A-Za-zА-Яа-яЁё])', 'g');
const found = (t) => { reUfa.lastIndex = 0; const out = []; let m; while ((m = reUfa.exec(String(t || ''))) !== null) out.push(m[2]); return [...new Set(out)]; };

const CITIES = (BK.CITIES || []).filter((c) => !c.builtin).map((c) => c.id).concat(['ufa']);
const argv = process.argv.slice(2);
const REF = argv.includes('--ref');
const want = argv.filter((a) => !a.startsWith('--'));
const cities = want.length ? want : (REF ? ['ufa'] : CITIES);

/* ---------------- партия: точка открыта, событие e141 вызвано вручную ---------------- */
function openOne(S) {                       // обычный путь движка: цех → точка → открытие через OPEN_DAYS
  const po = (S.prodOffers || [])[0]; if (!po) return false;
  E.chooseProduction(S, po.id);             // фаза 'play' (иначе tick ничего не делает)
  const o = (S.offers || [])[0]; if (!o) return false;
  if (!E.rentStore(S, o.id).ok) { E.takeLoan(S, E.storeOpenCost(S, o).total - S.cash + 1e6); E.rentStore(S, o.id); }
  for (let i = 0; i < 40 && !(S.stores[0] && S.stores[0].status === 'open'); i++) { S.ev.next = S.day + 100; E.tick(S); }
  return !!(S.stores[0] && S.stores[0].status === 'open');
}
function fire(S, id) {                      // так же, как движок ставит события соперника (rivalMonthly)
  const st = S.stores[0], did = st.district;
  S.ev.pending = null; S.ev.next = S.day + 100; S.ev.nextCrisis = S.day + 1000;
  S.ev.queue.push({ id, day: S.day, tg: id === 'e141' ? { scope: 'district', target: did } : { scope: 'store', target: st.id } });
  E.tick(S);
  return S.ev.pending;
}
function one(city) {
  const S = E.newGame({ seed: SEED, city: city === 'ufa' ? null : city, rival: true });
  const out = { city, rival: null, cfg: null, e141: null, e142: null, mentor: null, book: null, narrator: null, channel: null };
  const r = E.rivalSummary(S);
  out.rival = r ? r.name : null;                   // вкладка «Рынок»
  out.cfg = C.RIVAL_NAME;                          // константа (голос стартового экрана и второго акта)
  if (openOne(S)) {
    const a = fire(S, 'e141'); out.e141 = a ? { title: a.title, text: a.text } : null;
    const b = fire(S, 'e142'); out.e142 = b ? { title: b.title, text: b.text } : null;
  }
  // пролог: сцена П1 (её и читает игрок) — первая карточка
  BK.Prologue.start(S);
  const cv = BK.Prologue.card(S);
  out.mentor = cv ? { title: cv.title, text: cv.text, who: cv.hero && cv.hero.name, role: cv.hero && cv.hero.role } : null;
  // итоги игры: книга Семёна
  const R = (BK.Story && BK.Story.state) ? BK.Story.state(S) : null;
  const h = (BK.Story && BK.Story.history) ? BK.Story.history(S) : {};
  const book = BK.StoryHistory.book(S, R || { rel: {}, f: {} }, h || {});
  out.book = book.lines.join(' ');
  out.chapters = ((h && h.chapters) || []).map((c) => c.name).join(' · '); // «Летопись»: «Уфа на двоих» → местное
  out.narrator = book.lines[0];
  // эпилоги («Где все теперь») — тоже итоги: там деталь «блокнот „Уфа жуёт“» и имена героев
  const eps = BK.StoryHistory.epilogues(R || { rel: {}, f: {} }, S);
  out.epi = eps.map((x) => x.name + ': ' + x.text + (x.at ? '' : ' На стуле — ' + x.detail + '.')).join(' ');
  out.channel = out.epi.split(/[.;]/).filter((x) => /жуёт/.test(x)).join('; ').trim();
  out.channel = (out.channel || (book.lines.concat([book.title, out.epi]).map(found).join(',')) || '—');
  return out;
}

if (REF) {                                        // эталонный дамп Уфы: построчный, для diff
  for (const c of cities) {
    const o = one(c);
    console.log(JSON.stringify(o, null, 1));
  }
  process.exit(0);
}

/* ---------------- свип по всем текстам: что остаётся после подстановки ----------------
   Строгий список — ровно слова из задания (Уфа/Калач/Хлебный двор/Семь рек/Пушкина/Рашид).
   Показываем, сколько их осталось в каждом городе и в каких текстах, — чтобы каждое оставшееся
   упоминание было либо осознанно уфимским (текст, который виден только в Уфе), либо объяснимым. */
const STRICT = ['Уфа', 'Уфы', 'Уфе', 'Уфу', 'Уфой', 'Калач', 'Калача', 'Калаче', 'Калачу',
  'Хлебный двор', 'Хлебного двора', 'Хлебному двору', 'Хлебным двором', 'Семь рек', 'Семи рек',
  'Семью реками', 'Семи реках', 'Пушкина', 'Рашид', 'Рашида', 'Рашиду', 'Рашиде'];
const reStrict = new RegExp('(^|[^0-9A-Za-zА-Яа-яЁё])(' + STRICT.join('|') + ')(?![0-9A-Za-zА-Яа-яЁё])', 'g');
function sweep(city) {
  const S = E.newGame({ seed: SEED, city: city === 'ufa' ? null : city, rival: true });
  const C1 = BK.STORY_CAST, cnt = {}, samples = [];
  for (const t of corpus()) {
    const after = C1.swap(S, t);
    reStrict.lastIndex = 0; let m;
    while ((m = reStrict.exec(after)) !== null) {
      cnt[m[2]] = (cnt[m[2]] || 0) + 1;
      if (samples.length < 3) samples.push(after.slice(Math.max(0, m.index - 40), m.index + 60).replace(/\s+/g, ' '));
    }
  }
  return { cnt, samples };
}

/* ---------------- двойная подстановка: swap(swap(t)) === swap(t) ----------------
   Тексты проходят местный слой и в логике (пролог, стадия 1, события), и на отрисовке
   (src/ui/prologue.js, src/ui/stage1.js) — вторая подстановка не должна портить первую. */
function corpus() {
  const out = [];
  const walk = (o, d) => {
    if (d > 6 || o == null) return;
    if (typeof o === 'string') { if (o.length > 3) out.push(o); return; }
    if (Array.isArray(o)) { for (const x of o) walk(x, d + 1); return; }
    if (typeof o === 'object') { for (const k of Object.keys(o)) walk(o[k], d + 1); }
  };
  walk(BK.EVENTS, 0);
  walk((BK.PrologV2 || {}).STORIES, 0);
  walk((BK.PrologV2 || {}).DILEMMAS, 0);
  walk((BK.Story || {}).letters, 0);
  walk((BK.Story || {}).posts, 0);
  walk((BK.CORP_EVENTS || BK.CorpEv && BK.CorpEv.list), 0);
  return out;
}
function idem(city) {
  const S = E.newGame({ seed: SEED, city: city === 'ufa' ? null : city, rival: true });
  const C1 = BK.STORY_CAST, list = corpus();
  let bad = 0, sample = null;
  for (const t of list) {
    const one = C1.swap(S, t), two = C1.swap(S, one);
    if (one !== two) { bad++; if (!sample) sample = [t.slice(0, 60), one.slice(0, 60), two.slice(0, 60)]; }
  }
  return { n: list.length, bad, sample };
}

/* ---------------- отчёт ---------------- */
let bad = 0;
for (const city of cities) {
  const o = one(city);
  const texts = [o.rival, o.cfg, o.e141 && o.e141.title, o.e141 && o.e141.text, o.e142 && o.e142.title, o.e142 && o.e142.text,
    o.mentor && o.mentor.title, o.mentor && o.mentor.text, o.mentor && o.mentor.who, o.mentor && o.mentor.role, o.book, o.narrator, o.epi, o.chapters];
  const left = [...new Set(texts.flatMap(found))];
  const ufa = city === 'ufa';
  const clash = !ufa && left.length > 0;
  if (clash) bad++;
  const name = (BK.CITY_BY_ID[city] || {}).name || city;
  console.log(`\n=== ${name} (${city}) ===`);
  console.log(`  Рынок: соперник «${o.rival}»   CFG.RIVAL_NAME: «${o.cfg}»`);
  console.log(`  e141: ${o.e141 ? o.e141.title + ' — ' + o.e141.text : 'НЕ СРАБОТАЛО'}`);
  console.log(`  e142: ${o.e142 ? o.e142.title + ' — ' + o.e142.text : 'НЕ СРАБОТАЛО'}`);
  console.log(`  пролог, наставник: ${o.mentor ? o.mentor.who + ' · ' + o.mentor.role : '—'}`);
  console.log(`  пролог, сцена: ${o.mentor ? o.mentor.title + ' — ' + o.mentor.text.slice(0, 180) + '…' : '—'}`);
  console.log(`  итоги (книга Семёна): ${o.narrator}`);
  console.log(`  итоги, эпилоги: ${o.epi}`);
  console.log(`  летопись, главы: ${o.chapters}`);
  console.log(`  канал летописца: ${o.channel}`);
  console.log(`  ${clash ? '✗ остались уфимские названия: ' + left.join(', ') : '✓ уфимских названий нет'}`);
  if (!o.e141 || !o.e142) { bad++; console.log('  ✗ события e141/e142 не сработали'); }
}
// свип по всем текстам: что из строгого списка остаётся после одной подстановки
console.log(`\n# Свип по ${corpus().length} текстам (слова из задания; в Уфе — эталон)`);
for (const city of CITIES) {
  const r = sweep(city);
  const keys = Object.keys(r.cnt).sort();
  const sum = keys.reduce((a, k) => a + r.cnt[k], 0);
  console.log(`  ${(BK.CITY_BY_ID[city] || {}).name || city}: ${keys.length ? keys.map((k) => k + '×' + r.cnt[k]).join(', ') : 'ничего не осталось'}`);
  if (keys.length && city !== 'ufa' && r.samples.length) console.log('     напр.: ' + r.samples[0]);
}
// двойная подстановка (её делают и логика, и отрисовка) — отдельная проверка
const idemBad = [];
for (const city of CITIES) {
  if (city === 'ufa') continue;
  const r = idem(city);
  if (r.bad) idemBad.push(`${city}: ${r.bad} из ${r.n}` + (r.sample ? ` (${r.sample.join(' → ')})` : ''));
}
console.log(`\n# Двойная подстановка (тексты проходят слой дважды: логика + отрисовка)`);
console.log(idemBad.length ? '  ✗ портится: ' + idemBad.join('; ') : `  ✓ идемпотентна во всех ${CITIES.length - 1} городах (${corpus().length} текстов)`);
if (idemBad.length) bad += idemBad.length;
console.log(`\n${bad ? '✗ ЕСТЬ УФИМСКИЕ НАЗВАНИЯ ВНЕ УФЫ: ' + bad + ' (см. выше)' : '✓ везде местные названия, Уфа — как была'}`);
process.exit(bad ? 1 : 0);
